// Shared TypeScript types for Textable

export interface User {
  id: string;
  username: string;
  password_hash: string;
  email: string;
  created_at: string;
}

export interface Contact {
  id: string;
  name: string;
  phone_number: string;
  avatar_color: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  direction: 'inbound' | 'outbound';
  message_type: 'sms' | 'voicemail';
  content: string;

  // Voicemail-specific fields
  voicemail_blob_url?: string;
  voicemail_duration?: number;
  voicemail_confidence?: number;

  // Phone numbers
  phone_from: string;
  phone_to: string;

  // Attribution
  sent_by?: string; // Username who sent (outbound only)

  // Tracking
  status: 'sent' | 'delivered' | 'failed' | 'read';
  created_at: string;
  read_at?: string;
}

// API Request/Response types

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  user?: {
    id: string;
    username: string;
    email: string;
  };
  error?: string;
}

export interface SendMessageRequest {
  contact_id: string;
  message: string;
}

export interface SendMessageResponse {
  success: boolean;
  message?: Message;
  error?: string;
}

// Webhook types

export interface VoipMsSmsWebhook {
  to: string;
  from: string;
  msg: string;
  media?: string;
  id: string;
}

export interface ResendEmailWebhook {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{
    filename: string;
    content: string; // base64
    contentType: string;
  }>;
}

export interface VoicemailData {
  phone_from: string;
  phone_to: string;
  transcription: string;
  duration: number;
  confidence: number;
  mp3_content: string; // base64
}

// Utility types

export interface ConversationWithContact {
  contact: Contact;
  messages: Message[];
  unread_count: number;
}

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}
