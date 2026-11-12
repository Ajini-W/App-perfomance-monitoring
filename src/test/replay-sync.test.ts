import { describe, expect, it } from "vitest";

import {
  findActiveSpanKeys,
  playbackToAbsolute,
  sameKeys,
  spanOffsetMs,
  toEpochMs,
} from "@/lib/replay-sync";

const START = Date.parse("2026-11-12T10:00:00.000Z");
const at = (ms: number) => new Date(START + ms).toISOString();
const span = (id: string, from: number, to: number) => ({
  id,
  span_id: id,
  trace_id: `trace-${id}`,
  start_time: at(from),
  end_time: at(to),
});

describe("replay ↔ trace time matching", () => {
  const spans = [
    span("a", 1000, 1200),
    span("b", 1100, 1500),
    span("c", 5000, 5050),
  ];

  it("converts the player offset to absolute time from the first rrweb timestamp", () => {
    expect(playbackToAbsolute(START, 2500)).toBe(START + 2500);
    expect(playbackToAbsolute(START, -10)).toBe(START);
  });

  it("highlights a span while playback is inside its start/end range", () => {
    expect([...findActiveSpanKeys(spans, START + 5020, 0)]).toEqual(["c"]);
  });

  it("highlights every span that overlaps the same moment", () => {
    expect([...findActiveSpanKeys(spans, START + 1150, 0)].sort()).toEqual([
      "a",
      "b",
    ]);
  });

  it("uses the matching window around short spans (500 ms default)", () => {
    expect(findActiveSpanKeys(spans, START + 5550).has("c")).toBe(true);
    expect(findActiveSpanKeys(spans, START + 5551).has("c")).toBe(false);
    expect(findActiveSpanKeys(spans, START + 4500).has("c")).toBe(true);
    expect(findActiveSpanKeys(spans, START + 4499).has("c")).toBe(false);
  });

  it("drops highlights once playback moves past a span (e.g. after a seek)", () => {
    expect(findActiveSpanKeys(spans, START + 1150, 0).size).toBe(2);
    expect(findActiveSpanKeys(spans, START + 3000, 0).size).toBe(0);
  });

  it("reads MySQL DATETIME strings and Date objects", () => {
    expect(toEpochMs("2026-11-12 10:00:01.250")).toBe(
      new Date("2026-11-12T10:00:01.250").getTime(),
    );
    expect(toEpochMs(new Date(START))).toBe(START);
    expect(
      spanOffsetMs(
        { start_time: new Date(START + 750), end_time: START + 800 },
        START,
      ),
    ).toBe(750);
  });

  it("compares highlight sets by content", () => {
    expect(sameKeys(new Set(["a", "b"]), new Set(["b", "a"]))).toBe(true);
    expect(sameKeys(new Set(["a"]), new Set(["a", "b"]))).toBe(false);
  });
});
