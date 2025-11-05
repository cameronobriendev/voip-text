import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../utils/db';
import { getTokenFromCookie, verifyToken } from '../../utils/auth';
import { formatPhoneE164, generateAvatarColor } from '../../utils/phone';
import type { Contact } from '../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  // Verify authentication
  const token = getTokenFromCookie(req.headers.cookie);
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const sql = getDb();

  try {
    if (req.method === 'GET') {
      // List all contacts (shared between users)
      const contacts = await sql<Contact[]>`
        SELECT * FROM contacts ORDER BY name ASC
      `;

      return res.status(200).json({
        success: true,
        contacts,
      });

    } else if (req.method === 'POST') {
      // Create new contact
      const { name, phone_number, notes } = req.body;

      if (!name || !phone_number) {
        return res.status(400).json({
          success: false,
          error: 'Name and phone number are required',
        });
      }

      // Format phone number to E.164
      const formattedPhone = formatPhoneE164(phone_number);

      // Check if contact with this phone number already exists
      const existing = await sql<Contact[]>`
        SELECT * FROM contacts WHERE phone_number = ${formattedPhone}
      `;

      if (existing.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Contact with this phone number already exists',
        });
      }

      // Generate random avatar color
      const avatarColor = generateAvatarColor();

      // Create contact
      const newContacts = await sql<Contact[]>`
        INSERT INTO contacts (name, phone_number, avatar_color, notes)
        VALUES (${name}, ${formattedPhone}, ${avatarColor}, ${notes || null})
        RETURNING *
      `;

      return res.status(201).json({
        success: true,
        contact: newContacts[0],
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Contacts API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
