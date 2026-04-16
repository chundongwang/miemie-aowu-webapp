-- Fix data corruption from migration 0004.
-- The table recreation had is_public in the wrong position, so SELECT * mapped
-- old created_at timestamps into is_public, and old is_public (0) into updated_at.
--
-- Reset is_public to 0 (private) for all lists.
-- Fix updated_at rows that ended up as 0 (received old is_public value).

UPDATE lists SET is_public = 0;
UPDATE lists SET updated_at = created_at WHERE updated_at = 0 OR updated_at < 1000000000;
