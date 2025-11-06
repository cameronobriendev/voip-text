import { getDB } from '../db/client.js';
import { formatPhoneE164, displayPhoneNumber, generateAvatarColor } from '../../utils/phone.js';

/**
 * Save Call History Endpoint - Node.js Serverless
 *
 * Saves outbound call records to the messages table for history tracking.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDB();
  const { phone_number, duration, status } = req.body;

  if (!phone_number) {
    return res.status(400).json({ error: 'Phone number is required' });
  }

  try {
    console.log(`[Call History] Saving call to ${phone_number}, duration: ${duration}s, status: ${status}`);

    const phoneE164 = formatPhoneE164(phone_number);

    // Find or create contact
    let contacts = await sql`
      SELECT * FROM contacts WHERE phone_number = ${phoneE164}
    `;

    let contact;
    if (contacts.length === 0) {
      const name = displayPhoneNumber(phoneE164);
      const avatarColor = generateAvatarColor();

      console.log(`[Call History] Creating new contact: ${name}`);

      const newContacts = await sql`
        INSERT INTO contacts (name, phone_number, avatar_color)
        VALUES (${name}, ${phoneE164}, ${avatarColor})
        RETURNING *
      `;

      contact = newContacts[0];
    } else {
      contact = contacts[0];
    }

    // Create call message in database
    const content = duration > 0
      ? `Call duration: ${Math.floor(duration / 60)}m ${duration % 60}s`
      : 'Call failed';

    const voipmsDid = process.env.VOIPMS_DID || '7804825026';

    await sql`
      INSERT INTO messages (
        contact_id,
        direction,
        message_type,
        content,
        voicemail_duration,
        phone_from,
        phone_to,
        status,
        created_at
      ) VALUES (
        ${contact.id},
        'outbound',
        'call',
        ${content},
        ${duration},
        ${voipmsDid},
        ${phoneE164},
        ${status || 'completed'},
        NOW()
      )
    `;

    console.log(`[Call History] Call saved successfully`);

    return res.status(200).json({
      success: true,
      message: 'Call history saved'
    });

  } catch (error) {
    console.error('[Call History] Error saving call:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
}
