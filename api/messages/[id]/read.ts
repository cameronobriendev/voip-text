import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDB } from '../../db/client.js';
import { getTokenFromCookie, verifyToken } from '../../../utils/auth';
import type { Message } from '../../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify authentication
  const token = getTokenFromCookie(req.headers.cookie);
  if (!token || !verifyToken(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Message ID is required' });
  }

  try {
    const sql = getDB();

    // Mark message as read
    const updated : Message[] = await sql`
      UPDATE messages
      SET status = 'read', read_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (updated.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Message not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: updated[0],
    });

  } catch (error) {
    console.error('Mark as read error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
}
