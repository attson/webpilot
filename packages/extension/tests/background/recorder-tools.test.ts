import { beforeEach, describe, expect, it, vi } from "vitest";
import { META_TOOLS } from "@/background/meta-tool-router";
import { registerCdpLookup } from "@/background/recorder/host";

/** Stands in for a PageRecorder so the adapters can be tested in isolation. */
function fakeRecorder() {
  return {
    backend: "cdp" as const,
    readConsole: vi.fn(async (q: unknown) => ({ backend: "cdp", dropped: 0, messages: [], q })),
    readNetwork: vi.fn(async (q: unknown) => ({ backend: "cdp", dropped: 1, requests: [], q })),
    readNetworkDetail: vi.fn(async () => ({ backend: "cdp", detail: null })),
    setDialogPolicy: vi.fn(async () => ({
      backend: "cdp",
      dropped: 0,
      dialogs: [{ id: 1, ts: 1, kind: "confirm", message: "ok?", handled: "accepted" }]
    })),
    readDialogs: vi.fn(async () => ({ backend: "cdp", dropped: 0, dialogs: [] })),
    configure: vi.fn(async (patch: unknown) => ({
      backend: "cdp",
      config: { console: true, network: true, bodies: true, dialog: true },
      patch
    }))
  };
}

let rec: ReturnType<typeof fakeRecorder>;

beforeEach(() => {
  rec = fakeRecorder();
  registerCdpLookup(() => rec as never);
});

describe("recorder tool adapters", () => {
  it("consoleMessages forwards the query and passes backend through", async () => {
    const out = (await META_TOOLS.consoleMessages(
      { level: "error", limit: 25 } as never,
      7
    )) as unknown as { backend: string };
    expect(out.backend).toBe("cdp");
    expect(rec.readConsole).toHaveBeenCalledWith(
      expect.objectContaining({ level: "error", limit: 25 })
    );
  });

  it("consoleMessages defaults the limit", async () => {
    await META_TOOLS.consoleMessages({} as never, 7);
    expect(rec.readConsole).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it("networkRequests hides static resources unless asked", async () => {
    await META_TOOLS.networkRequests({} as never, 7);
    expect(rec.readNetwork).toHaveBeenCalledWith(
      expect.objectContaining({ includeStatic: false, limit: 50 })
    );
    await META_TOOLS.networkRequests({ includeStatic: true } as never, 7);
    expect(rec.readNetwork).toHaveBeenLastCalledWith(
      expect.objectContaining({ includeStatic: true })
    );
  });

  it("networkRequestDetail requires an id", async () => {
    await expect(META_TOOLS.networkRequestDetail({} as never, 7)).rejects.toThrow("id required");
  });

  it("networkRequestDetail forwards id and part", async () => {
    await META_TOOLS.networkRequestDetail({ id: 3, part: "response-body" } as never, 7);
    expect(rec.readNetworkDetail).toHaveBeenCalledWith({ id: 3, part: "response-body" });
  });

  it("handleDialog sets the policy and returns the log", async () => {
    const out = (await META_TOOLS.handleDialog(
      { accept: true, promptText: "x", scope: "all" } as never,
      7
    )) as unknown as { policy: { scope: string }; dialogs: unknown[] };
    expect(rec.setDialogPolicy).toHaveBeenCalledWith({
      accept: true,
      promptText: "x",
      scope: "all"
    });
    expect(out.policy.scope).toBe("all");
    expect(out.dialogs).toHaveLength(1);
  });

  it("handleDialog defaults to next scope and requires accept", async () => {
    await META_TOOLS.handleDialog({ accept: false } as never, 7);
    expect(rec.setDialogPolicy).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "next", accept: false })
    );
    await expect(META_TOOLS.handleDialog({} as never, 7)).rejects.toThrow("accept required");
  });

  it("recorderConfig forwards only the fields that were supplied", async () => {
    await META_TOOLS.recorderConfig({ bodies: true, clear: ["network"] } as never, 7);
    expect(rec.configure).toHaveBeenCalledWith({ bodies: true, clear: ["network"] });
  });
});
