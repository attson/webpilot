import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerCaptureDeps, screenshot } from "@/background/bg-tools/capture";
import { PAGE_METRICS_SOURCE, SCROLL_TO_SOURCE, STITCH_SOURCE } from "@/content/tools/page-metrics";

const realChrome = globalThis.chrome;

type Metrics = { scrollHeight: number; clientHeight: number; clientWidth: number; scrollY: number };

/** Simulates the page side of the band loop. */
function harness(metrics: Metrics) {
  const scrolls: number[] = [];
  let stitchBands: Array<{ y: number }> = [];
  const runStep = vi.fn(async ({ step, bindings }: { step: { source?: string }; bindings?: Record<string, unknown> }) => {
    const src = step.source ?? "";
    if (src === PAGE_METRICS_SOURCE) return metrics as never;
    if (src === SCROLL_TO_SOURCE) {
      const y = bindings?.y as number;
      scrolls.push(y);
      return { scrollY: y } as never;
    }
    if (src === STITCH_SOURCE) {
      stitchBands = bindings?.bands as Array<{ y: number }>;
      return { ok: true, dataUrl: "data:image/png;base64,QUJD" } as never;
    }
    throw new Error(`unexpected step source`);
  });
  registerCaptureDeps({ runStep: runStep as never });
  return { runStep, scrolls, bands: () => stitchBands };
}

let captureVisibleTab: ReturnType<typeof vi.fn>;

beforeEach(() => {
  captureVisibleTab = vi.fn(async () => "data:image/png;base64,QUJD");
  globalThis.chrome = {
    tabs: { get: vi.fn(async () => ({ windowId: 9 })), captureVisibleTab }
  } as unknown as typeof chrome;
});

afterEach(() => {
  globalThis.chrome = realChrome;
  vi.restoreAllMocks();
});

describe("screenshot — fullPage", () => {
  it("captures one band per viewport height", async () => {
    const h = harness({ scrollHeight: 2400, clientHeight: 800, clientWidth: 1000, scrollY: 0 });
    const out = (await screenshot({ fullPage: true } as never, 1)) as unknown as {
      fullPage: boolean;
      bands: number;
      media_type: string;
    };
    expect(out.fullPage).toBe(true);
    expect(out.bands).toBe(3);
    expect(captureVisibleTab).toHaveBeenCalledTimes(3);
    expect(h.scrolls.slice(0, 3)).toEqual([0, 800, 1600]);
  });

  it("restores the original scroll position afterwards", async () => {
    const h = harness({ scrollHeight: 1600, clientHeight: 800, clientWidth: 1000, scrollY: 450 });
    await screenshot({ fullPage: true } as never, 1);
    expect(h.scrolls.at(-1)).toBe(450);
  });

  it("restores the scroll position even when a capture fails", async () => {
    const h = harness({ scrollHeight: 1600, clientHeight: 800, clientWidth: 1000, scrollY: 120 });
    captureVisibleTab.mockRejectedValueOnce(new Error("quota exceeded"));
    await expect(screenshot({ fullPage: true } as never, 1)).rejects.toThrow("quota");
    expect(h.scrolls.at(-1)).toBe(120);
  });

  it("caps the band count and flags truncation", async () => {
    harness({ scrollHeight: 800 * 50, clientHeight: 800, clientWidth: 1000, scrollY: 0 });
    const out = (await screenshot({ fullPage: true } as never, 1)) as unknown as {
      bands: number;
      truncated: boolean;
      wantedBands: number;
    };
    expect(out.bands).toBe(20);
    expect(out.truncated).toBe(true);
    expect(out.wantedBands).toBe(50);
  });

  it("does not flag truncation for a short page", async () => {
    harness({ scrollHeight: 800, clientHeight: 800, clientWidth: 1000, scrollY: 0 });
    const out = (await screenshot({ fullPage: true } as never, 1)) as unknown as {
      truncated?: boolean;
    };
    expect(out.truncated).toBeUndefined();
  });

  it("passes format and scale through to stitching", async () => {
    const h = harness({ scrollHeight: 800, clientHeight: 800, clientWidth: 1000, scrollY: 0 });
    const out = (await screenshot({ fullPage: true, format: "jpeg", scale: 0.5 } as never, 1)) as unknown as {
      media_type: string;
    };
    const stitchCall = h.runStep.mock.calls.find(
      (c) => (c[0] as { step: { source?: string } }).step.source === STITCH_SOURCE
    )!;
    const bindings = (stitchCall[0] as { bindings: Record<string, unknown> }).bindings;
    expect(bindings.format).toBe("jpeg");
    expect(bindings.scale).toBe(0.5);
    expect(out.media_type).toBe("image/jpeg");
  });

  it("surfaces a stitching failure", async () => {
    registerCaptureDeps({
      runStep: (async ({ step }: { step: { source?: string } }) => {
        if (step.source === PAGE_METRICS_SOURCE) {
          return { scrollHeight: 800, clientHeight: 800, clientWidth: 1000, scrollY: 0 };
        }
        if (step.source === SCROLL_TO_SOURCE) return { scrollY: 0 };
        return { ok: false, error: "canvas 2d context unavailable" };
      }) as never
    });
    await expect(screenshot({ fullPage: true } as never, 1)).rejects.toThrow(
      "canvas 2d context unavailable"
    );
  });
});
