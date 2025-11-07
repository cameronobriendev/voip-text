-- Add spam support to contacts
-- Migration: 004_add_spam_support.sql

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_spam BOOLEAN DEFAULT FALSE;

-- Add index for filtering spam
CREATE INDEX IF NOT EXISTS idx_contacts_is_spam ON contacts(is_spam);

-- Update any existing NULL values to FALSE
UPDATE contacts SET is_spam = FALSE WHERE is_spam IS NULL;
