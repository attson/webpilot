import { describe, expect, it, vi } from "vitest";
import { MainWorldRecorder } from "@/background/recorder/main-world-host";

const drainOk = () => ({
  config: { console: true, network: true, bodies: false, dialog: false },
  console: {
    dropped: 2,
    entries: [
      { id: 1, ts: 1, level: "log", text: "a" },
      { id: 2, ts: 2, level: "error", text: "b" }
    ]
  },
  network: {
    dropped: 0,
    entries: [
      { id: 3, ts: 3, method: "GET", url: "https://a.test/x", status: 200 },
      { id: 4, ts: 4, method: "GET", url: "https://a.test/y.css", observed: true }
    ]
  },
  dialog: {
    dropped: 0,
    entries: [{ id: 5, ts: 5, kind: "confirm", message: "ok?", handled: "passthrough" }]
  }
});

describe("MainWorldRecorder", () => {
  it("tags results with the main-world backend and applies filters", async () => {
    const r = new MainWorldRecorder(1, vi.fn(async () => drainOk()));
    const out = await r.readConsole({ level: "error" });
    expect(out.backend).toBe("main-world");
    expect(out.dropped).toBe(2);
    expect(out.messages.map((m) => m.id)).toEqual([2]);

    const net = await r.readNetwork({});
    expect(net.requests.map((e) => e.id)).toEqual([3]);
    expect(net.backend).toBe("main-world");
  });

  it("reports a missing recorder instead of throwing", async () => {
    const r = new MainWorldRecorder(1, vi.fn(async () => ({ missing: true })));
    const out = await r.readConsole({});
    expect(out.messages).toEqual([]);
    expect(out.disabled).toContain("not installed");
    expect(out.dropped).toBe(0);
  });

  it("treats an injection failure as a missing recorder, not an error", async () => {
    const r = new MainWorldRecorder(
      1,
      vi.fn(async () => {
        throw new Error("Cannot access a chrome:// URL");
      })
    );
    await expect(r.readNetwork({})).resolves.toMatchObject({ requests: [] });
  });

  it("carries a degradation reason forward", async () => {
    const r = new MainWorldRecorder(1, vi.fn(async () => drainOk()), "debugger detached: canceled_by_user");
    const out = await r.readConsole({});
    expect(out.degradedReason).toContain("debugger detached");
  });

  it("explains why a body is unavailable when capture is disarmed", async () => {
    const drain = vi.fn(async (ctx: unknown) => {
      const op = (ctx as { op: string }).op;
      return op === "detail"
        ? {
            detail: { id: 3, ts: 3, method: "GET", url: "https://a.test/x", status: 200 },
            config: { console: true, network: true, bodies: false, dialog: false }
          }
        : drainOk();
    });
    const r = new MainWorldRecorder(1, drain);
    const d = await r.readNetworkDetail({ id: 3 });
    expect(d.detail?.bodyUnavailable).toContain("recorderConfig");
  });

  it("does not claim a body is missing when capture is armed", async () => {
    const drain = vi.fn(async () => ({
      detail: {
        id: 3,
        ts: 3,
        method: "GET",
        url: "https://a.test/x",
        status: 200,
        responseBody: "hi"
      },
      config: { console: true, network: true, bodies: true, dialog: false }
    }));
    const r = new MainWorldRecorder(1, drain);
    const d = await r.readNetworkDetail({ id: 3 });
    expect(d.detail?.bodyUnavailable).toBeUndefined();
    expect(d.detail?.responseBody).toBe("hi");
  });

  it("projects a single requested part", async () => {
    const drain = vi.fn(async () => ({
      detail: {
        id: 3,
        ts: 3,
        method: "GET",
        url: "https://a.test/x",
        status: 200,
        responseHeaders: { "content-type": "text/plain" },
        responseBody: "hi"
      },
      config: { console: true, network: true, bodies: true, dialog: false }
    }));
    const r = new MainWorldRecorder(1, drain);
    const d = await r.readNetworkDetail({ id: 3, part: "response-headers" });
    expect(d.detail?.responseHeaders).toEqual({ "content-type": "text/plain" });
    expect(d.detail?.responseBody).toBeUndefined();
  });

  it("setDialogPolicy pushes the policy then returns the log", async () => {
    const drain = vi.fn(async (ctx: unknown) => {
      const op = (ctx as { op: string }).op;
      return op === "setDialogPolicy" ? { ok: true } : drainOk();
    });
    const r = new MainWorldRecorder(1, drain);
    const out = await r.setDialogPolicy({ accept: true, scope: "next" });
    expect(drain).toHaveBeenCalledWith(
      expect.objectContaining({ op: "setDialogPolicy", policy: { accept: true, scope: "next" } })
    );
    expect(out.dialogs.map((d) => d.id)).toEqual([5]);
  });

  it("configure returns the applied config", async () => {
    const drain = vi.fn(async () => ({
      config: { console: true, network: true, bodies: true, dialog: true }
    }));
    const r = new MainWorldRecorder(1, drain);
    const out = await r.configure({ bodies: true, dialog: true });
    expect(out.config.bodies).toBe(true);
    expect(out.backend).toBe("main-world");
  });
});
