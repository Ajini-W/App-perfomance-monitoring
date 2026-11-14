import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

// 1. Load .env file
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  if (typeof process.loadEnvFile === "function") {
    process.loadEnvFile(envPath);
  } else {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim();
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

// 2. Command Line Arguments
const clientName = process.argv[2] || "Demo Client";
const clientDomain = process.argv[3] || "example.com";
const clientEmail = process.argv[4] || `admin@${clientDomain}`;

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "replay_console",
  });

  try {
    // 3. Ensure websites table has client_id column
    const [websiteCols] = await connection.query(`SHOW COLUMNS FROM websites LIKE 'client_id'`);
    if (websiteCols.length === 0) {
      await connection.query(`ALTER TABLE websites ADD COLUMN client_id CHAR(36) NULL AFTER id`);
    }

    // 4. Generate Identifiers & Secure Keys
    const clientId = crypto.randomUUID();
    const websiteId = crypto.randomUUID();
    const apiKeyId = crypto.randomUUID();

    // Public Site Key for Frontend Tracker
    const siteKey = `site_live_${crypto.randomBytes(12).toString("hex")}`;
    
    // Secret API Key (rc_live_...) for Backend API calls
    const rawSecretKey = `rc_live_${crypto.randomBytes(24).toString("hex")}`;
    const keyPrefix = rawSecretKey.slice(0, 12);
    const keyHash = crypto.createHash("sha256").update(rawSecretKey).digest("hex");

    // Allowed origins & paths JSON
    const allowedOrigins = JSON.stringify([
      `https://${clientDomain}`,
      `http://${clientDomain}`,
      "*"
    ]);
    const permittedPaths = JSON.stringify(["*"]);

    // 5. Insert Client into `clients`
    const [clientCols] = await connection.query(`SHOW COLUMNS FROM clients`);
    const clientColNames = clientCols.map((c) => c.Field);

    if (clientColNames.includes("email") && clientColNames.includes("status")) {
      await connection.query(
        `INSERT INTO clients (id, name, email, status) VALUES (?, ?, ?, 'active')`,
        [clientId, clientName, clientEmail]
      );
    } else if (clientColNames.includes("email")) {
      await connection.query(
        `INSERT INTO clients (id, name, email) VALUES (?, ?, ?)`,
        [clientId, clientName, clientEmail]
      );
    } else {
      await connection.query(
        `INSERT INTO clients (id, name) VALUES (?, ?)`,
        [clientId, clientName]
      );
    }

    // 6. Insert Website into `websites`
    await connection.query(
      `INSERT INTO websites (id, client_id, name, site_key, allowed_origins, permitted_paths, retention_days) 
       VALUES (?, ?, ?, ?, ?, ?, 30)`,
      [websiteId, clientId, `${clientName} Main Site`, siteKey, allowedOrigins, permittedPaths]
    );

    // 7. Insert API Key Hash into `api_keys`
    const [apiKeyCols] = await connection.query(`SHOW COLUMNS FROM api_keys`);
    const apiKeyColNames = apiKeyCols.map((c) => c.Field);

    if (apiKeyColNames.includes("status")) {
      await connection.query(
        `INSERT INTO api_keys (id, client_id, name, key_prefix, key_hash, status) VALUES (?, ?, ?, ?, ?, 'active')`,
        [apiKeyId, clientId, "Default Production Key", keyPrefix, keyHash]
      );
    } else if (apiKeyColNames.includes("is_active")) {
      await connection.query(
        `INSERT INTO api_keys (id, client_id, name, key_prefix, key_hash, is_active) VALUES (?, ?, ?, ?, ?, 1)`,
        [apiKeyId, clientId, "Default Production Key", keyPrefix, keyHash]
      );
    } else {
      await connection.query(
        `INSERT INTO api_keys (id, client_id, name, key_prefix, key_hash) VALUES (?, ?, ?, ?, ?)`,
        [apiKeyId, clientId, "Default Production Key", keyPrefix, keyHash]
      );
    }

    // 8. Print Output for Admin
    console.log("\n" + "=".repeat(62));
    console.log(" 🎉 NEW CLIENT & CREDENTIALS CREATED SUCCESSFULLY!");
    console.log("=".repeat(62));
    console.log(` Client ID    : ${clientId}`);
    console.log(` Client Name  : ${clientName}`);
    console.log(` Contact Email: ${clientEmail}`);
    console.log(` Allowed Host : ${clientDomain}`);
    console.log("-".repeat(62));
    console.log(" 1. PUBLIC SITE KEY (For Client's Frontend Tracker SDK):");
    console.log(`    ${siteKey}`);
    console.log("\n 2. SECRET API KEY (For Client's Backend 'x-api-key' Header):");
    console.log(`    ${rawSecretKey}`);
    console.log("=".repeat(62));
    console.log(" ⚠️  SECURITY NOTICE:");
    console.log(" Copy the Secret API Key now. Only its SHA-256 hash is saved");
    console.log(" in the database. It cannot be viewed again!");
    console.log("=".repeat(62) + "\n");

  } finally {
    await connection.end();
  }
}

main().catch((err) => {
  console.error("❌ Error creating client:", err.message);
  process.exit(1);
});
