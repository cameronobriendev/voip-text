/**
 * login.ts - BirdText Login Endpoint
 * Adapted from BrassHelm Security Templates
 */

export const config = { runtime: 'edge' };

import { createSession, verifyPassword } from './utils.js';
import { checkLoginAttempt, recordFailedAttempt, clearLoginAttempts } from './brute-force-protection.js';
import { getDB } from '../db/client.js';

// Use subdomain-specific cookie to avoid collision with other brasshelm projects
// This will be sms.birdmail.ca or the Vercel deployment URL
const COOKIE_DOMAIN = ''; // Empty = current domain only (subdomain-specific)

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

    // Get IP address for brute force protection
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0] ||
                      req.headers.get('cf-connecting-ip') ||
                      'unknown';

    // Check brute force limits (by username)
    const usernameCheck = await checkLoginAttempt(username, 'username');
    if (!usernameCheck.allowed) {
      const message = usernameCheck.minutesRemaining
        ? `Too many failed attempts. Try again in ${usernameCheck.minutesRemaining} minute${usernameCheck.minutesRemaining > 1 ? 's' : ''}.`
        : 'Too many failed attempts. Please try again later.';

      return new Response(
        JSON.stringify({
          success: false,
          error: message
        }),
        { status: 429, headers: { 'content-type': 'application/json' } }
      );
    }

    // Check brute force limits (by IP)
    const ipCheck = await checkLoginAttempt(ipAddress, 'ip');
    if (!ipCheck.allowed) {
      const message = ipCheck.minutesRemaining
        ? `Too many failed attempts. Try again in ${ipCheck.minutesRemaining} minute${ipCheck.minutesRemaining > 1 ? 's' : ''}.`
        : 'Too many failed attempts. Please try again later.';

      return new Response(
        JSON.stringify({
          success: false,
          error: message
        }),
        { status: 429, headers: { 'content-type': 'application/json' } }
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
      // Record failed attempt
      await recordFailedAttempt(username, 'username');
      await recordFailedAttempt(ipAddress, 'ip');

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
      // Record failed attempt
      await recordFailedAttempt(username, 'username');
      await recordFailedAttempt(ipAddress, 'ip');

      return new Response(
        JSON.stringify({
          success: false,
          error: 'Invalid username or password'
        }),
        { status: 401, headers: { 'content-type': 'application/json' } }
      );
    }

    // Clear failed attempts on successful login
    await clearLoginAttempts(username, 'username');
    await clearLoginAttempts(ipAddress, 'ip');

    const token = await createSession({
      id: user.id,
      username: user.username,
      email: user.email
    });

    // Session never expires (10 years = 315360000 seconds)
    // Omit Domain attribute to make cookie subdomain-specific
    const cookie = `session=${token}; Path=/; Max-Age=${10 * 365 * 24 * 60 * 60}; HttpOnly; SameSite=Lax${
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
