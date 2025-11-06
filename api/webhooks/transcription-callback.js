import { getDB } from '../db/client.js';

/**
 * Transcription callback webhook
 *
 * Called by DO transcription service when voicemail transcription is complete.
 * Updates the message content with the actual transcription.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDB();

  try {
    const { username, transcription, confidence } = req.body;

    if (!username || !transcription) {
      console.error('[Transcription Callback] Missing required fields:', req.body);
      return res.status(400).json({ error: 'Missing username or transcription' });
    }

    // Extract message_num from username (format: "voicemail-{message_num}")
    const match = username.match(/^voicemail-(.+)$/);
    if (!match) {
      console.error('[Transcription Callback] Invalid username format:', username);
      return res.status(400).json({ error: 'Invalid username format' });
    }

    const messageNum = match[1];
    console.log(`[Transcription Callback] Received transcription for message ${messageNum}`);

    // Update message content in database
    const updated = await sql`
      UPDATE messages
      SET
        content = ${transcription},
        voicemail_confidence = ${confidence || null}
      WHERE voicemail_message_num = ${messageNum}
      RETURNING id
    `;

    if (updated.length === 0) {
      console.error(`[Transcription Callback] Message ${messageNum} not found in database`);
      return res.status(404).json({ error: 'Message not found' });
    }

    console.log(`[Transcription Callback] Updated message ${updated[0].id} with transcription (${confidence}% confidence)`);

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('[Transcription Callback] Error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
