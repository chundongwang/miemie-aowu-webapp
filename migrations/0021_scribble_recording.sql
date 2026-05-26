-- Migration: 0021_scribble_recording
-- Animated scribble replay: store a JSON recording of stroke timing in R2
-- alongside the rendered PNG. NULL means "no recording" — fall back to the
-- static image (legacy rows and any future upload failure both hit this path).

ALTER TABLE scribbles ADD COLUMN recording_r2_key TEXT;
