import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Plain text password-ah salt generate panni hash pannum
 */
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return { hash, salt };
}

/**
 * User kudukura password-um DB-la irukura hash-um match aagutha nu timing-safe check pannum
 */
export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const hashedBuffer = scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(hash, "hex");
    return timingSafeEqual(hashedBuffer, keyBuffer);
  } catch {
    return false;
  }
}
