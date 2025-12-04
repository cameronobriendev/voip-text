import { put } from '@vercel/blob';
import { createClient } from '@deepgram/sdk';
import { getDB } from '../db/client.js';
import { formatPhoneE164, displayPhoneNumber, generateAvatarColor } from '../../utils/phone.js';

/**
 * Voicemail sync endpoint - Node.js Serverless
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

        // Parse voip.ms date (Eastern Time) and convert to UTC
        // Format can be either:
        //   - New: "2025-11-06 06:52:10" (24-hour format, Eastern Time)
        //   - Old: "Wednesday, November 05, 2025 at 07:35:17 PM" (12-hour format, Eastern Time)

        let utcDate;

        // Try new format first: "2025-11-06 06:52:10"
        const newFormatMatch = date.match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
        if (newFormatMatch) {
          const [_, year, month, day, hour, min, sec] = newFormatMatch;
          // Parse as Eastern Time
          const etDate = new Date(Date.UTC(
            parseInt(year),
            parseInt(month) - 1, // Month is 0-indexed
            parseInt(day),
            parseInt(hour),
            parseInt(min),
            parseInt(sec)
          ));
          // Eastern Time is UTC-5 (EST) or UTC-4 (EDT)
          // For simplicity, use EST (UTC-5) by adding 5 hours
          utcDate = new Date(etDate.getTime() + (5 * 60 * 60 * 1000));
        } else {
          // Try old format: "Wednesday, November 05, 2025 at 07:35:17 PM"
          const oldFormatMatch = date.match(/(\w+), (\w+) (\d+), (\d+) at (\d+):(\d+):(\d+) (AM|PM)/);
          if (!oldFormatMatch) {
            console.error(`[Voicemail Sync] Failed to parse date: ${date}`);
            continue;
          }

          const [_, dayName, month, day, year, hourStr, min, sec, ampm] = oldFormatMatch;
          let hour = parseInt(hourStr);

          // Convert to 24-hour format
          if (ampm === 'PM' && hour !== 12) hour += 12;
          if (ampm === 'AM' && hour === 12) hour = 0;

          // Build date in Eastern Time, then convert to UTC
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          const monthNum = monthNames.indexOf(month);

          // Create date with the time values (treating them as if they were UTC)
          const etDate = new Date(Date.UTC(parseInt(year), monthNum, parseInt(day), hour, parseInt(min), parseInt(sec)));
          // Eastern Time is UTC-5 (EST), so to convert TO UTC we ADD 5 hours
          utcDate = new Date(etDate.getTime() + (5 * 60 * 60 * 1000));
        }

        // Store voicemail in database immediately with placeholder text
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
            'Transcribing voicemail...',
            ${blob.url},
            ${durationSeconds},
            ${null},
            ${message_num},
            ${fromPhone},
            ${voipmsDid},
            'sent',
            ${utcDate}
          )
          RETURNING *
        `;

        const newMessage = messages[0];
        console.log(`[Voicemail Sync] Stored voicemail ${message_num} with placeholder text`);

        // Now transcribe with Deepgram API (runs after message is stored)
        console.log(`[Voicemail Sync] Starting Deepgram transcription for message ${message_num}...`);
        let transcription = 'Listen to Voicemail 👇'; // fallback
        let confidence = null;

        try {
          const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
          if (!deepgramApiKey) {
            console.error(`[Voicemail Sync] DEEPGRAM_API_KEY not found in environment`);
            throw new Error('DEEPGRAM_API_KEY not configured');
          }

          // Initialize Deepgram client
          const deepgram = createClient(deepgramApiKey);

          // Transcribe audio buffer directly
          console.log(`[Voicemail Sync] Sending ${audioBuffer.length} bytes to Deepgram...`);
          const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            audioBuffer,
            {
              model: 'nova-2',        // Best for telephony audio
              smart_format: true,     // Auto-format with punctuation
              punctuate: true,
              language: 'en-US',
              utterances: false,
              keywords: ['Kacy:2']    // Boost recognition of "Kacy" (weight: 2)
            }
          );

          if (error) {
            console.error(`[Voicemail Sync] Deepgram API error:`, error);
          } else if (result?.results?.channels?.[0]?.alternatives?.[0]) {
            const alternative = result.results.channels[0].alternatives[0];
            transcription = alternative.transcript;
            confidence = alternative.confidence ? (alternative.confidence * 100).toFixed(1) : null;

            if (transcription && transcription.trim()) {
              // Post-processing: Fix common name misspellings
              transcription = transcription
                .replace(/\bCasey\b/gi, 'Kacy')   // Casey → Kacy (case-insensitive)
                .replace(/\bCasie\b/gi, 'Kacy')   // Casie → Kacy
                .replace(/\bKacie\b/gi, 'Kacy');  // Kacie → Kacy

              console.log(`[Voicemail Sync] Deepgram transcription complete (${transcription.length} chars, confidence: ${confidence}%)`);
            } else {
              transcription = 'Listen to Voicemail 👇';
              console.log(`[Voicemail Sync] Deepgram returned empty transcript`);
            }
          } else {
            console.error(`[Voicemail Sync] Deepgram returned unexpected response structure`);
          }
        } catch (error) {
          console.error(`[Voicemail Sync] Deepgram transcription error:`, error.message);
        }

        // Update message with actual transcription
        await sql`
          UPDATE messages
          SET content = ${transcription},
              voicemail_confidence = ${confidence}
          WHERE id = ${newMessage.id}
        `;
        console.log(`[Voicemail Sync] Updated message ${message_num} with transcription`);

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
