/**
 * messages/[id]/index.ts - Delete Message (Notes only)
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../../db/client.js';
import { isAuthenticated } from '../../auth/utils.js';
import { withCsrf } from '../../auth/csrf-middleware.js';
import type { Message } from '../../../types';

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'DELETE') {
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

  // Get message ID from URL
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const id = pathParts[pathParts.length - 1]; // /api/messages/[id]

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Message ID is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  try {
    const sql = getDB();

    // Check if message exists and is a note
    const existing : Message[] = await sql`
      SELECT * FROM messages WHERE id = ${id}
    `;

    if (existing.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Message not found',
        }),
        { status: 404, headers: { 'content-type': 'application/json' } }
      );
    }

    // Only allow deleting notes
    if (existing[0].direction !== 'note') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Only private notes can be deleted',
        }),
        { status: 403, headers: { 'content-type': 'application/json' } }
      );
    }

    // Delete the note
    await sql`
      DELETE FROM messages WHERE id = ${id}
    `;

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Note deleted successfully',
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  } catch (error) {
    console.error('Delete note error:', error);
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

export default withCsrf(handler);
