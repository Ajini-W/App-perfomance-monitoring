import { db } from "@/lib/mysql";
import { hashApiKey, safeCompare, type AuthenticatedClient } from "./api-key-service";

export type AuthResult =
  | { success: true; client: AuthenticatedClient }
  | { success: false; status: number; error: string; code: string };

/**
 * Validates the X-API-Key header against the database.
 */
export async function authenticateApiKey(request: Request): Promise<AuthResult> {
  const apiKey = request.headers.get("x-api-key") || request.headers.get("X-API-Key");

  if (!apiKey) {
    return {
      success: false,
      status: 401,
      code: "API_KEY_MISSING",
      error: "Missing API key. Provide your key in the 'X-API-Key' header.",
    };
  }

  // Basic sanity check on format
  if (!apiKey.startsWith("rc_live_") && !apiKey.startsWith("rc_test_")) {
    return {
      success: false,
      status: 401,
      code: "API_KEY_INVALID_FORMAT",
      error: "Invalid API key format.",
    };
  }

  const incomingHash = hashApiKey(apiKey);
  const keyPrefix = apiKey.slice(0, 12);

  try {
    // 1. Look up by prefix & active status for index performance
    const [rows]: any = await db.execute(
      `SELECT k.id AS key_id, k.name AS key_name, k.key_hash, k.status AS key_status, 
              k.expires_at, k.revoked_at,
              c.id AS client_id, c.name AS client_name, c.email AS client_email, c.status AS client_status
       FROM api_keys k
       JOIN clients c ON c.id = k.client_id
       WHERE k.key_prefix = ?
       LIMIT 5`,
      [keyPrefix]
    );

    if (!rows || rows.length === 0) {
      return {
        success: false,
        status: 401,
        code: "API_KEY_INVALID",
        error: "Invalid or unknown API key.",
      };
    }

    // 2. Perform timing-safe hash comparison across matches
    const matchedKey = rows.find((r: any) => safeCompare(r.key_hash, incomingHash));

    if (!matchedKey) {
      return {
        success: false,
        status: 401,
        code: "API_KEY_INVALID",
        error: "Invalid or unknown API key.",
      };
    }

    // 3. Verify key status
    if (matchedKey.key_status === "revoked" || matchedKey.revoked_at) {
      return {
        success: false,
        status: 403,
        code: "API_KEY_REVOKED",
        error: "This API key has been revoked.",
      };
    }

    if (matchedKey.expires_at && new Date(matchedKey.expires_at).getTime() < Date.now()) {
      return {
        success: false,
        status: 403,
        code: "API_KEY_EXPIRED",
        error: "This API key has expired.",
      };
    }

    // 4. Verify client status
    if (matchedKey.client_status !== "active") {
      return {
        success: false,
        status: 403,
        code: "CLIENT_INACTIVE",
        error: `Client account is ${matchedKey.client_status}. Contact support.`,
      };
    }

    // 5. Update last_used_at asynchronously (non-blocking)
    db.execute("UPDATE api_keys SET last_used_at = NOW(3) WHERE id = ?", [matchedKey.key_id]).catch((err) =>
      console.error("[api-key] Failed to update last_used_at:", err)
    );

    return {
      success: true,
      client: {
        clientId: matchedKey.client_id,
        clientName: matchedKey.client_name,
        clientEmail: matchedKey.client_email,
        keyId: matchedKey.key_id,
        keyName: matchedKey.key_name,
      },
    };
  } catch (err) {
    console.error("[api-key] Authentication database error:", err);
    return {
      success: false,
      status: 500,
      code: "INTERNAL_ERROR",
      error: "Authentication service unavailable.",
    };
  }
}
