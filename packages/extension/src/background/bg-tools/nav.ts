import type { Json } from "@atwebpilot/shared/types";
import { getCdpResizer } from "../recorder/host";

function asObj(raw: Json): Record<string, unknown> {
  return (raw ?? {}) as Record<string, unknown>;
}

/**
 * History navigation. Running off the end of the history is an ordinary
 * outcome, not a failure — an agent walking back through pages should get a
 * flag it can branch on rather than an exception it has to parse.
 */
export async function navigateBack(_raw: Json, tabId: number): Promise<Json> {
  return step(() => chrome.tabs.goBack(tabId), "navigateBack");
}

export async function navigateForward(_raw: Json, tabId: number): Promise<Json> {
  return step(() => chrome.tabs.goForward(tabId), "navigateForward");
}

async function step(run: () => Promise<void>, tool: string): Promise<Json> {
  try {
    await run();
    return { ok: true } as unknown as Json;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    if (/history|no next|no previous|cannot find/i.test(reason)) {
      return { ok: false, reason } as unknown as Json;
    }
    throw new Error(`${tool}: ${reason}`);
  }
}

/**
 * Sets the *viewport* to the requested size. `chrome.windows.update` sizes the
 * outer frame, so the browser chrome is measured and added back; without that
 * the page would come out short by the toolbar height.
 *
 * Under CDP the device-metrics override is used instead, which leaves the
 * user's real window alone.
 */
export async function resize(raw: Json, tabId: number): Promise<Json> {
  const { width, height } = asObj(raw) as { width?: number; height?: number };
  if (typeof width !== "number" || typeof height !== "number") {
    throw new Error("resize: width and height required");
  }

  const viaCdp = getCdpResizer(tabId);
  if (viaCdp) {
    await viaCdp(width, height);
    return { ok: true, width, height, backend: "cdp" } as unknown as Json;
  }

  const [probe] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      iw: window.innerWidth,
      ih: window.innerHeight,
      ow: window.outerWidth,
      oh: window.outerHeight
    })
  });
  const m = probe?.result as { iw: number; ih: number; ow: number; oh: number } | undefined;
  if (!m) throw new Error("resize: could not measure the viewport");

  const tab = await chrome.tabs.get(tabId);
  if (tab.windowId == null) throw new Error("resize: tab has no window");

  const chromeW = Math.max(0, m.ow - m.iw);
  const chromeH = Math.max(0, m.oh - m.ih);
  await chrome.windows.update(tab.windowId, {
    width: width + chromeW,
    height: height + chromeH
  });

  return {
    ok: true,
    width,
    height,
    backend: "main-world",
    chromeInset: { w: chromeW, h: chromeH }
  } as unknown as Json;
}
