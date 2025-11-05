/**
 * logout.ts - BirdText Logout Endpoint
 * Adapted from BrassHelm Security Templates
 */

export const config = { runtime: 'edge' };

const COOKIE_DOMAIN = '.birdmail.ca';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  const cookie = `session=; Domain=${COOKIE_DOMAIN}; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
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
