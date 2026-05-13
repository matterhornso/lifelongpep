import ical from "ical-generator";

export interface ConsultEvent {
  bookingId: string;
  startsAt: Date;
  endsAt: Date;
  mode: "video" | "in_person";
  neighborhood: string;
  joinUrl?: string;
  customerEmail: string;
}

export function consultIcs(e: ConsultEvent): string {
  const cal = ical({
    name: "lifelongpep consult",
    prodId: { company: "lifelongpep", product: "booking" },
  });
  const location =
    e.mode === "video" ? "Video consult" : `In person — ${e.neighborhood}`;
  const description =
    e.mode === "video"
      ? `Join link: ${e.joinUrl ?? "(will be emailed 1 hour before)"}\n\nCancel: reply to hello@lifelongpep.fit.`
      : `Address details emailed separately.\n\nCancel: reply to hello@lifelongpep.fit.`;
  cal.createEvent({
    start: e.startsAt,
    end: e.endsAt,
    summary: "Longevity consult — lifelongpep",
    description,
    location,
    organizer: { name: "lifelongpep", email: "hello@lifelongpep.fit" },
    attendees: [{ email: e.customerEmail }],
    url: e.joinUrl,
    id: e.bookingId,
  });
  return cal.toString();
}
