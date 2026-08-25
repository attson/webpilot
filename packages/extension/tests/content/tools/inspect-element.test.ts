import { beforeEach, describe, expect, it, vi } from "vitest";
import { inspectElement } from "@/content/tools/inspect-element";

describe("inspectElement", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <main id="shell" style="display:flex; box-sizing:border-box; position:relative">
        <section class="panel" style="display:grid; overflow:hidden">
          <button id="target" style="display:block; box-sizing:content-box">Save</button>
        </section>
      </main>`;
    Object.defineProperty(window, "scrollX", { configurable: true, value: 10 });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 20 });
    const target = document.querySelector("#target")!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      x: 30, y: 40, left: 30, top: 40, right: 130, bottom: 70,
      width: 100, height: 30, toJSON: () => ({})
    });
  });

  it("returns computed styles, viewport/document rects, and the ancestor chain", async () => {
    const result = await inspectElement({
      selector: "#target",
      ancestorDepth: 2,
      styleProperties: ["display", "boxSizing", "position", "overflow"]
    }) as Record<string, any>;

    expect(result.element.styles).toMatchObject({ display: "block", boxSizing: "content-box" });
    expect(result.element.rect.viewport).toMatchObject({ x: 30, y: 40, width: 100, height: 30 });
    expect(result.element.rect.document).toMatchObject({ x: 40, y: 60, width: 100, height: 30 });
    expect(result.ancestors.map((item: { tag: string }) => item.tag)).toEqual(["section", "main"]);
    expect(result.ancestors[0].styles).toMatchObject({ display: "grid", overflow: "hidden" });
    expect(result.root.type).toBe("document");
  });

  it("rejects missing targets and caps ancestor traversal", async () => {
    await expect(inspectElement({ selector: ".missing" })).rejects.toThrow("target not found");
    const result = await inspectElement({ selector: "#target", ancestorDepth: 99 }) as Record<string, any>;
    expect(result.ancestors.length).toBeLessThanOrEqual(10);
  });
});
