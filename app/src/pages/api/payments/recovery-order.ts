import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase.ts";
import { createOrder } from "../../../lib/razorpay.ts";

interface Body {
  slot_id: string;
  resource_id: string; // recovery_session_id
  resource_kind: "recovery";
  customer_email: string;
  customer_name: string;
}

export const POST: APIRoute = async ({ request }) => {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.slot_id || !body.resource_id || !body.customer_email || !body.customer_name) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const key_id = import.meta.env.PUBLIC_RAZORPAY_KEY_ID;
  if (!key_id || !import.meta.env.RAZORPAY_KEY_SECRET) {
    return Response.json(
      { error: "Razorpay keys not set. Provision in .env to proceed." },
      { status: 503 },
    );
  }

  const admin = supabaseAdmin();

  const { data: session, error: sErr } = await admin
    .from("recovery_sessions")
    .select("id, price_inr, doctor_recommended")
    .eq("id", body.resource_id)
    .single();
  if (sErr || !session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const cutPercent = Number(import.meta.env.CUT_PERCENT ?? 10);
  const totalInr: number = session.price_inr;
  const cutInr = Math.round((totalInr * cutPercent) / 100);

  const { data: cust, error: custErr } = await admin
    .from("customers")
    .upsert(
      { email: body.customer_email, full_name: body.customer_name },
      { onConflict: "email" },
    )
    .select("id")
    .single();
  if (custErr || !cust) {
    return Response.json(
      { error: `Customer upsert failed: ${custErr?.message}` },
      { status: 500 },
    );
  }

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .insert({
      kind: "recovery",
      recovery_session_id: body.resource_id,
      slot_id: body.slot_id,
      customer_id: cust.id,
      status: "pending_payment",
      total_inr: totalInr,
      cut_inr: cutInr,
    })
    .select("id")
    .single();
  if (bErr || !booking) {
    return Response.json(
      { error: `Booking insert failed: ${bErr?.message}` },
      { status: 500 },
    );
  }

  const order = await createOrder({
    amount_inr: totalInr,
    receipt: `recovery-${booking.id.slice(0, 8)}`,
    notes: { booking_id: booking.id, kind: "recovery" },
  });

  await admin.from("payments").insert({
    booking_id: booking.id,
    razorpay_order_id: order.id,
    amount_inr: totalInr,
    status: "created",
  });
  await admin
    .from("bookings")
    .update({ razorpay_order_id: order.id })
    .eq("id", booking.id);

  return Response.json({
    order_id: order.id,
    booking_id: booking.id,
    amount_inr: totalInr,
    key_id,
  });
};
