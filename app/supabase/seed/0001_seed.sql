-- Seed data — Bangalore launch placeholders.
-- DO NOT ship this to live without replacing with real doctors and real provider partnerships.
-- All names below are placeholders; the customer-facing UI renders specialty + neighborhood only.

-- Doctors (5) -----------------------------------------------
insert into doctors (display_name, specialty, neighborhood, years_post_md, modes, availability, bio_short) values
('Dr. A. Reddy',  'Sports Medicine',    'Indiranagar', 12, array['video','in_person']::consult_mode[], 'soon', 'Sports medicine background; familiar with peptide protocols for recovery and longevity.'),
('Dr. P. Iyer',   'Endocrinology',      'Koramangala', 9,  array['video','in_person']::consult_mode[], 'soon', 'Endocrinology focus; metabolic protocols and HRT-adjacent peptide work.'),
('Dr. S. Menon',  'Internal Medicine',  'HSR',         15, array['video']::consult_mode[],             'soon', 'Internal medicine generalist; second-opinion consults welcome.'),
('Dr. R. Krishna','Geriatrics',         'Whitefield',  18, array['video','in_person']::consult_mode[], 'soon', 'Geriatric and longevity practice; senior-cohort experience.'),
('Dr. N. Bhat',   'Family Medicine',    'Jayanagar',   7,  array['video','in_person']::consult_mode[], 'soon', 'Family medicine; intake consults and longitudinal follow-ups.');

-- Recovery providers (3) ------------------------------------
insert into recovery_providers (display_name, neighborhood) values
('Indiranagar Recovery Studio', 'Indiranagar'),
('Koramangala Cryo Lab',        'Koramangala'),
('HSR Heat & Light',            'HSR');

-- Recovery sessions (linked) --------------------------------
-- The doctor_recommended flag is editorial — set by us, not by individual doctors.

do $$
declare
  s_indr uuid := (select id from recovery_providers where display_name = 'Indiranagar Recovery Studio');
  s_kor  uuid := (select id from recovery_providers where display_name = 'Koramangala Cryo Lab');
  s_hsr  uuid := (select id from recovery_providers where display_name = 'HSR Heat & Light');
begin
  insert into recovery_sessions (provider_id, type, duration_min, price_inr, doctor_recommended) values
  (s_indr, 'sauna',        30, 1200, true),
  (s_indr, 'steam',        20, 900,  false),
  (s_indr, 'salt_bath',    45, 1800, false),
  (s_kor,  'cryotherapy',  10, 2500, true),
  (s_kor,  'red_light',    20, 1500, true),
  (s_hsr,  'sauna',        45, 1600, true),
  (s_hsr,  'red_light',    20, 1400, false),
  (s_hsr,  'steam',        30, 1100, false);
end $$;

-- Empty slot generation is handled by a backfill script the team will run before launch.
-- Slots: 30-minute consult slots, weekdays 09:00–18:00 IST, next 14 days.
-- (Skipped in this seed file to keep it dev-friendly; the doctor list page will show 'soon' until slots exist.)
