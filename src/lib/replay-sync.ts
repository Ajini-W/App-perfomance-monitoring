/**
 * Pure helpers that line up rrweb replay time with recorded OpenTelemetry spans.
 *
 * rrweb event timestamps and span start/end times are both wall-clock epoch milliseconds taken
 * in the same browser tab, so the replay's absolute playback time is:
 *   first rrweb event timestamp + player's current time offset.
 * A span "matches" while that time falls inside [start - window, end + window].
 */

/** How far (ms) before a span starts / after it ends it still counts as "happening now". */
export const DEFAULT_MATCH_WINDOW_MS = 500;

export type TimedSpan = {
  id?: string | null;
  span_id?: string | null;
  trace_id?: string | null;
  start_time: string | number | Date;
  end_time: string | number | Date;
};

export function toEpochMs(
  value: string | number | Date | null | undefined,
): number {
  if (value == null) return NaN;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  // MySQL DATETIME strings ("2026-11-12 01:02:03.456") are not ISO; normalise the separator.
  const normalised = /^\d{4}-\d{2}-\d{2} \d/.test(value)
    ? value.replace(" ", "T")
    : value;
  return new Date(normalised).getTime();
}

/** Stable key used by the trace panel for a span row. */
export function spanKey(span: TimedSpan): string {
  return String(
    span.id ||
      span.span_id ||
      `${span.trace_id ?? ""}:${toEpochMs(span.start_time)}`,
  );
}

/** Absolute (epoch ms) playback time from the replay start timestamp and the player offset. */
export function playbackToAbsolute(
  replayStartMs: number,
  currentOffsetMs: number,
): number {
  return replayStartMs + Math.max(0, currentOffsetMs);
}

/** Offset (ms) of a span start relative to the replay start; negative = before recording began. */
export function spanOffsetMs(span: TimedSpan, replayStartMs: number): number {
  return toEpochMs(span.start_time) - replayStartMs;
}

/** Keys of every span whose time range (widened by windowMs) contains absoluteTimeMs. */
export function findActiveSpanKeys(
  spans: TimedSpan[],
  absoluteTimeMs: number,
  windowMs: number = DEFAULT_MATCH_WINDOW_MS,
): Set<string> {
  const active = new Set<string>();
  if (!Number.isFinite(absoluteTimeMs)) return active;
  for (const span of spans) {
    const start = toEpochMs(span.start_time);
    if (!Number.isFinite(start)) continue;
    const endRaw = toEpochMs(span.end_time);
    const end = Number.isFinite(endRaw) && endRaw >= start ? endRaw : start;
    if (
      absoluteTimeMs >= start - windowMs &&
      absoluteTimeMs <= end + windowMs
    ) {
      active.add(spanKey(span));
    }
  }
  return active;
}

/** True when two key sets hold the same keys (lets the UI skip redundant re-renders). */
export function sameKeys(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const k of a) if (!b.has(k)) return false;
  return true;
}
