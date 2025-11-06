#!/usr/bin/env node

/**
 * Test fetching audio file from voip.ms API
 */

async function testAudioFetch() {
  const apiUsername = process.env.VOIPMS_EMAIL;
  const apiPassword = process.env.VOIPMS_API_PASSWORD;

  console.log('🎵 Testing voip.ms audio file download...');
  console.log('');

  try {
    // Use message_num 42 from the most recent voicemail (CAMROSE AB <7802265961>)
    const messageNum = '42';
    const mailbox = '1';

    const url = new URL('https://voip.ms/api/v1/rest.php');
    url.searchParams.set('api_username', apiUsername);
    url.searchParams.set('api_password', apiPassword);
    url.searchParams.set('method', 'getVoicemailMessageFile');
    url.searchParams.set('mailbox', mailbox);
    url.searchParams.set('folder', 'INBOX');
    url.searchParams.set('message_num', messageNum);

    console.log(`Fetching audio for message_num: ${messageNum}`);
    console.log('');

    const response = await fetch(url.toString());
    console.log(`Status: ${response.status} ${response.statusText}`);
    console.log(`Content-Type: ${response.headers.get('content-type')}`);
    console.log(`Content-Length: ${response.headers.get('content-length')} bytes`);

    const data = await response.json();
    console.log('');
    console.log('Response:');
    console.log(JSON.stringify(data, null, 2));

    if (data.status === 'success' && data.file) {
      console.log('');
      console.log('✅ Audio file available!');
      console.log(`File field: ${data.file.substring(0, 100)}...`);
      console.log(`File length: ${data.file.length} characters`);

      // The file is likely base64 encoded
      if (data.encoding === 'base64' || data.file.match(/^[A-Za-z0-9+/=]+$/)) {
        console.log('Format: Appears to be base64 encoded');
        console.log(`Decoded size: ~${Math.floor(data.file.length * 0.75)} bytes`);
      }
    }

  } catch (error) {
    console.error('❌ Audio fetch failed:', error.message);
  }
}

testAudioFetch().catch(console.error);
