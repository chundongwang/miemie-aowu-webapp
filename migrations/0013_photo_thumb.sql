-- Migration: 0013_photo_thumb
-- Adds optional thumbnail r2 key for item photos

ALTER TABLE item_photos ADD COLUMN thumb_r2_key TEXT;
