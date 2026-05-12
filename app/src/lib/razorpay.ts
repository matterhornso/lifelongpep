import Razorpay from "razorpay";
import crypto from "node:crypto";

const keyId = import.meta.env.PUBLIC_RAZORPAY_KEY_ID;
const keySecret = import.meta.env.RAZORPAY_KEY_SECRET;

export function razorpayClient() {
  if (!keyId || !keySecret) {
    throw new Error(
      "Razorpay keys missing. Set PUBLIC_RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode) in .env.",
    );
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

export interface OrderInput {
  amount_inr: number; // rupees
  receipt: string;
  notes: Record<string, string>;
}

export async function createOrder(input: OrderInput) {
  const client = razorpayClient();
  const order = await client.orders.create({
    amount: Math.round(input.amount_inr * 100), // paise
    currency: "INR",
    receipt: input.receipt,
    notes: input.notes,
  });
  return order;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
): boolean {
  const secret = import.meta.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET missing.");
  }
  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(signature),
  );
}

export function verifyPaymentSignature(args: {
  order_id: string;
  payment_id: string;
  signature: string;
}): boolean {
  if (!keySecret) throw new Error("RAZORPAY_KEY_SECRET missing.");
  const body = `${args.order_id}|${args.payment_id}`;
  const expected = crypto
    .createHmac("sha256", keySecret)
    .update(body)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected),
    Buffer.from(args.signature),
  );
}
