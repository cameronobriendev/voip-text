-- Add column to track voip.ms voicemail message numbers
-- This prevents us from processing the same voicemail multiple times

ALTER TABLE messages
ADD COLUMN IF NOT EXISTS voicemail_message_num VARCHAR(20);

-- Add index for faster lookups when checking existing voicemails
CREATE INDEX IF NOT EXISTS idx_messages_voicemail_num
ON messages(voicemail_message_num)
WHERE voicemail_message_num IS NOT NULL;

-- Add comment
COMMENT ON COLUMN messages.voicemail_message_num IS 'voip.ms message_num identifier for voicemails';
