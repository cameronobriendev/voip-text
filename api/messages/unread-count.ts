/**
 * messages/unread-count.ts - BirdText Unread Messages Count
 * Returns count of unread inbound messages (SMS + voicemail)
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
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

  try {
    const sql = getDB();

    // Count unread inbound messages (SMS + voicemail)
    const result = await sql`
      SELECT COUNT(*)::int as unread_count
      FROM messages
      WHERE direction = 'inbound'
        AND read_at IS NULL
        AND message_type IN ('sms', 'voicemail')
    `;

    const unreadCount = result[0]?.unread_count || 0;

    return new Response(
      JSON.stringify({
        success: true,
        unread: unreadCount
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unread count error:', error);
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
