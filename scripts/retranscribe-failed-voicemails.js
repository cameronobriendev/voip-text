// Re-transcribe all failed voicemails using Deepgram
import { createClient } from '@deepgram/sdk';
import { neon } from '@neondatabase/serverless';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: join(__dirname, '..', '.env.local') });

const sql = neon(process.env.DATABASE_URL);

async function retranscribeFailedVoicemails() {
  console.log('🔄 Re-transcribing failed voicemails with Deepgram...\n');

  if (!process.env.DEEPGRAM_API_KEY) {
    console.error('ERROR: DEEPGRAM_API_KEY not found in environment');
    return;
  }

  try {
    // Get all failed voicemails (those with fallback text)
    const failedVoicemails = await sql`
      SELECT
        id,
        content,
        voicemail_blob_url,
        voicemail_duration,
        created_at
      FROM messages
      WHERE message_type = 'voicemail'
      AND voicemail_blob_url IS NOT NULL
      AND (
        content = 'Listen to Voicemail 👇'
        OR content = 'Transcription failed - Listen to Voicemail 👇'
      )
      ORDER BY created_at DESC
    `;

    if (failedVoicemails.length === 0) {
      console.log('✅ No failed voicemails found. All voicemails have been transcribed!');
      return;
    }

    console.log(`Found ${failedVoicemails.length} failed voicemail(s) to re-transcribe:\n`);
    failedVoicemails.forEach((vm, i) => {
      console.log(`${i + 1}. ${vm.created_at} - ${vm.voicemail_duration}s`);
    });

    console.log('\n' + '='.repeat(60) + '\n');

    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < failedVoicemails.length; i++) {
      const vm = failedVoicemails[i];
      console.log(`\n[${i + 1}/${failedVoicemails.length}] Processing voicemail from ${vm.created_at}`);
      console.log(`Duration: ${vm.voicemail_duration}s`);

      try {
        // Download audio from Vercel Blob
        console.log('  → Downloading audio...');
        const audioResponse = await fetch(vm.voicemail_blob_url);
        if (!audioResponse.ok) {
          throw new Error(`Failed to download audio: ${audioResponse.status}`);
        }
        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
        console.log(`  → Downloaded ${audioBuffer.length} bytes`);

        // Transcribe with Deepgram
        console.log('  → Transcribing with Deepgram...');
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
          audioBuffer,
          {
            model: 'nova-2',
            smart_format: true,
            punctuate: true,
            language: 'en-US',
            utterances: false
          }
        );

        if (error) {
          throw new Error(`Deepgram error: ${error}`);
        }

        if (!result?.results?.channels?.[0]?.alternatives?.[0]) {
          throw new Error('Unexpected Deepgram response structure');
        }

        const alternative = result.results.channels[0].alternatives[0];
        const transcript = alternative.transcript;
        const confidence = alternative.confidence ? (alternative.confidence * 100).toFixed(1) : null;

        let finalTranscript;
        let finalConfidence;

        if (!transcript || transcript.trim().length === 0) {
          // Empty transcript means no speech detected (silent voicemail)
          finalTranscript = 'No message left';
          finalConfidence = null;
          console.log(`  → No speech detected`);
        } else {
          finalTranscript = transcript;
          finalConfidence = confidence;
        }

        // Update database
        console.log(`  → Updating database...`);
        await sql`
          UPDATE messages
          SET content = ${finalTranscript},
              voicemail_confidence = ${finalConfidence}
          WHERE id = ${vm.id}
        `;

        if (finalTranscript === 'No message left') {
          console.log(`  ✅ SUCCESS! Marked as "No message left" (no speech detected)`);
        } else {
          console.log(`  ✅ SUCCESS! (${finalTranscript.length} chars, ${finalConfidence}% confidence)`);
          console.log(`     "${finalTranscript.substring(0, 80)}${finalTranscript.length > 80 ? '...' : ''}"`);
        }
        successCount++;

      } catch (error) {
        console.error(`  ❌ FAILED: ${error.message}`);
        failCount++;
      }

      // Add small delay to avoid rate limits
      if (i < failedVoicemails.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 SUMMARY:');
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📝 Total: ${failedVoicemails.length}`);

    if (successCount > 0) {
      console.log('\n✨ Re-transcription complete! Voicemails have been updated.');
    }

  } catch (error) {
    console.error('Fatal error:', error);
  }
}

retranscribeFailedVoicemails();
