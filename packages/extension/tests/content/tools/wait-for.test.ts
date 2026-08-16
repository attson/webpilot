import { describe, expect, it } from "vitest";
import { waitFor } from "@/content/tools/wait-for";

describe("waitFor", () => {
  it("waits for fixed ms", async () => {
    const start = Date.now();
    const r = await waitFor({ ms: 30 });
    expect(Date.now() - start).toBeGreaterThanOrEqual(28);
    expect((r as Record<string, unknown>).reason).toBe("ms");
  });

  it("returns when selector appears", async () => {
    setTimeout(() => {
      const d = document.createElement("div");
      d.className = "ready";
      document.body.appendChild(d);
    }, 20);
    const r = (await waitFor({ selector: ".ready", timeoutMs: 200 })) as Record<string, unknown>;
    expect(r.reason).toBe("selector");
  });

  it("times out if selector never appears", async () => {
    document.body.innerHTML = "";
    const r = (await waitFor({ selector: ".never", timeoutMs: 30 })) as Record<string, unknown>;
    expect(r.reason).toBe("timeout");
  });
});

describe("waitFor — Plan 32 text predicates", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="host">initial</div>`;
  });

  it("resolves immediately when the text is already present", async () => {
    const out = await waitFor({ text: "initial" });
    expect(out).toEqual({ reason: "text" });
  });

  it("resolves once the text appears", async () => {
    setTimeout(() => {
      document.querySelector("#host")!.textContent = "loaded now";
    }, 20);
    const out = await waitFor({ text: "loaded now", timeoutMs: 2000 });
    expect(out).toEqual({ reason: "text" });
  });

  it("times out when the text never appears", async () => {
    const out = await waitFor({ text: "never", timeoutMs: 60 });
    expect(out).toEqual({ reason: "timeout" });
  });

  it("resolves immediately when textGone is already absent", async () => {
    const out = await waitFor({ textGone: "absent" });
    expect(out).toEqual({ reason: "textGone" });
  });

  it("resolves once the text disappears", async () => {
    setTimeout(() => {
      document.querySelector("#host")!.textContent = "";
    }, 20);
    const out = await waitFor({ textGone: "initial", timeoutMs: 2000 });
    expect(out).toEqual({ reason: "textGone" });
  });

  it("times out when the text stays", async () => {
    const out = await waitFor({ textGone: "initial", timeoutMs: 60 });
    expect(out).toEqual({ reason: "timeout" });
  });
});
