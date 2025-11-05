/**
 * messages/index.ts - BirdText Messages List Endpoint
 * Returns all conversations (unique contacts with latest message)
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { verifySession } from '../auth/utils.js';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'GET') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { 'content-type': 'application/json' } }
    );
  }

  // Verify authentication
  const user = await verifySession(req);
  if (!user) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const sql = getDB();

    // Get all conversations with latest message
    // Group by contact_id and get the most recent message for each
    const conversations = await sql`
      SELECT DISTINCT ON (m.contact_id)
        m.contact_id,
        m.id as message_id,
        m.content,
        m.direction,
        m.message_type,
        m.read,
        m.created_at,
        c.name as contact_name,
        c.phone_number,
        c.avatar_color
      FROM messages m
      LEFT JOIN contacts c ON m.contact_id = c.id
      ORDER BY m.contact_id, m.created_at DESC
    `;

    return new Response(
      JSON.stringify({
        success: true,
        conversations
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Messages list error:', error);
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
