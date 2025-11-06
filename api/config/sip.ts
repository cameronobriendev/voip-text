/**
 * config/sip.ts - Get VoIP.ms SIP Configuration
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

  const sipConfig = {
    server: process.env.VOIP_SUBACCOUNT_SERVER || 'vancouver3.voip.ms',
    port: process.env.VOIP_SIP_PORT || '4443',
    user: process.env.VOIP_SUBACCOUNT_USER,
    password: process.env.VOIP_SUBACCOUNT_PASS,
    displayName: process.env.VOIPMS_DID || '7804825026'
  };

  if (!sipConfig.user || !sipConfig.password) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'SIP configuration incomplete'
      }),
      { status: 500, headers: { 'content-type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      config: {
        server: sipConfig.server,
        port: sipConfig.port,
        user: sipConfig.user,
        password: sipConfig.password,
        displayName: sipConfig.displayName
      }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}
