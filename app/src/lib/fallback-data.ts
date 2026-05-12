// Fallback data — used when Supabase env vars are not configured (local dev).
// In production, the same shape is loaded from the seeded Supabase rows.
// Anonymized: NEVER expose display_name to the customer-facing pages.

import type {
  Doctor,
  RecoveryProvider,
  RecoverySession,
  RecoveryType,
  Neighborhood,
} from "./types.ts";

export const FALLBACK_DOCTORS: Doctor[] = [
  {
    id: "fb-doc-1",
    specialty: "Sports Medicine",
    neighborhood: "Indiranagar",
    years_post_md: 12,
    modes: ["video", "in_person"],
    availability: "soon",
    bio_short:
      "Sports medicine background; familiar with peptide protocols for recovery and longevity.",
  },
  {
    id: "fb-doc-2",
    specialty: "Endocrinology",
    neighborhood: "Koramangala",
    years_post_md: 9,
    modes: ["video", "in_person"],
    availability: "soon",
    bio_short:
      "Endocrinology focus; metabolic protocols and HRT-adjacent peptide work.",
  },
  {
    id: "fb-doc-3",
    specialty: "Internal Medicine",
    neighborhood: "HSR",
    years_post_md: 15,
    modes: ["video"],
    availability: "soon",
    bio_short:
      "Internal medicine generalist; second-opinion consults welcome.",
  },
  {
    id: "fb-doc-4",
    specialty: "Geriatrics",
    neighborhood: "Whitefield",
    years_post_md: 18,
    modes: ["video", "in_person"],
    availability: "soon",
    bio_short:
      "Geriatric and longevity practice; senior-cohort experience.",
  },
  {
    id: "fb-doc-5",
    specialty: "Family Medicine",
    neighborhood: "Jayanagar",
    years_post_md: 7,
    modes: ["video", "in_person"],
    availability: "soon",
    bio_short:
      "Family medicine; intake consults and longitudinal follow-ups.",
  },
];

interface RecoveryProviderWithSessions {
  id: string;
  display_name: string;
  neighborhood: Neighborhood;
  sessions: Array<{
    id: string;
    type: RecoveryType;
    duration_min: number;
    price_inr: number;
    doctor_recommended: boolean;
  }>;
}

export const FALLBACK_RECOVERY: RecoveryProviderWithSessions[] = [
  {
    id: "fb-rec-1",
    display_name: "Indiranagar Recovery Studio",
    neighborhood: "Indiranagar",
    sessions: [
      { id: "fb-s-1", type: "sauna", duration_min: 30, price_inr: 1200, doctor_recommended: true },
      { id: "fb-s-2", type: "steam", duration_min: 20, price_inr: 900, doctor_recommended: false },
      { id: "fb-s-3", type: "salt_bath", duration_min: 45, price_inr: 1800, doctor_recommended: false },
    ],
  },
  {
    id: "fb-rec-2",
    display_name: "Koramangala Cryo Lab",
    neighborhood: "Koramangala",
    sessions: [
      { id: "fb-s-4", type: "cryotherapy", duration_min: 10, price_inr: 2500, doctor_recommended: true },
      { id: "fb-s-5", type: "red_light", duration_min: 20, price_inr: 1500, doctor_recommended: true },
    ],
  },
  {
    id: "fb-rec-3",
    display_name: "HSR Heat & Light",
    neighborhood: "HSR",
    sessions: [
      { id: "fb-s-6", type: "sauna", duration_min: 45, price_inr: 1600, doctor_recommended: true },
      { id: "fb-s-7", type: "red_light", duration_min: 20, price_inr: 1400, doctor_recommended: false },
      { id: "fb-s-8", type: "steam", duration_min: 30, price_inr: 1100, doctor_recommended: false },
    ],
  },
];

// Generate placeholder 30-minute slots for the next 14 weekdays, 09:00–18:00 IST.
// In production these come from `slots` table.
export function placeholderSlots(opts: {
  ownerId: string;
  days?: number;
  startHour?: number;
  endHour?: number;
  intervalMin?: number;
}): Array<{ id: string; starts_at: string; ends_at: string; booked: boolean }> {
  const days = opts.days ?? 14;
  const startHour = opts.startHour ?? 9;
  const endHour = opts.endHour ?? 18;
  const interval = opts.intervalMin ?? 30;
  const slots: Array<{ id: string; starts_at: string; ends_at: string; booked: boolean }> = [];
  const now = new Date();
  for (let d = 0; d < days; d++) {
    const day = new Date(now);
    day.setDate(day.getDate() + d + 1); // start from tomorrow
    if (day.getDay() === 0 || day.getDay() === 6) continue; // skip weekends
    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += interval) {
        const start = new Date(day);
        start.setHours(h, m, 0, 0);
        const end = new Date(start.getTime() + interval * 60_000);
        slots.push({
          id: `${opts.ownerId}-${start.toISOString()}`,
          starts_at: start.toISOString(),
          ends_at: end.toISOString(),
          booked: Math.random() < 0.15, // 15% appear "taken" for realism
        });
      }
    }
  }
  return slots;
}
