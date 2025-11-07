#!/usr/bin/env node

/**
 * Import contacts from CSV file directly into database
 * Usage: node import-contacts-db.js <csv-file-path>
 */

import fs from 'fs';
import { neon } from '@neondatabase/serverless';

// Load environment variables
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

// Helper function to format phone to E.164
function formatPhoneE164(phone) {
  let digits = phone.replace(/\D/g, '');

  if (digits.length === 10) {
    return '+1' + digits;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    return '+' + digits;
  }

  return '+' + digits;
}

// Helper function to generate random avatar color
function generateAvatarColor() {
  const colors = [
    '#667eea', '#764ba2', '#f093fb', '#4facfe',
    '#43e97b', '#fa709a', '#fee140', '#30cfd0',
    '#a8edea', '#fed6e3', '#c471f5', '#fa71cd'
  ];
  return colors[Math.floor(Math.random() * colors.length)];
}

async function importContacts(csvPath) {
  // Read the CSV file
  const csvContent = fs.readFileSync(csvPath, 'utf-8');
  const lines = csvContent.trim().split('\n');

  // Skip header row
  const dataLines = lines.slice(1);

  console.log(`Found ${dataLines.length} contacts to import\n`);

  const results = {
    success: [],
    skipped: [],
    failed: []
  };

  for (const line of dataLines) {
    if (!line.trim()) continue;

    const [contactName, contactNumber] = line.split(',').map(s => s.trim());

    if (!contactNumber) {
      console.log(`⚠️  Skipping empty line`);
      continue;
    }

    // Determine if spam and set name accordingly
    const isSpam = contactName.toLowerCase() === 'spam';
    const name = isSpam ? 'Unknown' : contactName;

    // Format phone number to E.164
    const phoneNumber = formatPhoneE164(contactNumber);

    try {
      // Check if contact already exists
      const existing = await sql`
        SELECT * FROM contacts WHERE phone_number = ${phoneNumber}
      `;

      if (existing.length > 0) {
        console.log(`⏭️  ${name} (${phoneNumber}) - Already exists`);
        results.skipped.push({ name, phoneNumber });
        continue;
      }

      // Generate avatar color
      const avatarColor = generateAvatarColor();

      // Create contact
      const newContact = await sql`
        INSERT INTO contacts (name, phone_number, avatar_color, is_spam, notes)
        VALUES (
          ${name},
          ${phoneNumber},
          ${avatarColor},
          ${isSpam},
          ${isSpam ? 'Imported from CSV - marked as spam' : 'Imported from CSV'}
        )
        RETURNING *
      `;

      if (isSpam) {
        console.log(`✅ ${name} (${phoneNumber}) - Created and marked as spam`);
        results.success.push({ name, phoneNumber, spam: true });
      } else {
        console.log(`✅ ${name} (${phoneNumber}) - Created`);
        results.success.push({ name, phoneNumber, spam: false });
      }

    } catch (error) {
      console.log(`❌ ${name} (${phoneNumber}) - Error: ${error.message}`);
      results.failed.push({ name, phoneNumber, error: error.message });
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('IMPORT SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log('='.repeat(50));

  const spamCount = results.success.filter(r => r.spam).length;
  const normalCount = results.success.filter(r => !r.spam).length;

  if (normalCount > 0) {
    console.log(`\n📇 ${normalCount} regular contacts added`);
  }
  if (spamCount > 0) {
    console.log(`🚫 ${spamCount} contacts marked as spam`);
  }
}

// Get CSV path from command line arguments
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node import-contacts-db.js <csv-file-path>');
  process.exit(1);
}

if (!fs.existsSync(csvPath)) {
  console.error(`Error: File not found: ${csvPath}`);
  process.exit(1);
}

// Run the import
importContacts(csvPath).catch(error => {
  console.error('Import failed:', error);
  process.exit(1);
});
