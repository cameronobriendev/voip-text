import { put } from '@vercel/blob';
import { getDB } from '../db/client.js';
import { formatPhoneE164, displayPhoneNumber, generateAvatarColor } from '../../utils/phone.js';

/**
 * Voicemail sync endpoint
 *
 * Checks voip.ms API for new voicemails, transcribes them, and stores in database.
 * Called on page load to provide real-time voicemail notifications.
 */
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = getDB();
  const newVoicemails = [];

  try {
    console.log('[Voicemail Sync] Starting sync...');

    // Step 1: Fetch voicemail list from voip.ms
    const apiUsername = process.env.VOIPMS_EMAIL;
    const apiPassword = process.env.VOIPMS_API_PASSWORD;

    if (!apiUsername || !apiPassword) {
      console.error('[Voicemail Sync] Missing voip.ms credentials');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const voipmsDid = process.env.VOIPMS_DID || '7804825026';

    const url = new URL('https://voip.ms/api/v1/rest.php');
    url.searchParams.set('api_username', apiUsername);
    url.searchParams.set('api_password', apiPassword);
    url.searchParams.set('method', 'getVoicemailMessages');
    url.searchParams.set('mailbox', '1');

    console.log('[Voicemail Sync] Fetching voicemail list from voip.ms...');
    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.status !== 'success' || !data.messages) {
      console.log('[Voicemail Sync] No voicemails found');
      return res.status(200).json({ success: true, newVoicemails: [] });
    }

    console.log(`[Voicemail Sync] Found ${data.messages.length} voicemails in voip.ms`);

    // Step 2: Check which voicemails we already have (from messages table)
    const existingVoicemails = await sql`
      SELECT voicemail_message_num
      FROM messages
      WHERE message_type = 'voicemail'
      AND voicemail_message_num IS NOT NULL
    `;

    const existingMessageNums = new Set(
      existingVoicemails.map(v => v.voicemail_message_num)
    );

    // Also check voicemail_seen table for bootstrap entries
    try {
      const seenVoicemails = await sql`
        SELECT message_num FROM voicemail_seen
      `;
      seenVoicemails.forEach(v => existingMessageNums.add(v.message_num));
    } catch (error) {
      // Table doesn't exist yet, that's fine
      console.log('[Voicemail Sync] voicemail_seen table not found (will be created on first run)');
    }

    console.log(`[Voicemail Sync] Already have ${existingMessageNums.size} voicemails tracked`);

    // BOOTSTRAP: If this is the first sync (no voicemails in database),
    // mark all current voicemails as "seen" without processing them.
    // This prevents flooding the system with old voicemails.
    if (existingMessageNums.size === 0 && data.messages.length > 0) {
      console.log(`[Voicemail Sync] BOOTSTRAP MODE - Marking ${data.messages.length} existing voicemails as seen`);

      // Create a special tracking table for seen voicemail message numbers
      await sql`
        CREATE TABLE IF NOT EXISTS voicemail_seen (
          message_num VARCHAR(20) PRIMARY KEY,
          seen_at TIMESTAMP DEFAULT NOW()
        )
      `;

      // Insert all current message_nums as "seen"
      for (const vm of data.messages) {
        await sql`
          INSERT INTO voicemail_seen (message_num)
          VALUES (${vm.message_num})
          ON CONFLICT (message_num) DO NOTHING
        `;
        existingMessageNums.add(vm.message_num);
      }

      console.log('[Voicemail Sync] Bootstrap complete. Future syncs will only process new voicemails.');

      return res.status(200).json({
        success: true,
        newVoicemails: [],
        total: 0,
        bootstrapped: true,
        message: `Marked ${data.messages.length} existing voicemails as seen. Future page loads will check for new voicemails only.`
      });
    }

    // Step 3: Process new voicemails
    const voicemailsToProcess = data.messages.filter(
      vm => !existingMessageNums.has(vm.message_num)
    );

    console.log(`[Voicemail Sync] Processing ${voicemailsToProcess.length} new voicemails`);

    for (const voicemail of voicemailsToProcess) {
      try {
        const { message_num, callerid, duration, date } = voicemail;

        // Extract phone number from callerid format: "Name <1234567890>"
        const phoneMatch = callerid.match(/<(\d+)>/);
        const phoneNumber = phoneMatch ? phoneMatch[1] : null;

        if (!phoneNumber) {
          console.error(`[Voicemail Sync] Could not extract phone from: ${callerid}`);
          continue;
        }

        const fromPhone = formatPhoneE164(phoneNumber);

        console.log(`[Voicemail Sync] Processing message ${message_num} from ${fromPhone}`);

        // Download MP3 from voip.ms
        const audioUrl = new URL('https://voip.ms/api/v1/rest.php');
        audioUrl.searchParams.set('api_username', apiUsername);
        audioUrl.searchParams.set('api_password', apiPassword);
        audioUrl.searchParams.set('method', 'getVoicemailMessageFile');
        audioUrl.searchParams.set('mailbox', '1');
        audioUrl.searchParams.set('folder', 'INBOX');
        audioUrl.searchParams.set('message_num', message_num);

        console.log(`[Voicemail Sync] Downloading audio for message ${message_num}...`);
        const audioResponse = await fetch(audioUrl.toString());
        const audioData = await audioResponse.json();

        if (audioData.status !== 'success' || !audioData.message?.data) {
          console.error(`[Voicemail Sync] Failed to download audio for ${message_num}`);
          continue;
        }

        // Convert base64 to buffer
        const audioBuffer = Buffer.from(audioData.message.data, 'base64');
        console.log(`[Voicemail Sync] Downloaded ${audioBuffer.length} bytes`);

        // Upload to Vercel Blob
        const timestamp = Date.now();
        const blobFilename = `voicemail-${fromPhone}-${timestamp}.mp3`;

        const blob = await put(blobFilename, audioBuffer, {
          access: 'public',
          contentType: 'audio/mpeg',
        });

        console.log(`[Voicemail Sync] Uploaded to Blob: ${blob.url}`);

        // Store with placeholder - transcription will update via callback
        const transcription = '[Transcribing voicemail...]';
        const confidence = null;

        // Send to transcription service with callback (don't wait)
        console.log(`[Voicemail Sync] Triggering transcription job...`);
        const callbackUrl = `https://sms.birdmail.ca/api/webhooks/transcription-callback`;

        fetch(blob.url)
          .then(r => r.arrayBuffer())
          .then(async audioData => {
            const FormData = (await import('form-data')).default;
            const formData = new FormData();
            formData.append('audio', Buffer.from(audioData), {
              filename: 'voicemail.mp3',
              contentType: 'audio/mpeg',
            });
            formData.append('username', `voicemail-${message_num}`);
            formData.append('callbackUrl', callbackUrl);

            return fetch('http://do.brasshelm.com:3001/upload', {
              method: 'POST',
              body: formData,
              headers: formData.getHeaders(),
            });
          })
          .then(r => r.json())
          .then(result => {
            if (result.success) {
              console.log(`[Voicemail Sync] Transcription job ${result.jobId} started for message ${message_num}`);
            } else {
              console.error(`[Voicemail Sync] Transcription failed for ${message_num}`);
            }
          })
          .catch(err => {
            console.error(`[Voicemail Sync] Transcription error for ${message_num}:`, err.message);
          });

        // Parse duration (format: "00:00:08" → seconds)
        const durationParts = duration.split(':').map(Number);
        const durationSeconds = durationParts.length === 3
          ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
          : durationParts.length === 2
          ? durationParts[0] * 60 + durationParts[1]
          : 0;

        // Find or create contact
        let contacts = await sql`
          SELECT * FROM contacts WHERE phone_number = ${fromPhone}
        `;

        let contact;
        if (contacts.length === 0) {
          const name = displayPhoneNumber(fromPhone);
          const avatarColor = generateAvatarColor();

          const newContacts = await sql`
            INSERT INTO contacts (name, phone_number, avatar_color)
            VALUES (${name}, ${fromPhone}, ${avatarColor})
            RETURNING *
          `;

          contact = newContacts[0];
          console.log(`[Voicemail Sync] Created new contact: ${contact.name}`);
        } else {
          contact = contacts[0];
        }

        // Store voicemail in database
        const messages = await sql`
          INSERT INTO messages (
            contact_id,
            direction,
            message_type,
            content,
            voicemail_blob_url,
            voicemail_duration,
            voicemail_confidence,
            voicemail_message_num,
            phone_from,
            phone_to,
            status,
            created_at
          ) VALUES (
            ${contact.id},
            'inbound',
            'voicemail',
            ${transcription},
            ${blob.url},
            ${durationSeconds},
            ${confidence},
            ${message_num},
            ${fromPhone},
            ${voipmsDid},
            'sent',
            ${new Date(date)}
          )
          RETURNING *
        `;

        const newMessage = messages[0];

        // Also mark as seen in tracking table
        await sql`
          INSERT INTO voicemail_seen (message_num)
          VALUES (${message_num})
          ON CONFLICT (message_num) DO NOTHING
        `;

        console.log(`[Voicemail Sync] Stored voicemail ${message_num} in database`);

        newVoicemails.push({
          id: newMessage.id,
          from: contact.name,
          phone: fromPhone,
          duration: durationSeconds,
          transcription: transcription.substring(0, 100),
        });

      } catch (error) {
        console.error(`[Voicemail Sync] Error processing voicemail:`, error);
        // Continue with next voicemail
      }
    }

    console.log(`[Voicemail Sync] Complete. Processed ${newVoicemails.length} new voicemails`);

    return res.status(200).json({
      success: true,
      newVoicemails,
      total: newVoicemails.length,
    });

  } catch (error) {
    console.error('[Voicemail Sync] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Internal server error',
    });
  }
}
