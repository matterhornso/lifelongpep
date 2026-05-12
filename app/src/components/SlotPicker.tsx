import { useMemo, useState } from "react";

interface Slot {
  id: string;
  starts_at: string;
  ends_at: string;
  booked: boolean;
}

interface Props {
  slots: Slot[];
  modes?: Array<"video" | "in_person">;
  endpoint: string; // POST endpoint that creates the order
  resourceId: string; // doctor_id OR recovery_session_id
  resourceKind: "consult" | "recovery";
  amountInr: number;
  cutInr: number;
  razorpayKey?: string;
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export default function SlotPicker(props: Props) {
  const { slots, modes, endpoint, resourceId, resourceKind, amountInr, cutInr, razorpayKey } = props;

  const days = useMemo(() => {
    const m = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = dayKey(s.starts_at);
      const arr = m.get(k) ?? [];
      arr.push(s);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [slots]);

  const [dayIdx, setDayIdx] = useState(0);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [mode, setMode] = useState<"video" | "in_person">(
    modes?.[0] ?? "video",
  );
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDay = days[dayIdx];
  const slotsForDay = currentDay ? currentDay[1] : [];

  async function onBook() {
    setError(null);
    if (!slotId) {
      setError("Pick a time first.");
      return;
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
      setError("Enter a valid email.");
      return;
    }
    if (!name.trim()) {
      setError("Enter your name.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slot_id: slotId,
          resource_id: resourceId,
          resource_kind: resourceKind,
          consult_mode: resourceKind === "consult" ? mode : undefined,
          customer_email: email,
          customer_name: name,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `Order create failed (${res.status})`);
      }
      const data: {
        order_id: string;
        booking_id: string;
        amount_inr: number;
        key_id: string;
      } = await res.json();

      const key = razorpayKey ?? data.key_id;
      if (!key) {
        setError(
          "Razorpay key missing — set PUBLIC_RAZORPAY_KEY_ID. Booking saved as pending.",
        );
        return;
      }

      const w = window as unknown as { Razorpay?: new (opts: unknown) => { open: () => void } };
      if (!w.Razorpay) {
        // Lazy-load the Razorpay checkout script if not present.
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://checkout.razorpay.com/v1/checkout.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Could not load Razorpay checkout."));
          document.head.appendChild(s);
        });
      }
      const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay({
        key,
        order_id: data.order_id,
        amount: data.amount_inr * 100,
        currency: "INR",
        name: "lifelongpep",
        description:
          resourceKind === "consult" ? "Longevity consult" : "Recovery session",
        prefill: { email, name },
        theme: { color: "#5C2E2E" },
        handler: () => {
          window.location.href = `/confirm/${data.booking_id}`;
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      rzp.open();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (days.length === 0) {
    return (
      <div className="notice">
        No slots available yet. Check back in a few days, or email{" "}
        <a href="mailto:hello@lifelongpep.fit">hello@lifelongpep.fit</a> for an earlier slot.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Mode toggle */}
      {resourceKind === "consult" && modes && modes.length > 1 && (
        <div className="flex flex-col gap-2">
          <span className="label">Consult mode</span>
          <div className="toggle">
            {modes.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => setMode(m)}
              >
                {m === "video" ? "Video" : "In person"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Day tabs */}
      <div className="flex flex-col gap-2">
        <span className="label">Pick a day</span>
        <div className="day-tabs">
          {days.map(([k], i) => (
            <button
              key={k}
              type="button"
              className="day-tab"
              aria-pressed={i === dayIdx}
              onClick={() => {
                setDayIdx(i);
                setSlotId(null);
              }}
            >
              {formatDayLabel(k)}
            </button>
          ))}
        </div>
      </div>

      {/* Slot grid */}
      <div className="flex flex-col gap-2">
        <span className="label">Pick a time (IST)</span>
        <div className="slots">
          {slotsForDay.map((s) => (
            <button
              key={s.id}
              type="button"
              className="slot"
              aria-pressed={slotId === s.id}
              disabled={s.booked}
              onClick={() => setSlotId(s.id)}
            >
              {formatTime(s.starts_at)}
            </button>
          ))}
        </div>
      </div>

      {/* Contact fields */}
      <div className="flex flex-col gap-3" style={{ maxWidth: "420px" }}>
        <label className="flex flex-col gap-2">
          <span className="label">Your name</span>
          <input
            className="input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="As it should appear on the booking"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="label">Email</span>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </label>
      </div>

      {/* Line items */}
      <ul className="line-items" style={{ maxWidth: "420px" }}>
        <li>
          <span className="label-l">
            {resourceKind === "consult" ? "Consult fee" : "Session fee"}
          </span>
          <span className="value">₹{amountInr.toLocaleString("en-IN")}</span>
        </li>
        {resourceKind === "recovery" && (
          <li>
            <span className="label-l">Our cut</span>
            <span className="value">₹{cutInr.toLocaleString("en-IN")}</span>
          </li>
        )}
        <li className="total">
          <span className="label-l">Total today</span>
          <span className="value">₹{amountInr.toLocaleString("en-IN")}</span>
        </li>
      </ul>

      {error && (
        <p style={{ color: "var(--error)", fontSize: "14px" }}>{error}</p>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={onBook}
        disabled={submitting}
      >
        {submitting ? "Working…" : `Confirm and pay ₹${amountInr.toLocaleString("en-IN")}`}
      </button>

      <p className="muted ui" style={{ fontSize: "13px" }}>
        Razorpay opens to capture payment. Free to cancel any time before the slot.
      </p>
    </div>
  );
}
