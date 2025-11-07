-- Migration 005: Add AI reply draft preferences to contacts
-- Date: 2025-11-07
-- Description: Adds relationship and tone preference columns for AI-powered reply generation

-- Add AI preference columns to contacts table
ALTER TABLE contacts
ADD COLUMN ai_relationship TEXT,
ADD COLUMN ai_tone_preference TEXT;

-- Add comments for documentation
COMMENT ON COLUMN contacts.ai_relationship IS 'User-defined relationship context for AI reply generation (e.g., "close friend", "work colleague")';
COMMENT ON COLUMN contacts.ai_tone_preference IS 'User-defined tone preference for AI reply generation (e.g., "warm and friendly", "brief and professional")';

-- No default values needed - these are optional and user-defined
