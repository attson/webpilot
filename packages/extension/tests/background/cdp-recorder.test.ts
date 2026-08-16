import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CdpRecorder,
  attachCdp,
  detachCdp,
  getAttachedCdpRecorder,
  installCdpListeners
} from "@/background/recorder/cdp";
import { getRecorder, registerCdpLookup, registerInjectMain } from "@/background/recorder/host";

const realChrome = globalThis.chrome;

type Listener = (...a: unknown[]) => void;

function fakeChrome(opts: { attachFails?: string; enabled?: boolean } = {}) {
  const listeners: Record<string, Listener[]> = { onEvent: [], onDetach: [], onRemoved: [] };
  const sendCommand = vi.fn(async () => ({}) as unknown);
  const chromeStub = {
    debugger: {
      attach: vi.fn(async () => {
        if (opts.attachFails) throw new Error(opts.attachFails);
      }),
      detach: vi.fn(async () => undefined),
      sendCommand,
      onEvent: { addListener: (f: Listener) => listeners.onEvent.push(f) },
      onDetach: { addListener: (f: Listener) => listeners.onDetach.push(f) }
    },
    tabs: { onRemoved: { addListener: (f: Listener) => listeners.onRemoved.push(f) } },
    permissions: { contains: vi.fn(async () => opts.enabled !== false) },
    storage: {
      local: {
        get: vi.fn(async () => ({ cdpRecorderEnabled: opts.enabled !== false })),
        set: vi.fn(async () => undefined)
      }
    }
  };
  globalThis.chrome = chromeStub as unknown as typeof chrome;
  return { listeners, sendCommand, chromeStub };
}

beforeEach(() => {
  registerCdpLookup(() => null);
  registerInjectMain(async () => ({ missing: true }) as never);
});

afterEach(async () => {
  await detachCdp(1).catch(() => undefined);
  globalThis.chrome = realChrome;
  vi.restoreAllMocks();
});

describe("attachCdp", () => {
  it("returns null and records why when the tab is already claimed", async () => {
    fakeChrome({ attachFails: "Another debugger is already attached to the tab with id: 1" });
    installCdpListeners();
    expect(await attachCdp(1)).toBeNull();

    const rec = getRecorder(1);
    expect(rec.backend).toBe("main-world");
    const out = await rec.readConsole({});
    expect(out.degradedReason).toContain("attach failed");
  });

  it("returns null when the setting is off", async () => {
    fakeChrome({ enabled: false });
    expect(await attachCdp(1)).toBeNull();
  });

  it("enables the domains it needs on success", async () => {
    const { chromeStub } = fakeChrome();
    installCdpListeners();
    const rec = await attachCdp(1);
    expect(rec).not.toBeNull();
    const enabled = chromeStub.debugger.sendCommand.mock.calls.map(
      (c) => (c as unknown as [unknown, string])[1]
    );
    expect(enabled).toEqual(
      expect.arrayContaining(["Runtime.enable", "Log.enable", "Network.enable", "Page.enable"])
    );
  });
});

describe("event ingestion", () => {
  it("routes console API calls into the ring with a cdp backend tag", async () => {
    fakeChrome();
    const rec = new CdpRecorder(1);
    rec.handleEvent("Runtime.consoleAPICalled", {
      type: "warning",
      args: [{ value: "careful" }, { description: "Object" }]
    });
    const out = await rec.readConsole({});
    expect(out.backend).toBe("cdp");
    expect(out.messages[0].level).toBe("warn");
    expect(out.messages[0].text).toBe("careful Object");
  });

  it("captures browser-level log entries the MAIN world cannot see", async () => {
    fakeChrome();
    const rec = new CdpRecorder(1);
    rec.handleEvent("Log.entryAdded", {
      entry: { level: "error", text: "CORS blocked", url: "https://a.test", lineNumber: 3 }
    });
    const out = await rec.readConsole({ level: "error" });
    expect(out.messages[0].text).toBe("CORS blocked");
    expect(out.messages[0].line).toBe(3);
  });

  it("correlates a request with its response", async () => {
    fakeChrome();
    const rec = new CdpRecorder(1);
    rec.handleEvent("Network.requestWillBeSent", {
      requestId: "r1",
      request: { method: "post", url: "https://a.test/api", headers: { a: "b" } },
      type: "XHR"
    });
    rec.handleEvent("Network.responseReceived", {
      requestId: "r1",
      response: { status: 500, statusText: "Server Error", headers: { "content-type": "text/plain" } }
    });
    const out = await rec.readNetwork({});
    expect(out.requests).toHaveLength(1);
    expect(out.requests[0].method).toBe("POST");
    expect(out.requests[0].status).toBe(500);
  });

  it("records a loading failure against the right entry", async () => {
    fakeChrome();
    const rec = new CdpRecorder(1);
    rec.handleEvent("Network.requestWillBeSent", {
      requestId: "r1",
      request: { method: "GET", url: "https://a.test/x" }
    });
    rec.handleEvent("Network.loadingFailed", { requestId: "r1", errorText: "net::ERR_FAILED" });
    const out = await rec.readNetwork({});
    expect(out.requests[0].error).toBe("net::ERR_FAILED");
  });

  it("fetches a response body lazily", async () => {
    const { sendCommand } = fakeChrome();
    sendCommand.mockResolvedValue({ body: "hello", base64Encoded: false } as never);
    const rec = new CdpRecorder(1);
    rec.handleEvent("Network.requestWillBeSent", {
      requestId: "r1",
      request: { method: "GET", url: "https://a.test/x" }
    });
    const d = await rec.readNetworkDetail({ id: 1 });
    expect(d.detail?.responseBody).toBe("hello");
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      "Network.getResponseBody",
      { requestId: "r1" }
    );
  });
});

describe("dialogs under CDP", () => {
  it("answers a pending dialog as soon as a policy arrives", async () => {
    const { sendCommand } = fakeChrome();
    const rec = new CdpRecorder(1);
    rec.handleEvent("Page.javascriptDialogOpening", { message: "sure?", type: "confirm" });
    // Nothing answered yet — the page is suspended.
    expect(sendCommand).not.toHaveBeenCalledWith(
      { tabId: 1 },
      "Page.handleJavaScriptDialog",
      expect.anything()
    );

    const out = await rec.setDialogPolicy({ accept: true, scope: "next" });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      "Page.handleJavaScriptDialog",
      expect.objectContaining({ accept: true })
    );
    expect(out.dialogs.at(-1)!.handled).toBe("accepted");
  });

  it("applies a standing policy to a dialog that opens later", async () => {
    const { sendCommand } = fakeChrome();
    const rec = new CdpRecorder(1);
    await rec.setDialogPolicy({ accept: false, scope: "all" });
    rec.handleEvent("Page.javascriptDialogOpening", { message: "leave?", type: "confirm" });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      "Page.handleJavaScriptDialog",
      expect.objectContaining({ accept: false })
    );
  });

  it("passes promptText through for a prompt", async () => {
    const { sendCommand } = fakeChrome();
    const rec = new CdpRecorder(1);
    await rec.setDialogPolicy({ accept: true, promptText: "typed", scope: "all" });
    rec.handleEvent("Page.javascriptDialogOpening", { message: "name?", type: "prompt" });
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      "Page.handleJavaScriptDialog",
      expect.objectContaining({ accept: true, promptText: "typed" })
    );
  });
});

describe("degradation", () => {
  it("falls back to main-world with a reason when the debugger detaches", async () => {
    const { listeners } = fakeChrome();
    installCdpListeners();
    await attachCdp(1);
    expect(getAttachedCdpRecorder(1)).not.toBeNull();

    for (const f of listeners.onDetach) f({ tabId: 1 }, "canceled_by_user");

    expect(getAttachedCdpRecorder(1)).toBeNull();
    const rec = getRecorder(1);
    expect(rec.backend).toBe("main-world");
    const out = await rec.readConsole({});
    expect(out.degradedReason).toContain("canceled_by_user");
  });

  it("drops recorder state when the tab closes", async () => {
    const { listeners } = fakeChrome();
    installCdpListeners();
    await attachCdp(1);
    for (const f of listeners.onRemoved) f(1);
    expect(getAttachedCdpRecorder(1)).toBeNull();
  });

  it("routes resize through Emulation while attached", async () => {
    const { sendCommand } = fakeChrome();
    installCdpListeners();
    const rec = await attachCdp(1);
    await rec!.setViewport(1280, 800);
    expect(sendCommand).toHaveBeenCalledWith(
      { tabId: 1 },
      "Emulation.setDeviceMetricsOverride",
      expect.objectContaining({ width: 1280, height: 800 })
    );
  });
});
