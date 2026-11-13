import crypto from "node:crypto";
import { db } from "@/lib/mysql";

export interface GeneratedApiKey {
  rawKey: string;
  keyPrefix: string;
  keyHash: string;
}

export interface AuthenticatedClient {
  clientId: string;
  clientName: string;
  clientEmail: string;
  keyId: string;
  keyName: string;
}

/**
 * Generates a high-entropy API key.
 * Format: rc_live_<64 hex characters>
 */
export function generateApiKey(prefix = "rc_live_"): GeneratedApiKey {
  const entropy = crypto.randomBytes(32).toString("hex"); // 256 bits of entropy
  const rawKey = `${prefix}${entropy}`;
  const keyPrefix = rawKey.slice(0, 12); // e.g. "rc_live_9f83"
  const keyHash = hashApiKey(rawKey);

  return { rawKey, keyPrefix, keyHash };
}

/**
 * Hashes an API key using SHA-256.
 */
export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Timing-safe hash comparison to eliminate timing attacks.
 */
export function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
