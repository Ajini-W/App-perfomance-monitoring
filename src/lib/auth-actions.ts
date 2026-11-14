import { createServerFn } from "@tanstack/react-start";
import { db } from "@/lib/mysql";
import { hashPassword, verifyPassword } from "@/lib/auth-crypto";

export interface AuthSession {
  id: string;
  email: string;
  role: "admin" | "viewer";
  token: string;
}

// 1. Initial Admin Account Creation (Seed / First time setup)
export const seedAdminUser = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const { email, password } = data;
    const [existing]: any = await db.execute(
      "SELECT id FROM admin_users WHERE email = ? LIMIT 1",
      [email]
    );

    if (existing.length > 0) {
      return { success: false, message: "Admin with this email already exists" };
    }

    const { hash, salt } = hashPassword(password);
    const id = crypto.randomUUID();

    await db.execute(
      `INSERT INTO admin_users (id, email, password_hash, password_salt, role)
       VALUES (?, ?, ?, ?, 'admin')`,
      [id, email.toLowerCase().trim(), hash, salt]
    );

    return { success: true, message: "Admin user created successfully" };
  });

// 2. Real Login Verification
export const loginAdmin = createServerFn({ method: "POST" })
  .validator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const email = data.email.toLowerCase().trim();
    const password = data.password;

    const [rows]: any = await db.execute(
      "SELECT id, email, password_hash, password_salt, role FROM admin_users WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return { success: false, error: "Invalid email or password" };
    }

    const user = rows[0];
    const isValid = verifyPassword(password, user.password_hash, user.password_salt);

    if (!isValid) {
      return { success: false, error: "Invalid email or password" };
    }

    // Update last_login_at
    await db.execute("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", [user.id]);

    // Simple session payload (can be extended to signed token/JWT)
    const sessionToken = Buffer.from(
      JSON.stringify({ id: user.id, email: user.email, role: user.role, t: Date.now() })
    ).toString("base64");

    return {
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      token: sessionToken,
    };
  });
