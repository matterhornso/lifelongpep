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

export const POST: APIRoute = async ({ request }) => {
  const sig = request.headers.get("x-razorpay-signature");
  if (!sig) return new Response("missing signature", { status: 400 });

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

  if (evt.event !== "payment.captured" && evt.event !== "payment.authorized") {
    return Response.json({ ok: true, ignored: evt.event });
  }

  const payment = evt.payload.payment.entity;
  const admin = supabaseAdmin();

  // Find booking by order_id
  const { data: booking } = await admin
    .from("bookings")
    .select("id, kind, slot_id, customer_id, consult_mode, doctor_id, recovery_session_id, total_inr")
    .eq("razorpay_order_id", payment.order_id)
    .single();
  if (!booking) {
    return new Response("booking not found for order", { status: 404 });
  }

  await admin
    .from("bookings")
    .update({
      status: "confirmed",
      razorpay_payment_id: payment.id,
    })
    .eq("id", booking.id);

  await admin
    .from("payments")
    .update({ status: payment.status, razorpay_payment_id: payment.id, raw_payload: evt })
    .eq("razorpay_order_id", payment.order_id);

  // Mark slot as booked
  if (booking.slot_id) {
    await admin
      .from("slots")
      .update({ booked: true })
      .eq("id", booking.slot_id);
  }

  // Send confirmation email + .ics (consult bookings only — recovery confirmation is a follow-up)
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
      // Email failure should not bounce the webhook; log and proceed.
      console.error("email send failed", (e as Error).message);
    }
  }

  return Response.json({ ok: true });
};
