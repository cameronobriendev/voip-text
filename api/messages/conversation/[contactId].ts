/**
 * messages/conversation/[contactId].ts - Get Conversation Messages
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../../db/client.js';
import { isAuthenticated } from '../../auth/utils.js';
import type { Message } from '../../../types';

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

  // Get contact ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const contactId = pathParts[pathParts.length - 1];

  if (!contactId) {
    return new Response(
      JSON.stringify({ error: 'Contact ID is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const sql = getDB();

    // Get all messages for this contact (both SMS and voicemail)
    const messages : Message[] = await sql`
      SELECT * FROM messages
      WHERE contact_id = ${contactId}
      ORDER BY created_at ASC
    `;

    return new Response(
      JSON.stringify({
        success: true,
        messages,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Get conversation error:', error);
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
