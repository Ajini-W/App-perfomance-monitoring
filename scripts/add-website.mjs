import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import mysql from 'mysql2/promise';

// 1. Read .env file without external dotenv dependency
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

// 2. Command line arguments
// Usage: node scripts/add-website.mjs "<client_id_or_name>" "<site_name>" "<domain>"
const [,, clientIdentifier, siteName, domain] = process.argv;

if (!clientIdentifier || !siteName || !domain) {
  console.log(`
❌ Usage:
   node scripts/add-website.mjs "<client_id_or_name>" "<site_name>" "<domain>"

📌 Examples:
   node scripts/add-website.mjs "client_7f2b..." "Blinkit Quick Commerce" "blinkit.com"
   node scripts/add-website.mjs "Zomato India" "Feeding India" "feedingindia.org"
`);
  process.exit(1);
}

async function addWebsite() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'replay_console'
  });

  try {
    // 3. Find the client by ID or by Name
    const [clients] = await connection.query(
      `SELECT id, name FROM clients WHERE id = ? OR name = ? LIMIT 1`,
      [clientIdentifier, clientIdentifier]
    );

    if (clients.length === 0) {
      console.error(`❌ Client not found for: "${clientIdentifier}"`);
      console.log(`👉 Tip: Check clients in DB or use the exact client name.`);
      process.exit(1);
    }

    const client = clients[0];

    // 4. Generate a unique Website ID and Site Key
    const websiteId = 'site_' + crypto.randomBytes(8).toString('hex');
    const siteKey = 'site_live_' + crypto.randomBytes(24).toString('hex');

    // Clean domain for origins
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const allowedOrigins = JSON.stringify([
      `https://${cleanDomain}`,
      `http://${cleanDomain}`
    ]);
    const permittedPaths = JSON.stringify(['*']);

    // 5. Insert new website linked to the existing client
    await connection.query(
      `INSERT INTO websites (
        id, client_id, name, site_key, allowed_origins, permitted_paths, retention_days, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 30, NOW())`,
      [websiteId, client.id, siteName, siteKey, allowedOrigins, permittedPaths]
    );

    console.log(`
======================================================
✅ New Website Added Successfully!
======================================================
Client Name   : ${client.name}
Client ID     : ${client.id}
Website Name  : ${siteName}
Website ID    : ${websiteId}
Domain        : ${cleanDomain}
------------------------------------------------------
🔑 NEW PUBLIC SITE KEY (Tracker Script-ku):
${siteKey}
======================================================

📋 Client Integration Snippet (For ${cleanDomain}):
------------------------------------------------------
<script
  src="http://localhost:8080/sdk/recorder.js"
  data-site-key="${siteKey}"
  defer>
</script>
`);

  } catch (error) {
    console.error('❌ Error adding website:', error.message);
  } finally {
    await connection.end();
  }
}

addWebsite();
