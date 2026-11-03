-- Member-submitted Discord role icons are stored as normalized small PNG data URIs.
ALTER TABLE custom_role_requests ADD COLUMN IF NOT EXISTS icon_data text;
