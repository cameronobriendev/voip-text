/**
 * config/did.ts - Get VoIP.ms DID Number
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { isAuthenticated } from '../auth/utils.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  // Verify authentication
  const user = await isAuthenticated(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  const did = process.env.VOIPMS_DID;

  if (!did) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'DID not configured'
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      did: did
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
