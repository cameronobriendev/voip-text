import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from '../../db/client.js';
import { getTokenFromCookie, verifyToken } from '../../../utils/auth';
import type { Message } from '../../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const token = getTokenFromCookie(req.headers.cookie);
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { contactId } = req.query;

  if (!contactId || typeof contactId !== 'string') {
    return res.status(400).json({ error: 'Contact ID is required' });
  }

  try {
    const sql = getDB();

    // Get all messages for this contact (both SMS and voicemail)
    const messages : Message[] = await sql`
      SELECT * FROM messages
      WHERE contact_id = ${contactId}
      ORDER BY created_at ASC
    `;

    return res.status(200).json({
      success: true,
      messages,
    });

  } catch (error) {
    console.error('Get conversation error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
