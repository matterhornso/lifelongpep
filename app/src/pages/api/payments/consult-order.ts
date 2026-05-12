import type { APIRoute } from "astro";
import { supabaseAdmin } from "../../../lib/supabase.ts";
import { createOrder } from "../../../lib/razorpay.ts";
import { CONSULT_FEE_INR } from "../../../lib/types.ts";

interface Body {
  slot_id: string;
  resource_id: string; // doctor_id
  resource_kind: "consult";
  consult_mode: "video" | "in_person";
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

  if (
    !body.slot_id ||
    !body.resource_id ||
    !body.customer_email ||
    !body.customer_name ||
    !body.consult_mode
  ) {
    return Response.json({ error: "Missing fields" }, { status: 400 });
  }

  const key_id = import.meta.env.PUBLIC_RAZORPAY_KEY_ID;
  if (!key_id || !import.meta.env.RAZORPAY_KEY_SECRET) {
    // Allow the booking-flow to be exercised in dev without keys.
    return Response.json(
      {
        error:
          "Razorpay test keys not set. Provision them in .env (PUBLIC_RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET) to proceed.",
      },
      { status: 503 },
    );
  }

  // Look up or create the customer + booking. If Supabase isn't configured this throws — caller sees 500.
  const admin = supabaseAdmin();

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
      kind: "consult",
      doctor_id: body.resource_id,
      slot_id: body.slot_id,
      customer_id: cust.id,
      consult_mode: body.consult_mode,
      status: "pending_payment",
      total_inr: CONSULT_FEE_INR,
      cut_inr: 0,
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
    amount_inr: CONSULT_FEE_INR,
    receipt: `consult-${booking.id.slice(0, 8)}`,
    notes: { booking_id: booking.id, kind: "consult" },
  });

  await admin.from("payments").insert({
    booking_id: booking.id,
    razorpay_order_id: order.id,
    amount_inr: CONSULT_FEE_INR,
    status: "created",
  });
  await admin
    .from("bookings")
    .update({ razorpay_order_id: order.id })
    .eq("id", booking.id);

  return Response.json({
    order_id: order.id,
    booking_id: booking.id,
    amount_inr: CONSULT_FEE_INR,
    key_id,
  });
};
