-- Future PB assignments use screenshot builds. Existing historical references
-- remain recorded; NOT VALID avoids rewriting old battle history.
ALTER TABLE pb_signups DROP CONSTRAINT IF EXISTS pb_signups_build_id_fkey;
ALTER TABLE pb_signups ADD CONSTRAINT pb_signups_build_id_fkey
 FOREIGN KEY(build_id) REFERENCES build_library_entries(id) ON DELETE SET NULL NOT VALID;
