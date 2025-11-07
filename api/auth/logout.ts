/**
 * logout.ts - BirdText Logout Endpoint
 * Adapted from BrassHelm Security Templates
 */

export const config = { runtime: 'edge' };

import { withCsrf } from './csrf-middleware.js';

// Use subdomain-specific cookie to avoid collision with other brasshelm projects
const COOKIE_DOMAIN = ''; // Empty = current domain only (subdomain-specific)

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  // Omit Domain attribute to make cookie subdomain-specific
  const cookie = `session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
    process.env.VERCEL_ENV === 'production' ? '; Secure' : ''
  }`;

  return new Response(
    JSON.stringify({ ok: true, message: 'Logged out' }),
    {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': cookie
      }
    }
  );
}

export default withCsrf(handler);
