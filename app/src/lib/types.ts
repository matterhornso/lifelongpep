export type Neighborhood =
  | "Indiranagar"
  | "Koramangala"
  | "HSR"
  | "Whitefield"
  | "Jayanagar";

export const NEIGHBORHOODS: Neighborhood[] = [
  "Indiranagar",
  "Koramangala",
  "HSR",
  "Whitefield",
  "Jayanagar",
];

export type Specialty =
  | "Sports Medicine"
  | "Endocrinology"
  | "Internal Medicine"
  | "Geriatrics"
  | "Family Medicine";

export type ConsultMode = "video" | "in_person";

export interface Doctor {
  id: string;
  specialty: Specialty;
  neighborhood: Neighborhood;
  years_post_md: number;
  modes: ConsultMode[];
  availability: "live" | "soon" | "off";
  bio_short: string;
}

export type RecoveryType =
  | "sauna"
  | "steam"
  | "cryotherapy"
  | "red_light"
  | "salt_bath";

export const RECOVERY_LABELS: Record<RecoveryType, string> = {
  sauna: "Sauna",
  steam: "Steam",
  cryotherapy: "Cryotherapy",
  red_light: "Red light therapy",
  salt_bath: "Salt bath",
};

export interface RecoveryProvider {
  id: string;
  display_name: string;
  neighborhood: Neighborhood;
  sessions: RecoverySession[];
}

export interface RecoverySession {
  id: string;
  provider_id: string;
  type: RecoveryType;
  duration_min: number;
  price_inr: number;
  doctor_recommended: boolean;
}

export interface Slot {
  id: string;
  starts_at: string; // ISO
  ends_at: string;
  booked: boolean;
}

export interface Booking {
  id: string;
  kind: "consult" | "recovery";
  doctor_id?: string;
  recovery_session_id?: string;
  slot_id: string;
  customer_email: string;
  customer_name: string;
  consult_mode?: ConsultMode;
  status: "pending_payment" | "confirmed" | "cancelled";
  total_inr: number;
  cut_inr: number;
}

export const CONSULT_FEE_INR = 2500;
