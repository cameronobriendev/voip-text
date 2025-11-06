-- BirdText Database Migration 003
-- Add support for phone calls in messages table

-- Add 'call' to message_type enum
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_message_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_message_type_check
  CHECK (message_type IN ('sms', 'voicemail', 'call'));

-- Add call-specific statuses to status enum
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_status_check;
ALTER TABLE messages ADD CONSTRAINT messages_status_check
  CHECK (status IN ('sent', 'delivered', 'failed', 'read', 'no-answer', 'busy', 'rejected', 'completed'));

-- Note: voicemail_duration column can be reused for call_duration (already exists)
-- No additional columns needed

-- Add index for call type queries
CREATE INDEX IF NOT EXISTS idx_messages_type ON messages(message_type);
