import { describe, expect, it, vi } from "vitest";
import { LocalSessionGroupSync } from "@/background/local-session-groups";

describe("LocalSessionGroupSync", () => {
  it("claims the primary and attached tabs under the shared local session id", async () => {
    const groups = {
      claim: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      releaseSession: vi.fn().mockResolvedValue(undefined),
      releaseTab: vi.fn().mockResolvedValue(undefined)
    };
    const sync = new LocalSessionGroupSync(groups as never);
    await sync.sync(1, {
      _sessionId: "local-session",
      status: "running",
      attachedTabs: [{ tabId: 2 } as never]
    });
    expect(groups.claim).toHaveBeenCalledWith({
      sessionId: "local-session", tabId: 1, source: "local", status: "running"
    });
    expect(groups.claim).toHaveBeenCalledWith({
      sessionId: "local-session", tabId: 2, source: "local", status: "running"
    });
  });

  it("releases the logical session on terminal state", async () => {
    const groups = {
      claim: vi.fn().mockResolvedValue(undefined),
      setStatus: vi.fn().mockResolvedValue(undefined),
      releaseSession: vi.fn().mockResolvedValue(undefined),
      releaseTab: vi.fn().mockResolvedValue(undefined)
    };
    const sync = new LocalSessionGroupSync(groups as never);
    await sync.sync(1, { _sessionId: "local-session", status: "streaming" });
    await sync.sync(1, { _sessionId: "local-session", status: "done" });
    expect(groups.releaseSession).toHaveBeenCalledWith("local-session");
  });

  it("serializes snapshots so a terminal state cannot be overtaken", async () => {
    let finishClaim: (() => void) | undefined;
    const groups = {
      claim: vi.fn(() => new Promise<void>((resolve) => { finishClaim = resolve; })),
      setStatus: vi.fn().mockResolvedValue(undefined),
      releaseSession: vi.fn().mockResolvedValue(undefined),
      releaseTab: vi.fn().mockResolvedValue(undefined)
    };
    const sync = new LocalSessionGroupSync(groups as never);
    const running = sync.sync(1, { _sessionId: "local-session", status: "running" });
    const done = sync.sync(1, { _sessionId: "local-session", status: "done" });
    await Promise.resolve();
    expect(groups.releaseSession).not.toHaveBeenCalled();
    finishClaim?.();
    await Promise.all([running, done]);
    expect(groups.releaseSession).toHaveBeenCalledWith("local-session");
  });
});
