import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTokenFromCookie, verifyToken } from '../../utils/auth';
import { getDb } from '../../utils/db';
import type { User } from '../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get token from cookie
    const token = getTokenFromCookie(req.headers.cookie);

    if (!token) {
      return res.status(401).json({
        authenticated: false,
        error: 'No token provided'
      });
    }

    // Verify token
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({
        authenticated: false,
        error: 'Invalid token'
      });
    }

    // Get fresh user data from database
    const sql = getDb();
    const users = await sql<User[]>`
      SELECT id, username, email, created_at FROM users WHERE id = ${decoded.id}
    `;

    if (users.length === 0) {
      return res.status(401).json({
        authenticated: false,
        error: 'User not found'
      });
    }

    const user = users[0];

    return res.status(200).json({
      authenticated: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      }
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return res.status(500).json({
      authenticated: false,
      error: 'Internal server error'
    });
  }
}
