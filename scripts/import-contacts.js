#!/usr/bin/env node

/**
 * Import contacts from CSV file
 * Usage: node import-contacts.js <csv-file-path>
 */

const fs = require('fs');
const path = require('path');

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
    const [contactName, contactNumber] = line.split(',').map(s => s.trim());

    if (!contactNumber) {
      console.log(`⚠️  Skipping empty line`);
      continue;
    }

    // Determine if spam and set name accordingly
    const isSpam = contactName.toLowerCase() === 'spam';
    const name = isSpam ? 'Unknown' : contactName;

    // Format phone number to E.164 (add +1 if not present)
    let phoneNumber = contactNumber.replace(/\D/g, ''); // Remove non-digits
    if (phoneNumber.length === 10) {
      phoneNumber = '+1' + phoneNumber;
    } else if (!phoneNumber.startsWith('+')) {
      phoneNumber = '+' + phoneNumber;
    }

    try {
      // Make API request to create contact
      const response = await fetch('http://localhost:3000/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Note: You'll need to add authentication here
          // For now, this assumes you're logged in locally
        },
        body: JSON.stringify({
          name: name,
          phone_number: phoneNumber,
          notes: isSpam ? 'Imported from phonebook CSV - marked as spam' : 'Imported from phonebook CSV'
        })
      });

      const data = await response.json();

      if (data.success) {
        // If it's spam, mark it as spam after creation
        if (isSpam) {
          const spamResponse = await fetch(`http://localhost:3000/api/contacts/${data.contact.id}/spam`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ is_spam: true })
          });

          if (spamResponse.ok) {
            console.log(`✅ ${name} (${phoneNumber}) - Created and marked as spam`);
            results.success.push({ name, phoneNumber, spam: true });
          } else {
            console.log(`⚠️  ${name} (${phoneNumber}) - Created but failed to mark as spam`);
            results.success.push({ name, phoneNumber, spam: false });
          }
        } else {
          console.log(`✅ ${name} (${phoneNumber}) - Created`);
          results.success.push({ name, phoneNumber, spam: false });
        }
      } else if (data.error && data.error.includes('already exists')) {
        console.log(`⏭️  ${name} (${phoneNumber}) - Already exists`);
        results.skipped.push({ name, phoneNumber });
      } else {
        console.log(`❌ ${name} (${phoneNumber}) - Failed: ${data.error}`);
        results.failed.push({ name, phoneNumber, error: data.error });
      }
    } catch (error) {
      console.log(`❌ ${name} (${phoneNumber}) - Error: ${error.message}`);
      results.failed.push({ name, phoneNumber, error: error.message });
    }

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 100));
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
  if (spamCount > 0) {
    console.log(`\n🚫 ${spamCount} contacts marked as spam`);
  }
}

// Get CSV path from command line arguments
const csvPath = process.argv[2];

if (!csvPath) {
  console.error('Usage: node import-contacts.js <csv-file-path>');
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
