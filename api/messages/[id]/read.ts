/**
 * messages/[id]/read.ts - Mark Message as Read
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../../db/client.js';
import { verifySession } from '../../auth/utils.js';
import type { Message } from '../../../types';

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'PUT') {
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

  // Get message ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 2]; // /api/messages/[id]/read

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Message ID is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const sql = getDB();

    // Mark message as read
    const updated : Message[] = await sql`
      UPDATE messages
      SET status = 'read', read_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;

    if (updated.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Message not found',
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: updated[0],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Mark as read error:', error);
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
