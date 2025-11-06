import type { VercelRequest, VercelResponse } from '@vercel/node';
import { put } from '@vercel/blob';
import { getDB } from '../../db/client.js';
import { formatPhoneE164, displayPhoneNumber, generateAvatarColor } from '../../../utils/phone.js';
import type { Contact, Message, ResendEmailWebhook } from '../../../types/index.js';

/**
 * Parse voicemail data from email text
 * Example format:
 * From: "Name" <6475583343> on Monday, November 03, 2025 at 04:06:05 PM, duration: 0:00:06
 * ...
 * Below is the message transcription you requested:
 * Locale: en-CA
 * Confidence: 73.8
 * Message:
 * This Will Cameron, it's, uh, Dominic here...
 */
function parseVoicemailEmail(emailText: string) {
  // Extract phone number from "From: "Name" <phone>" format
  const phoneMatch = emailText.match(/From:\s*"[^"]*"\s*<(\d+)>/);
  const phoneNumber = phoneMatch ? phoneMatch[1] : null;

  // Extract duration from "duration: 0:00:06" format
  const durationMatch = emailText.match(/duration:\s*(\d+):(\d+):(\d+)/);
  let durationSeconds = 0;
  if (durationMatch) {
    const hours = parseInt(durationMatch[1]);
    const minutes = parseInt(durationMatch[2]);
    const seconds = parseInt(durationMatch[3]);
    durationSeconds = hours * 3600 + minutes * 60 + seconds;
  }

  // Extract confidence score
  const confidenceMatch = emailText.match(/Confidence:\s*([\d.]+)/);
  const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : null;

  // Extract transcription (everything after "Message:" until end)
  const messageMatch = emailText.match(/Message:\s*(.+)/s);
  const transcription = messageMatch ? messageMatch[1].trim() : '';

  return {
    phoneNumber,
    durationSeconds,
    confidence,
    transcription,
  };
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Resend sends webhook with data nested under 'data' property
    const { data } = req.body;

    if (!data || !data.from || !data.subject) {
      console.error('Invalid webhook payload:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
      });
    }

    const { from, subject, text, html, attachments } = data;

    console.log('Received voicemail webhook:', {
      from,
      subject,
      hasText: !!text,
      hasHtml: !!html,
      textLength: text?.length || 0,
      htmlLength: html?.length || 0,
      attachmentsCount: attachments?.length || 0,
      dataKeys: Object.keys(data)
    });

    // Only process emails from voip.ms voicemail system or cameron@birdmail.ca (for testing)
    const allowedSenders = ['noreply@voipinterface.net', 'cameron@birdmail.ca'];
    const isAllowedSender = allowedSenders.some(allowed => from.includes(allowed));

    if (!isAllowedSender) {
      console.log('Ignoring email from non-voicemail sender:', from);
      return res.status(200).json({
        success: true,
        message: 'Email ignored (not from voicemail system)',
      });
    }

    // Parse voicemail data from email body
    const emailText = text || html || '';

    if (!emailText) {
      console.error('Email body is empty. Available data:', Object.keys(data));
      return res.status(400).json({
        success: false,
        error: 'Email body is empty - check Resend inbound settings',
      });
    }

    const { phoneNumber, durationSeconds, confidence, transcription } = parseVoicemailEmail(emailText);

    if (!phoneNumber || !transcription) {
      console.error('Failed to parse voicemail email:', emailText.substring(0, 200));
      return res.status(400).json({
        success: false,
        error: 'Failed to parse voicemail data from email',
      });
    }

    const fromPhone = formatPhoneE164(phoneNumber);
    const voipmsDid = process.env.VOIPMS_DID || '';

    // Get MP3 attachment
    if (!attachments || attachments.length === 0) {
      console.error('No MP3 attachment found in voicemail email');
      return res.status(400).json({
        success: false,
        error: 'No MP3 attachment found',
      });
    }

    const mp3Attachment = attachments.find((att: any) =>
      att.contentType === 'audio/mpeg' || att.filename?.endsWith('.mp3')
    );

    if (!mp3Attachment) {
      console.error('No MP3 attachment found (looking for audio/mpeg)');
      return res.status(400).json({
        success: false,
        error: 'No MP3 attachment found',
      });
    }

    // Decode base64 MP3 content
    const mp3Buffer = Buffer.from(mp3Attachment.content, 'base64');

    // Upload MP3 to Vercel Blob
    const timestamp = new Date().getTime();
    const filename = `voicemail-${fromPhone}-${timestamp}.mp3`;

    const blob = await put(filename, mp3Buffer, {
      access: 'public',
      contentType: 'audio/mpeg',
    });

    console.log('Uploaded voicemail MP3 to Blob:', blob.url);

    const sql = getDB();

    // Find or create contact
    let contacts : Contact[] = await sql`
      SELECT * FROM contacts WHERE phone_number = ${fromPhone}
    `;

    let contact: Contact;

    if (contacts.length === 0) {
      // Create new contact
      const name = displayPhoneNumber(fromPhone);
      const avatarColor = generateAvatarColor();

      const newContacts : Contact[] = await sql`
        INSERT INTO contacts (name, phone_number, avatar_color)
        VALUES (${name}, ${fromPhone}, ${avatarColor})
        RETURNING *
      `;

      contact = newContacts[0];
      console.log('Created new contact:', contact.id, contact.name);
    } else {
      contact = contacts[0];
    }

    // Store voicemail message
    await sql`
      INSERT INTO messages (
        contact_id,
        direction,
        message_type,
        content,
        voicemail_blob_url,
        voicemail_duration,
        voicemail_confidence,
        phone_from,
        phone_to,
        status
      ) VALUES (
        ${contact.id},
        'inbound',
        'voicemail',
        ${transcription},
        ${blob.url},
        ${durationSeconds},
        ${confidence},
        ${fromPhone},
        ${voipmsDid},
        'sent'
      )
    `;

    console.log('Stored voicemail:', {
      from: fromPhone,
      duration: durationSeconds,
      confidence,
      contact: contact.name,
    });

    return res.status(200).json({
      success: true,
      message: 'Voicemail received and stored',
    });

  } catch (error) {
    console.error('Voicemail webhook error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
