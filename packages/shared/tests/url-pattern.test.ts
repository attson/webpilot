import { describe, expect, it } from "vitest";
import { compilePattern, matchesAny } from "../src/url-pattern";

describe("url-pattern", () => {
  it("compilePattern matches Shop goods page", () => {
    const re = compilePattern("https://shop.example.com/goods*.html*");
    expect(re.test("https://shop.example.com/goods.html?id=1")).toBe(true);
    expect(re.test("https://shop.example.com/goods_detail.html")).toBe(true);
    expect(re.test("https://other.com/goods.html")).toBe(false);
  });

  it("single * does not cross /", () => {
    const re = compilePattern("https://example.com/*");
    expect(re.test("https://example.com/foo")).toBe(true);
    expect(re.test("https://example.com/foo/bar")).toBe(false);
  });

  it("double ** crosses /", () => {
    const re = compilePattern("https://example.com/**");
    expect(re.test("https://example.com/foo")).toBe(true);
    expect(re.test("https://example.com/foo/bar")).toBe(true);
  });

  it("matchesAny returns true if any pattern matches", () => {
    const url = "https://shop.example.com/goods.html";
    expect(matchesAny(url, ["https://other.com/*", "https://*.example.com/**"])).toBe(true);
    expect(matchesAny(url, ["https://other.com/*"])).toBe(false);
  });

  it("special regex chars are escaped", () => {
    const re = compilePattern("https://example.com/a.b+c?d=1");
    expect(re.test("https://example.com/a.b+c?d=1")).toBe(true);
    expect(re.test("https://example.com/aXb+cYd=1")).toBe(false);
  });
});
