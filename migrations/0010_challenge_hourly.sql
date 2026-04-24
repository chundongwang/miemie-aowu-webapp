-- Add period_str to track hourly word (e.g. "2026-04-22-14").
-- date_str stays for day-level streak calculation.
ALTER TABLE challenge_results ADD COLUMN period_str TEXT;
UPDATE challenge_results SET period_str = date_str || '-00';
