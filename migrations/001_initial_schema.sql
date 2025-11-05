-- BirdText Database Schema
-- Initial migration for users, contacts, and messages

-- Users table (Cameron and Kacy)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Contacts table (shared contacts)
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  phone_number VARCHAR(20) UNIQUE NOT NULL,
  avatar_color VARCHAR(7) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table (SMS and voicemail)
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type VARCHAR(10) NOT NULL CHECK (message_type IN ('sms', 'voicemail')),
  content TEXT NOT NULL,

  -- Voicemail-specific fields
  voicemail_blob_url VARCHAR(500),
  voicemail_duration INTEGER,
  voicemail_confidence DECIMAL(5,2),

  -- Phone numbers
  phone_from VARCHAR(20) NOT NULL,
  phone_to VARCHAR(20) NOT NULL,

  -- Attribution (who sent outbound messages)
  sent_by VARCHAR(50),

  -- Tracking
  status VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'delivered', 'failed', 'read')),
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_contact_created ON messages(contact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);

-- Create default users (Cameron and Kacy)
-- Password: 'birdtext123' (CHANGE THIS AFTER FIRST LOGIN)
-- Hash generated using PBKDF2 with salt
INSERT INTO users (username, password_hash, email) VALUES
  ('cameron', '3b4aef7557339de8f59e295a8e8aaa48:cd88ca593286e89d6070336ab92226092528dd28cabcb8c6031064fff6ac7df8e1eec0acdbdc17d7439a43d07e7cc1c607178c58fa6ad048b9505b1481eaefcc', 'cameron@birdmail.ca'),
  ('kacy', '25000043626b629b299ff39fe44200f2:fd0a60daa0aafa65d4efc1fb8fcedf97d07abe2c74a066ad7b51710df1ee42bd177c9faf8d9eaee2686de695ad91d91dfbfbee5185f8a02cca5d2277ef067488', 'kacy@birdmail.ca')
ON CONFLICT (username) DO NOTHING;

-- Sample contact for testing
INSERT INTO contacts (name, phone_number, avatar_color, notes) VALUES
  ('Test Contact', '+15551234567', '#4A90E2', 'Sample contact for testing')
ON CONFLICT (phone_number) DO NOTHING;
