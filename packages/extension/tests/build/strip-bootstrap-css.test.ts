import { describe, expect, it } from "vitest";
import { bootstrapHasPageCss, stripBootstrapCss } from "../../build/strip-bootstrap-css";

describe("stripBootstrapCss", () => {
  it("removes CRXJS-inferred page CSS from the ordinary bootstrap entry", () => {
    const manifest = {
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["assets/bootstrap.ts-loader-abc.js"],
          css: ["assets/sidepanel.css"]
        },
        {
          matches: ["https://example.com/*"],
          js: ["assets/other.js"],
          css: ["assets/intentional.css"]
        }
      ]
    };

    expect(stripBootstrapCss(manifest)).toEqual({
      content_scripts: [
        {
          matches: ["<all_urls>"],
          js: ["assets/bootstrap.ts-loader-abc.js"]
        },
        {
          matches: ["https://example.com/*"],
          js: ["assets/other.js"],
          css: ["assets/intentional.css"]
        }
      ]
    });
    expect(bootstrapHasPageCss(manifest)).toBe(false);
  });

  it("does not remove CSS from a non-bootstrap all-url entry", () => {
    const manifest = {
      content_scripts: [{ matches: ["<all_urls>"], js: ["assets/other.js"], css: ["other.css"] }]
    };
    expect(stripBootstrapCss(manifest).content_scripts?.[0].css).toEqual(["other.css"]);
  });
});
