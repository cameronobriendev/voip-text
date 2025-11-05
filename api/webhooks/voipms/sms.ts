import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../../utils/db';
import { formatPhoneE164, displayPhoneNumber, generateAvatarColor } from '../../../utils/phone';
import type { Contact, Message } from '../../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // voip.ms sends webhooks as GET requests with query params
    const { to, from, msg, id } = req.query;

    if (!to || !from || !msg || !id) {
      console.error('Missing required parameters:', { to, from, msg, id });
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters: to, from, msg, id',
      });
    }

    const toPhone = formatPhoneE164(to as string);
    const fromPhone = formatPhoneE164(from as string);
    const message = msg as string;
    const voipmsId = id as string;

    const sql = getDb();

    // Check for duplicate (idempotency - prevent double-processing)
    const existing: Message[] = await sql`
      SELECT id FROM messages WHERE phone_from = ${fromPhone} AND created_at > NOW() - INTERVAL '1 minute' AND content = ${message}
    `;

    if (existing.length > 0) {
      console.log('Duplicate message detected, ignoring:', voipmsId);
      return res.status(200).json({
        success: true,
        message: 'Already processed (duplicate)',
      });
    }

    // Find or create contact
    let contacts: Contact[] = await sql`
      SELECT * FROM contacts WHERE phone_number = ${fromPhone}
    `;

    let contact: Contact;

    if (contacts.length === 0) {
      // Create new contact
      const name = displayPhoneNumber(fromPhone);
      const avatarColor = generateAvatarColor();

      const newContacts: Contact[] = await sql`
        INSERT INTO contacts (name, phone_number, avatar_color)
        VALUES (${name}, ${fromPhone}, ${avatarColor})
        RETURNING *
      `;

      contact = newContacts[0];
      console.log('Created new contact:', contact.id, contact.name);
    } else {
      contact = contacts[0];
    }

    // Store inbound SMS
    await sql`
      INSERT INTO messages (
        contact_id,
        direction,
        message_type,
        content,
        phone_from,
        phone_to,
        status
      ) VALUES (
        ${contact.id},
        'inbound',
        'sms',
        ${message},
        ${fromPhone},
        ${toPhone},
        'sent'
      )
    `;

    console.log('Stored inbound SMS:', { from: fromPhone, to: toPhone, contact: contact.name });

    return res.status(200).json({
      success: true,
      message: 'SMS received and stored',
    });

  } catch (error) {
    console.error('SMS webhook error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error',
    });
  }
}
