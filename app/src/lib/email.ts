import { Resend } from "resend";

const apiKey = import.meta.env.RESEND_API_KEY;
const fromEmail = import.meta.env.RESEND_FROM_EMAIL || "hello@lifelongpep.fit";

export function resendClient() {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY missing in env.");
  }
  return new Resend(apiKey);
}

export interface ConsultConfirmEmail {
  to: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  mode: "video" | "in_person";
  neighborhood: string;
  joinUrl?: string;
  icsContent: string;
}

export async function sendConsultConfirm(input: ConsultConfirmEmail) {
  const client = resendClient();
  const when = input.startsAt.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  const modeLine =
    input.mode === "video"
      ? `Video consult. Join link: ${input.joinUrl ?? "(will be emailed 1 hour before)"}`
      : `In person at our ${input.neighborhood} practice.`;

  const text = [
    `Hi ${input.name},`,
    "",
    `Your consult is booked: ${when} IST (30 minutes).`,
    modeLine,
    "",
    "Free cancellation any time before the consult — reply to this email.",
    "",
    "— lifelongpep",
    "Doctors prescribe. Pharmacies dispense. We orchestrate.",
  ].join("\n");

  return client.emails.send({
    from: `lifelongpep <${fromEmail}>`,
    to: input.to,
    subject: `Your consult is booked — ${when} IST`,
    text,
    attachments: [
      {
        filename: "consult.ics",
        content: Buffer.from(input.icsContent).toString("base64"),
      },
    ],
  });
}
