import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase.ts";
import { verifyWebhookSignature } from "../../../lib/razorpay.ts";
import { consultIcs } from "../../../lib/ics.ts";
import { sendConsultConfirm } from "../../../lib/email.ts";

interface RazorpayEvent {
  event: string;
  payload: {
    payment: { entity: { id: string; order_id: string; status: string } };
  };
}

const HANDLED_EVENTS = new Set([
  "payment.captured",
  "payment.authorized",
  "payment.failed",
]);

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get("x-razorpay-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

  // Razorpay sets x-razorpay-event-id per delivery attempt; retries reuse the
  // same id, which is exactly the idempotency key we want.
  const eventId = request.headers.get("x-razorpay-event-id");
  if (!eventId) return new Response("missing event id", { status: 400 });

  const raw = await request.text();
  let ok = false;
  try {
    ok = verifyWebhookSignature(raw, sig);
  } catch (e) {
    return new Response(`webhook secret unset: ${(e as Error).message}`, { status: 500 });
  }
  if (!ok) return new Response("invalid signature", { status: 401 });

  let evt: RazorpayEvent;
  try {
    evt = JSON.parse(raw);
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  if (!HANDLED_EVENTS.has(evt.event)) {
    return Response.json({ ok: true, ignored: evt.event });
  }

  const payment = evt.payload.payment.entity;
  const admin = supabaseAdmin();

  // Tombstone insert. PK on event_id; second-delivery retry trips the unique
  // violation and we short-circuit before re-running side effects (email).
  const { error: dedupErr } = await admin
    .from("processed_webhook_events")
    .insert({
      event_id: eventId,
      event_type: evt.event,
      order_id: payment.order_id,
      payment_id: payment.id,
    });
  if (dedupErr) {
    if (dedupErr.code === "23505") {
      return Response.json({ ok: true, duplicate: true });
    }
    return new Response(`failed to record event: ${dedupErr.message}`, { status: 500 });
  }

  const { data: booking } = await admin
    .from("bookings")
    .select(
      "id, kind, slot_id, customer_id, consult_mode, doctor_id, recovery_session_id, total_inr, status",
    )
    .eq("razorpay_order_id", payment.order_id)
    .single();
  if (!booking) {
    return new Response("booking not found for order", { status: 404 });
  }

  if (evt.event === "payment.failed") {
    await admin
      .from("bookings")
      .update({ status: "cancelled", razorpay_payment_id: payment.id })
      .eq("id", booking.id);
    await admin
      .from("payments")
      .update({ status: payment.status, razorpay_payment_id: payment.id, raw_payload: evt })
      .eq("razorpay_order_id", payment.order_id);
    if (booking.slot_id) {
      await admin.rpc("clear_slot_reservation", { p_slot_id: booking.slot_id });
    }
    return Response.json({ ok: true, event: evt.event });
  }

  // payment.captured / payment.authorized: confirm the booking. The partial
  // unique index bookings_one_confirmed_per_slot is the backstop — if another
  // booking on this slot already won, this UPDATE fails with 23505 and we
  // cancel + flag for manual refund instead of confirming both.
  const { error: confirmErr } = await admin
    .from("bookings")
    .update({ status: "confirmed", razorpay_payment_id: payment.id })
    .eq("id", booking.id);
  if (confirmErr) {
    if (confirmErr.code === "23505") {
      await admin
        .from("bookings")
        .update({
          status: "cancelled",
          razorpay_payment_id: payment.id,
          notes: "concurrent slot collision — manual refund required",
        })
        .eq("id", booking.id);
      await admin
        .from("payments")
        .update({ status: payment.status, razorpay_payment_id: payment.id, raw_payload: evt })
        .eq("razorpay_order_id", payment.order_id);
      console.error(
        `slot collision: booking=${booking.id} slot=${booking.slot_id} order=${payment.order_id} — refund pending`,
      );
      return Response.json({ ok: true, collision: true });
    }
    return new Response(`booking confirm failed: ${confirmErr.message}`, { status: 500 });
  }

  await admin
    .from("payments")
    .update({ status: payment.status, razorpay_payment_id: payment.id, raw_payload: evt })
    .eq("razorpay_order_id", payment.order_id);

  if (booking.slot_id) {
    await admin
      .from("slots")
      .update({ booked: true })
      .eq("id", booking.slot_id);
  }

  if (booking.kind === "consult" && booking.slot_id) {
    try {
      const { data: slot } = await admin
        .from("slots")
        .select("starts_at, ends_at")
        .eq("id", booking.slot_id)
        .single();
      const { data: cust } = await admin
        .from("customers")
        .select("email, full_name")
        .eq("id", booking.customer_id)
        .single();
      const { data: doc } = await admin
        .from("doctors")
        .select("neighborhood")
        .eq("id", booking.doctor_id ?? "")
        .single();

      if (slot && cust && doc) {
        const ics = consultIcs({
          bookingId: booking.id,
          startsAt: new Date(slot.starts_at),
          endsAt: new Date(slot.ends_at),
          mode: (booking.consult_mode ?? "video") as "video" | "in_person",
          neighborhood: doc.neighborhood,
          customerEmail: cust.email,
        });
        await sendConsultConfirm({
          to: cust.email,
          name: cust.full_name ?? "there",
          startsAt: new Date(slot.starts_at),
          endsAt: new Date(slot.ends_at),
          mode: (booking.consult_mode ?? "video") as "video" | "in_person",
          neighborhood: doc.neighborhood,
          icsContent: ics,
        });
      }
    } catch (e) {
      // Email failure should not bounce the webhook; the dedup tombstone is
      // already committed, so a Razorpay retry won't resend either. Reconcile
      // missing emails out-of-band.
      console.error("email send failed", (e as Error).message);
    }
  }

  return Response.json({ ok: true });
};
