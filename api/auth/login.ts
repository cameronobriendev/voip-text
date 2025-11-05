/**
 * login.ts - BirdText Login Endpoint
 * Adapted from BrassHelm Security Templates
 */

export const config = { runtime: 'edge' };

import { createSession, verifyPassword } from './utils.js';
import { getDB } from '../db/client.js';

const COOKIE_DOMAIN = '.birdmail.ca';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { username, password } = body as { username?: string; password?: string };

    if (!username || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Username and password are required'
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      );
    }

    const sql = getDB();

    interface DBUser {
      id: string;
      username: string;
      password_hash: string;
      email: string;
      created_at: string;
    }

    const users: DBUser[] = await sql`
      SELECT * FROM users
      WHERE LOWER(username) = LOWER(${username})
    `;

    if (users.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const user = users[0];

    const validPassword = await verifyPassword(password, user.password_hash);

    if (!validPassword) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    const token = await createSession({
      id: user.id,
      username: user.username,
      email: user.email
    });

    const cookie = `session=${token}; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=${30 * 24 * 60 * 60}; HttpOnly; SameSite=Lax${
      process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
    }`;

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        }
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json',
          'set-cookie': cookie
        }
      }
    );

  } catch (error) {
    console.error('Login error:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error',
        details: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }
}
