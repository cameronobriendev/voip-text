#!/usr/bin/env node

/**
 * Test script to call voip.ms API and examine voicemail data
 *
 * This script tests what data the voip.ms API returns for voicemails,
 * specifically checking if it includes transcriptions.
 */

async function testVoipMsAPI() {
  const apiUsername = process.env.VOIPMS_EMAIL;
  const apiPassword = process.env.VOIPMS_API_PASSWORD;

  if (!apiUsername || !apiPassword) {
    console.error('❌ Missing voip.ms credentials!');
    console.error('Required: VOIPMS_EMAIL and VOIPMS_API_PASSWORD');
    process.exit(1);
  }

  console.log('🧪 Testing voip.ms API...');
  console.log(`Username: ${apiUsername}`);
  console.log('');

  // Test 1: Get voicemail messages
  try {
    console.log('📋 Test 1: Fetching voicemail messages...');

    const url = new URL('https://voip.ms/api/v1/rest.php');
    url.searchParams.set('api_username', apiUsername);
    url.searchParams.set('api_password', apiPassword);
    url.searchParams.set('method', 'getVoicemailMessages');
    url.searchParams.set('mailbox', '1'); // Default mailbox

    console.log(`GET ${url.toString().replace(apiPassword, '***')}`);
    console.log('');

    const response = await fetch(url.toString());

    console.log(`Status: ${response.status} ${response.statusText}`);

    const data = await response.json();

    console.log('');
    console.log('📦 Full Response:');
    console.log(JSON.stringify(data, null, 2));
    console.log('');

    // Analyze the response
    if (data.status === 'success' && data.voicemails && data.voicemails.length > 0) {
      console.log('✅ API call successful!');
      console.log(`Found ${data.voicemails.length} voicemail(s)`);
      console.log('');

      const firstVoicemail = data.voicemails[0];
      console.log('🔍 First voicemail structure:');
      console.log(`Keys available: ${Object.keys(firstVoicemail).join(', ')}`);
      console.log('');

      // Check for transcription
      if (firstVoicemail.transcription || firstVoicemail.transcript || firstVoicemail.message) {
        console.log('✅ Transcription field found!');
        console.log(`Field name: ${firstVoicemail.transcription ? 'transcription' : firstVoicemail.transcript ? 'transcript' : 'message'}`);
      } else {
        console.log('❌ No transcription field found');
        console.log('Available fields:', Object.keys(firstVoicemail));
      }

    } else if (data.status === 'no_voicemail') {
      console.log('⚠️  No voicemails found in mailbox 1');
      console.log('(This is normal if you haven\'t received any voicemails yet)');
    } else {
      console.log('❌ Unexpected response format');
      console.log('Status:', data.status);
    }

  } catch (error) {
    console.error('❌ API test failed:', error.message);
    if (error.cause) {
      console.error('Cause:', error.cause);
    }
  }

  console.log('');
  console.log('✨ Test complete!');
}

// Run the test
testVoipMsAPI().catch(console.error);
