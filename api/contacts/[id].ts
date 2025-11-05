import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from '../db/client.js';
import { getTokenFromCookie, verifyToken } from '../../utils/auth';
import { formatPhoneE164 } from '../../utils/phone';
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

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Contact ID is required' });
  }

  const sql = getDB();

  try {
    if (req.method === 'GET') {
      // Get single contact
      const contacts : Contact[] = await sql`
        SELECT * FROM contacts WHERE id = ${id}
      `;

      if (contacts.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found',
        });
      }

      return res.status(200).json({
        success: true,
        contact: contacts[0],
      });

    } else if (req.method === 'PUT') {
      // Update contact
      const { name, phone_number, notes, avatar_color } = req.body;

      // Check if contact exists
      const existing : Contact[] = await sql`
        SELECT * FROM contacts WHERE id = ${id}
      `;

      if (existing.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found',
        });
      }

      // Build update fields
      const updateFields: any = {
        updated_at: new Date().toISOString(),
      };

      if (name) updateFields.name = name;
      if (notes !== undefined) updateFields.notes = notes;
      if (avatar_color) updateFields.avatar_color = avatar_color;

      if (phone_number) {
        updateFields.phone_number = formatPhoneE164(phone_number);
      }

      // Update contact
      const updated : Contact[] = await sql`
        UPDATE contacts
        SET
          name = COALESCE(${updateFields.name || null}, name),
          phone_number = COALESCE(${updateFields.phone_number || null}, phone_number),
          notes = ${updateFields.notes !== undefined ? updateFields.notes : existing[0].notes},
          avatar_color = COALESCE(${updateFields.avatar_color || null}, avatar_color),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return res.status(200).json({
        success: true,
        contact: updated[0],
      });

    } else if (req.method === 'DELETE') {
      // Delete contact
      const deleted : Contact[] = await sql`
        DELETE FROM contacts WHERE id = ${id} RETURNING *
      `;

      if (deleted.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found',
        });
      }

      return res.status(200).json({
        success: true,
        message: 'Contact deleted successfully',
      });

    } else {
      return res.status(405).json({ error: 'Method not allowed' });
    }

  } catch (error) {
    console.error('Contact API error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
