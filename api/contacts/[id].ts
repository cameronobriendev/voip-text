/**
 * contacts/[id].ts - BirdText Individual Contact Endpoint
 * Edge Runtime
 */

export const config = { runtime: 'edge' };

import { getDB } from '../db/client.js';
import { isAuthenticated } from '../auth/utils.js';
import { formatPhoneE164 } from '../../utils/phone';
import type { Contact } from '../../types';

export default async function handler(req: Request): Promise<Response> {
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
  const id = pathParts[pathParts.length - 1];

  if (!id) {
    return new Response(
      JSON.stringify({ error: 'Contact ID is required' }),
      { status: 400, headers: { 'content-type': 'application/json' } }
    );
  }

  const sql = getDB();

  try {
    if (req.method === 'GET') {
      // Get single contact
      const contacts : Contact[] = await sql`
        SELECT * FROM contacts WHERE id = ${id}
      `;

      if (contacts.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Contact not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          contact: contacts[0],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    } else if (req.method === 'PUT') {
      // Update contact
      const body = await req.json();
      const { name, phone_number, notes, avatar_color, ai_relationship, ai_tone_preference } = body;

      // Check if contact exists
      const existing : Contact[] = await sql`
        SELECT * FROM contacts WHERE id = ${id}
      `;

      if (existing.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Contact not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } }
        );
      }

      // Build update fields
      const updateFields: any = {
        updated_at: new Date().toISOString(),
      };

      if (name) updateFields.name = name;
      if (notes !== undefined) updateFields.notes = notes;
      if (avatar_color) updateFields.avatar_color = avatar_color;
      if (ai_relationship !== undefined) updateFields.ai_relationship = ai_relationship;
      if (ai_tone_preference !== undefined) updateFields.ai_tone_preference = ai_tone_preference;

      if (phone_number) {
        updateFields.phone_number = formatPhoneE164(phone_number);
      }

      // Update contact
      const updated : Contact[] = await sql`
        UPDATE contacts
        SET
          name = COALESCE(${updateFields.name || null}, name),
          phone_number = COALESCE(${updateFields.phone_number || null}, phone_number),
          notes = ${updateFields.notes !== undefined ? updateFields.notes : existing[0].notes},
          avatar_color = COALESCE(${updateFields.avatar_color || null}, avatar_color),
          ai_relationship = ${updateFields.ai_relationship !== undefined ? updateFields.ai_relationship : existing[0].ai_relationship},
          ai_tone_preference = ${updateFields.ai_tone_preference !== undefined ? updateFields.ai_tone_preference : existing[0].ai_tone_preference},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `;

      return new Response(
        JSON.stringify({
          success: true,
          contact: updated[0],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    } else if (req.method === 'DELETE') {
      // Delete contact
      const deleted : Contact[] = await sql`
        DELETE FROM contacts WHERE id = ${id} RETURNING *
      `;

      if (deleted.length === 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Contact not found',
          }),
          { status: 404, headers: { 'content-type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Contact deleted successfully',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );

    } else {
      return new Response(
        JSON.stringify({ error: 'Method not allowed' }),
        { status: 405, headers: { 'content-type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Contact API error:', error);
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
