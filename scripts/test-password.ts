// Test password verification
import { hashPassword, verifyPassword } from '../utils/auth.js';

async function test() {
  const password = '5%URZx@@pxNQpVphJ!J2!V';
  const storedHash = 'f75e21bfee4e95bfa97a267d05b97780:db79361fbc96c54c5f3340489138668765b3c1c19897a062d59e29d53b268db5';

  console.log('Testing password verification...');
  console.log('Password:', password);
  console.log('Stored hash:', storedHash);

  try {
    const isValid = await verifyPassword(password, storedHash);
    console.log('Verification result:', isValid);

    if (isValid) {
      console.log('✅ Password verification SUCCESS');
    } else {
      console.log('❌ Password verification FAILED');
    }
  } catch (error) {
    console.error('Error during verification:', error);
  }
}

test().catch(console.error);
