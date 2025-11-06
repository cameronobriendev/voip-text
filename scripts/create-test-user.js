import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.DATABASE_URL);

async function createTestUser() {
  const username = 'testuser';
  const password = crypto.randomBytes(16).toString('hex'); // Secure random password
  
  // Hash password with SHA-256
  const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
  
  try {
    // Check if user exists
    const existing = await sql`SELECT id FROM users WHERE username = ${username}`;
    
    if (existing.length > 0) {
      // Update existing user
      await sql`UPDATE users SET password_hash = ${passwordHash} WHERE username = ${username}`;
      console.log('✅ Updated existing test user');
    } else {
      // Create new user
      await sql`
        INSERT INTO users (username, email, password_hash)
        VALUES (${username}, 'test@birdtext.local', ${passwordHash})
      `;
      console.log('✅ Created new test user');
    }
    
    console.log('\nTest User Credentials:');
    console.log('Username:', username);
    console.log('Password:', password);
    console.log('\nSaving to playwright-testing/test-credentials.json...');
    
    // Save credentials
    const fs = await import('fs');
    const credentials = {
      birdtext: {
        username: username,
        password: password,
        url: 'https://sms.birdmail.ca'
      }
    };
    
    fs.writeFileSync(
      '/Users/camobrien/Documents/GitHub/playwright-testing/test-credentials.json',
      JSON.stringify(credentials, null, 2)
    );
    
    console.log('✅ Credentials saved!');
    
  } catch (error) {
    console.error('Error:', error.message);
  }
}

createTestUser();
