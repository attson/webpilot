import { describe, expect, it, vi, beforeEach } from "vitest";

const listeners: Array<(msg: any, sender: any, respond: any) => void> = [];

(globalThis as any).chrome = {
  runtime: {
    onMessage: {
      addListener: vi.fn((cb: any) => listeners.push(cb)),
      removeListener: vi.fn()
    },
    sendMessage: vi.fn().mockResolvedValue(undefined)
  },
  tabs: {
    sendMessage: vi.fn().mockResolvedValue(undefined)
  }
};

describe("installSessionBroker", () => {
  beforeEach(() => {
    listeners.length = 0;
    vi.clearAllMocks();
  });

  it("relays session.state.changed to tabs.sendMessage for widget", async () => {
    const { installSessionBroker } = await import("@/background/session-broker");
    const onSnapshot = vi.fn();
    installSessionBroker({ onSnapshot });
    expect(listeners.length).toBe(1);
    const cb = listeners[0];
    cb(
      { type: "session.state.changed", tabId: 7, snapshot: { _rev: 3 }, senderId: "sp" },
      { id: "sidepanel-instance" },
      () => {}
    );
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(7,
      expect.objectContaining({ type: "session.state.changed", tabId: 7, snapshot: { _rev: 3 } })
    );
    expect(onSnapshot).toHaveBeenCalledWith(7, { _rev: 3 });
  });

  it("ignores unrelated messages", async () => {
    const { installSessionBroker } = await import("@/background/session-broker");
    installSessionBroker();
    listeners[0]({ type: "something.else" }, { id: "x" }, () => {});
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
