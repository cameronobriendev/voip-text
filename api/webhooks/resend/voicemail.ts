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

    if (!data || !data.from || !data.subject || !data.email_id) {
      console.error('Invalid webhook payload:', req.body);
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook payload',
      });
    }

    const { from, subject, email_id, attachments } = data;

    console.log('Received voicemail webhook:', { from, subject, email_id, attachmentsCount: attachments?.length });

    // Fetch full email content from Resend API
    const resendApiKey = process.env.RESEND_API;
    if (!resendApiKey) {
      console.error('RESEND_API environment variable not set');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error',
      });
    }

    console.log('Fetching email content from Resend API...');
    const emailResponse = await fetch(`https://api.resend.com/emails/${email_id}`, {
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
      },
    });

    if (!emailResponse.ok) {
      console.error('Failed to fetch email from Resend:', emailResponse.status, await emailResponse.text());
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch email content',
      });
    }

    const emailData = await emailResponse.json();
    console.log('Fetched email data:', { hasText: !!emailData.text, hasHtml: !!emailData.html });

    const text = emailData.text || emailData.html || '';

    // Also fetch attachment content if available
    let mp3Content = null;
    if (attachments && attachments.length > 0) {
      const mp3Attachment = attachments.find((att: any) =>
        att.content_type === 'audio/mpeg' || att.filename?.endsWith('.MP3') || att.filename?.endsWith('.mp3')
      );

      if (mp3Attachment && mp3Attachment.id) {
        console.log('Fetching MP3 attachment:', mp3Attachment.id);
        const attachmentResponse = await fetch(`https://api.resend.com/emails/${email_id}/attachments/${mp3Attachment.id}`, {
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
          },
        });

        if (attachmentResponse.ok) {
          mp3Content = await attachmentResponse.arrayBuffer();
          console.log('Fetched MP3 attachment:', mp3Content.byteLength, 'bytes');
        } else {
          console.error('Failed to fetch attachment:', attachmentResponse.status);
        }
      }
    }

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
    if (!text) {
      console.error('Email body is empty after fetching from Resend API');
      return res.status(400).json({
        success: false,
        error: 'Email body is empty',
      });
    }

    const { phoneNumber, durationSeconds, confidence, transcription } = parseVoicemailEmail(text);

    if (!phoneNumber || !transcription) {
      console.error('Failed to parse voicemail email:', text.substring(0, 200));
      return res.status(400).json({
        success: false,
        error: 'Failed to parse voicemail data from email',
      });
    }

    const fromPhone = formatPhoneE164(phoneNumber);
    const voipmsDid = process.env.VOIPMS_DID || '7804825026';

    // Upload MP3 to Vercel Blob if we have the content
    let blob = null;
    if (mp3Content) {
      const timestamp = new Date().getTime();
      const filename = `voicemail-${fromPhone}-${timestamp}.mp3`;

      blob = await put(filename, Buffer.from(mp3Content), {
        access: 'public',
        contentType: 'audio/mpeg',
      });

      console.log('Uploaded voicemail MP3 to Blob:', blob.url);
    } else {
      console.warn('No MP3 content available to upload');
    }

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
        ${blob?.url || null},
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
