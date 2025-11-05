/**
 * me.ts - BirdText Auth Check Endpoint
 * Adapted from BrassHelm Security Templates (no CORS needed)
 */

export const config = { runtime: 'edge' };

import { isAuthenticated } from './utils.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  const user = await isAuthenticated(req);

  if (!user) {
    return new Response(
      JSON.stringify({ authenticated: false }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      authenticated: true,
      id: user.id,
      username: user.username,
      email: user.email
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
