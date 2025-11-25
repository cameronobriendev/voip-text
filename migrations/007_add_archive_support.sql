-- Add archive support to contacts
-- Migration: 007_add_archive_support.sql

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE;

-- Add index for filtering archived conversations
CREATE INDEX IF NOT EXISTS idx_contacts_is_archived ON contacts(is_archived);

-- Update any existing NULL values to FALSE
UPDATE contacts SET is_archived = FALSE WHERE is_archived IS NULL;
