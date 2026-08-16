import { beforeEach, describe, expect, it } from "vitest";
import { click } from "@/content/tools/click";

describe("click", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="b">x</button>`;
  });

  it("clicks the matching element", async () => {
    let clicked = false;
    document.querySelector("#b")!.addEventListener("click", () => {
      clicked = true;
    });
    const r = await click({ selector: "#b" });
    expect(clicked).toBe(true);
    expect((r as Record<string, unknown>).clicked).toBe(true);
  });

  it("returns clicked=false when selector misses (and required=false)", async () => {
    const r = await click({ selector: ".missing", required: false });
    expect((r as Record<string, unknown>).clicked).toBe(false);
  });

  it("throws when selector misses and required=true", async () => {
    await expect(click({ selector: ".missing", required: true })).rejects.toThrow();
  });
});

describe("click — Plan 32 options", () => {
  beforeEach(() => {
    document.body.innerHTML = `<button id="b">go</button>`;
  });

  it("emits dblclick when doubleClick is set", async () => {
    const seen: string[] = [];
    const el = document.querySelector("#b")!;
    el.addEventListener("click", () => seen.push("click"));
    el.addEventListener("dblclick", () => seen.push("dblclick"));
    await click({ selector: "#b", doubleClick: true });
    expect(seen).toEqual(["click", "click", "dblclick"]);
  });

  it("emits contextmenu for the right button and no click", async () => {
    const seen: string[] = [];
    const el = document.querySelector("#b")!;
    el.addEventListener("contextmenu", () => seen.push("contextmenu"));
    el.addEventListener("click", () => seen.push("click"));
    await click({ selector: "#b", button: "right" });
    expect(seen).toEqual(["contextmenu"]);
  });

  it("carries modifier keys onto the event", async () => {
    let mods: Record<string, boolean> | null = null;
    document.querySelector("#b")!.addEventListener("click", (e) => {
      const m = e as MouseEvent;
      mods = { alt: m.altKey, ctrl: m.ctrlKey, meta: m.metaKey, shift: m.shiftKey };
    });
    await click({ selector: "#b", modifiers: ["Shift", "Control"] });
    expect(mods).toEqual({ alt: false, ctrl: true, meta: false, shift: true });
  });

  it("still uses the plain path with no options", async () => {
    let count = 0;
    document.querySelector("#b")!.addEventListener("click", () => (count += 1));
    await click({ selector: "#b" });
    expect(count).toBe(1);
  });
});
