import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from '../db/client.js';
import { getTokenFromCookie, verifyToken } from '../../utils/auth';
import { sendSMS } from '../../utils/voipms';
import type { SendMessageRequest, SendMessageResponse, Contact, Message } from '../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const token = getTokenFromCookie(req.headers.cookie);
  const user = verifyToken(token || '');

  if (!user) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
    } as SendMessageResponse);
  }

  try {
    const { contact_id, message } = req.body as SendMessageRequest;

    if (!contact_id || !message) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID and message are required',
      } as SendMessageResponse);
    }

    const sql = getDB();

    // Get contact
    const contacts : Contact[] = await sql`
      SELECT * FROM contacts WHERE id = ${contact_id}
    `;

    if (contacts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found',
      } as SendMessageResponse);
    }

    const contact = contacts[0];

    // Get voip.ms DID from environment
    const voipmsDid = process.env.VOIPMS_DID;

    if (!voipmsDid) {
      return res.status(500).json({
        success: false,
        error: 'VoIP.ms DID not configured',
      } as SendMessageResponse);
    }

    // Send SMS via voip.ms
    const voipmsMessageId = await sendSMS(contact.phone_number, message);

    // Store message in database
    const messages : Message[] = await sql`
      INSERT INTO messages (
        contact_id,
        direction,
        message_type,
        content,
        phone_from,
        phone_to,
        sent_by,
        status
      ) VALUES (
        ${contact_id},
        'outbound',
        'sms',
        ${message},
        ${voipmsDid},
        ${contact.phone_number},
        ${user.username},
        'sent'
      )
      RETURNING *
    `;

    return res.status(200).json({
      success: true,
      message: messages[0],
    } as SendMessageResponse);

  } catch (error) {
    console.error('Send message error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send message',
    } as SendMessageResponse);
  }
}
