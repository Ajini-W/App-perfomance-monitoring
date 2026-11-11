import { describe, expect, it } from "vitest";

import { originAllowed, pathPermitted } from "@/lib/replay-rules";

describe("pathPermitted", () => {
  it("permits demo pages under /demo* and rejects other pages", () => {
    expect(pathPermitted("/demo/products", ["/demo*"])).toBe(true);
    expect(pathPermitted("/demo", ["/demo*"])).toBe(true);
    expect(pathPermitted("/dashboard", ["/demo*"])).toBe(false);
  });

  it("supports wildcard and exact patterns", () => {
    expect(pathPermitted("/checkout/step-2", ["/*"])).toBe(true);
    expect(pathPermitted("/shop/item", ["/shop/*"])).toBe(true);
    expect(pathPermitted("/shop", ["/shop/*"])).toBe(false);
    expect(pathPermitted("/login", ["/login"])).toBe(true);
  });
});

describe("originAllowed", () => {
  it("allows any origin when * is configured", () => {
    expect(originAllowed("https://anywhere.example", ["*"])).toBe(true);
    expect(originAllowed(null, ["*"])).toBe(true);
  });

  it("requires an exact listed origin otherwise", () => {
    expect(originAllowed("https://shop.example.com", ["https://shop.example.com"])).toBe(true);
    expect(originAllowed("https://shop.example.com", ["https://shop.example.com/"])).toBe(true);
    expect(originAllowed("https://other.example.com", ["https://shop.example.com"])).toBe(false);
    expect(originAllowed(null, ["https://shop.example.com"])).toBe(false);
  });
});
