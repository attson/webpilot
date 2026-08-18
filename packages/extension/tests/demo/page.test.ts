import { beforeEach, describe, expect, it } from "vitest";
import { COMMENTS_ID, EXPAND_BUTTON_ID, mountMockPage } from "../../demo/page";
import { DEMO_ROUNDS } from "../../demo/scenario";

describe("mock product page", () => {
  beforeEach(() => {
    document.body.innerHTML = "<div id='root'></div>";
    mountMockPage(document.getElementById("root")!);
  });

  it("has the fields the scenario extracts", () => {
    expect(document.querySelector(".demo-title")?.textContent).toContain("办公椅");
    expect(document.querySelector(".demo-price")?.textContent).toContain("1,299");
    expect(document.querySelectorAll(".demo-specs tr").length).toBeGreaterThanOrEqual(4);
  });

  it("starts with the comments collapsed", () => {
    expect(document.querySelector<HTMLElement>(`#${COMMENTS_ID}`)!.hidden).toBe(true);
  });

  it("reveals exactly three comments when the button is clicked", () => {
    document.querySelector<HTMLButtonElement>(`#${EXPAND_BUTTON_ID}`)!.click();
    const list = document.querySelector<HTMLElement>(`#${COMMENTS_ID}`)!;
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll(".demo-comment")).toHaveLength(3);
  });

  it("updates the button once expanded", () => {
    const b = document.querySelector<HTMLButtonElement>(`#${EXPAND_BUTTON_ID}`)!;
    b.click();
    expect(b.textContent).toContain("收起");
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });

  it("resolves every selector the scenario names", () => {
    const selectors = DEMO_ROUNDS.flat()
      .filter((e) => e.type === "tool_use_end")
      .map((e) => (e as { input?: { selector?: string } }).input?.selector)
      .filter((s): s is string => typeof s === "string");
    expect(selectors.length).toBeGreaterThan(0);
    for (const sel of selectors) {
      expect(document.querySelector(sel), sel).not.toBeNull();
    }
  });

  it("is idempotent — remounting resets the collapse", () => {
    document.querySelector<HTMLButtonElement>(`#${EXPAND_BUTTON_ID}`)!.click();
    mountMockPage(document.getElementById("root")!);
    expect(document.querySelector<HTMLElement>(`#${COMMENTS_ID}`)!.hidden).toBe(true);
  });
});
