import mysql from "mysql2/promise";
import { scryptSync, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// 1. Manually read .env file (No external dotenv package required)
try {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx !== -1) {
        const key = trimmed.slice(0, eqIdx).trim();
        const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
} catch {
  // Ignore if .env read fails, fallback to defaults
}

const email = process.env.ADMIN_EMAIL || "admin@w.com";
const password = process.env.ADMIN_INITIAL_PASSWORD || "AdminPass123";

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST || "127.0.0.1",
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || "root",
    password: process.env.MYSQL_PASSWORD || "",
    database: process.env.MYSQL_DATABASE || "replay_console",
  });

  console.log("Connected to MySQL. Creating Admin User...");

  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  const id = crypto.randomUUID();

  // Check if admin already exists
  const [rows] = await connection.execute(
    "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
    [email.toLowerCase().trim()]
  );

  if (rows.length > 0) {
    console.log(`⚠️ Admin with email '${email}' already exists.`);
  } else {
    await connection.execute(
      `INSERT INTO admin_users (id, email, password_hash, password_salt, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [id, email.toLowerCase().trim(), hash, salt]
    );
    console.log(`✅ Success! Created Admin User:`);
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
  }

  await connection.end();
}

main().catch((err) => {
  console.error("❌ Error seeding admin:", err.message);
  process.exit(1);
});
