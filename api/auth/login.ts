import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getDb } from '../../utils/db';
import { verifyPassword, generateToken } from '../../utils/auth';
import type { LoginRequest, LoginResponse, User } from '../../types';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { username, password } = req.body as LoginRequest;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Username and password are required'
      } as LoginResponse);
    }

    const sql = getDb();

    // Find user by username
    const users = await sql<User[]>`
      SELECT * FROM users WHERE username = ${username}
    `;

    if (users.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      } as LoginResponse);
    }

    const user = users[0];

    // Verify password
    const isValid = await verifyPassword(password, user.password_hash);

    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid username or password'
      } as LoginResponse);
    }

    // Generate JWT token
    const token = generateToken({
      id: user.id,
      username: user.username,
      email: user.email,
    });

    // Set httpOnly cookie with token
    res.setHeader('Set-Cookie', `token=${token}; HttpOnly; Path=/; Max-Age=${30 * 24 * 60 * 60}; SameSite=Strict; Secure`);

    return res.status(200).json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
      }
    } as LoginResponse);

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    } as LoginResponse);
  }
}
