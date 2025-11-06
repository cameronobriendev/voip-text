-- Migration: Add timezone support to all timestamp columns
-- Converts TIMESTAMP to TIMESTAMPTZ for proper timezone handling
--
-- Why: TIMESTAMP stores date/time WITHOUT timezone info
--      TIMESTAMPTZ stores date/time WITH timezone info (in UTC)
--      This prevents timezone confusion and DST issues

-- Users table
ALTER TABLE users
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC';

-- Contacts table
ALTER TABLE contacts
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN updated_at TYPE TIMESTAMPTZ USING updated_at AT TIME ZONE 'UTC';

-- Messages table
ALTER TABLE messages
  ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at AT TIME ZONE 'UTC',
  ALTER COLUMN read_at TYPE TIMESTAMPTZ USING read_at AT TIME ZONE 'UTC';

-- Verify changes
-- Run: \d users
-- Run: \d contacts
-- Run: \d messages
-- All timestamp columns should now show "timestamp with time zone"
