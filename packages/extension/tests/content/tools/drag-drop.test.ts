import { beforeEach, describe, expect, it } from "vitest";
import { drag } from "@/content/tools/drag";
import { drop } from "@/content/tools/drop";

type DragOut = { ok: true; consumed: { pointer: boolean; html5: boolean } };
type DropOut = { ok: true; fileCount: number; consumed: { html5: boolean } };

describe("drag", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="src" draggable="true">s</div><div id="dst">d</div>`;
  });

  it("reports html5 consumption when the target preventDefaults dragover", async () => {
    document
      .querySelector("#dst")!
      .addEventListener("dragover", (e) => e.preventDefault());
    const out = (await drag({ fromSelector: "#src", toSelector: "#dst" })) as unknown as DragOut;
    expect(out.consumed.html5).toBe(true);
  });

  it("reports pointer consumption when the target preventDefaults pointermove", async () => {
    document
      .querySelector("#dst")!
      .addEventListener("pointermove", (e) => e.preventDefault());
    const out = (await drag({ fromSelector: "#src", toSelector: "#dst" })) as unknown as DragOut;
    expect(out.consumed.pointer).toBe(true);
  });

  it("reports neither when the page ignores the drag entirely", async () => {
    const out = (await drag({ fromSelector: "#src", toSelector: "#dst" })) as unknown as DragOut;
    expect(out.consumed).toEqual({ pointer: false, html5: false });
  });

  it("carries one DataTransfer from dragstart through to drop", async () => {
    document.querySelector("#src")!.addEventListener("dragstart", (e) => {
      (e as DragEvent).dataTransfer!.setData("text/plain", "payload");
    });
    let seen: string | null = null;
    document.querySelector("#dst")!.addEventListener("drop", (e) => {
      seen = (e as DragEvent).dataTransfer!.getData("text/plain");
    });
    await drag({ fromSelector: "#src", toSelector: "#dst" });
    expect(seen).toBe("payload");
  });

  it("dispatches the full sequence in order", async () => {
    const order: string[] = [];
    for (const t of ["pointerdown", "mousedown", "dragstart", "dragend"]) {
      document.querySelector("#src")!.addEventListener(t, () => order.push(`src:${t}`));
    }
    for (const t of ["dragenter", "dragover", "drop"]) {
      document.querySelector("#dst")!.addEventListener(t, () => order.push(`dst:${t}`));
    }
    await drag({ fromSelector: "#src", toSelector: "#dst" });
    expect(order).toEqual([
      "src:pointerdown",
      "src:mousedown",
      "src:dragstart",
      "dst:dragenter",
      "dst:dragover",
      "dst:drop",
      "src:dragend"
    ]);
  });

  it("rejects a missing target", async () => {
    await expect(drag({ fromSelector: "#src", toSelector: "#nope" })).rejects.toThrow(
      "target not found"
    );
  });

  it("rejects when neither selector nor uid is given", async () => {
    await expect(drag({ fromSelector: "#src" })).rejects.toThrow("target not found");
  });
});

describe("drop", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="zone">drop here</div>`;
  });

  it("delivers a file the page can read", async () => {
    let name: string | undefined;
    let count = -1;
    document.querySelector("#zone")!.addEventListener("drop", (e) => {
      const files = (e as DragEvent).dataTransfer!.files;
      count = files.length;
      name = files[0]?.name;
    });
    const out = (await drop({
      selector: "#zone",
      files: [{ name: "a.csv", mimeType: "text/csv", base64: btoa("x,y\n1,2") }]
    })) as unknown as DropOut;
    expect(out.fileCount).toBe(1);
    expect(count).toBe(1);
    expect(name).toBe("a.csv");
  });

  it("delivers typed data", async () => {
    let seen: string | null = null;
    document.querySelector("#zone")!.addEventListener("drop", (e) => {
      seen = (e as DragEvent).dataTransfer!.getData("text/plain");
    });
    await drop({ selector: "#zone", data: { "text/plain": "hello" } });
    expect(seen).toBe("hello");
  });

  it("reports zero files for a data-only drop", async () => {
    const out = (await drop({
      selector: "#zone",
      data: { "text/uri-list": "https://a.test" }
    })) as unknown as DropOut;
    expect(out.fileCount).toBe(0);
  });

  it("rejects a file without base64", async () => {
    await expect(
      drop({ selector: "#zone", files: [{ name: "a.csv" }] })
    ).rejects.toThrow("name and base64");
  });

  it("rejects invalid base64", async () => {
    await expect(
      drop({ selector: "#zone", files: [{ name: "a.bin", base64: "!!!not base64!!!" }] })
    ).rejects.toThrow("invalid base64");
  });

  it("rejects a missing target", async () => {
    await expect(drop({ selector: "#nope" })).rejects.toThrow("target not found");
  });
});
