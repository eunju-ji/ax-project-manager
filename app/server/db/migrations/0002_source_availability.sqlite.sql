-- SQLite ADD COLUMN can enforce a table-wide CHECK without rebuilding an FK parent.
ALTER TABLE sources ADD COLUMN availability_guard INTEGER NOT NULL DEFAULT 1
CHECK (availability IN ('available','unknown','access_denied','moved','deleted','trashed'));
