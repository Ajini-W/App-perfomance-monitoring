/** Pure rules shared by the ingest API (and covered by tests). */

/** Glob match where "*" matches any characters, e.g. "/shop/*" or "/demo*". */
export function pathPermitted(path: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const re = new RegExp(
      "^" +
        p
          .split("*")
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*") +
        "$",
    );
    return re.test(path);
  });
}

/** "*" allows any origin; otherwise the exact origin (scheme + host + port) must be listed. */
export function originAllowed(origin: string | null, allowed: string[]): boolean {
  if (allowed.includes("*")) return true;
  if (!origin) return false;
  return allowed.map((o) => o.replace(/\/$/, "")).includes(origin);
}
