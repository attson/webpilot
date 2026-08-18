import { describe, expect, it, vi } from "vitest";
import { RESULT, createBridgeClient, serveBridge } from "../../demo/bridge";

/**
 * Both halves run in the same window here; the client posts to `window` and the
 * server answers on `ev.source ?? self`, which in one window is the same target.
 */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

describe("demo bridge", () => {
  it("resolves a request with the runner's result", async () => {
    const stop = serveBridge(window, async (step) => ({ echo: step }));
    const send = createBridgeClient(window);
    const p = send({ kind: "tool", tool: "click" });
    await settle();
    await expect(p).resolves.toEqual({ echo: { kind: "tool", tool: "click" } });
    stop();
  });

  it("pairs concurrent requests by id, not arrival order", async () => {
    const stop = serveBridge(window, async (step) => {
      const s = step as { n: number };
      // Deliberately invert completion order.
      await new Promise((r) => setTimeout(r, s.n === 1 ? 20 : 0));
      return s.n;
    });
    const send = createBridgeClient(window);
    const [a, b] = await Promise.all([send({ n: 1 }), send({ n: 2 })]);
    expect(a).toBe(1);
    expect(b).toBe(2);
    stop();
  });

  it("rejects when the runner throws", async () => {
    const stop = serveBridge(window, async () => {
      throw new Error("selector miss");
    });
    const send = createBridgeClient(window);
    // Attach the rejection handler before the promise can settle — otherwise
    // it rejects unhandled during settle() and only gets a handler afterwards.
    await expect(send({})).rejects.toThrow("selector miss");
    stop();
  });

  it("ignores a result for an id it never issued", async () => {
    const send = createBridgeClient(window);
    const p = send({}).catch(() => "rejected");
    window.postMessage({ type: RESULT, id: 9999, ok: true, data: "stray" }, "*");
    await settle();
    // Still pending: the stray result must not have resolved it.
    const raced = await Promise.race([p, Promise.resolve("pending")]);
    expect(raced).toBe("pending");
  });

  it("ignores unrelated messages", async () => {
    const run = vi.fn(async () => null);
    const stop = serveBridge(window, run);
    window.postMessage({ type: "something-else" }, "*");
    await settle();
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it("the disposer stops the server", async () => {
    const run = vi.fn(async () => null);
    const stop = serveBridge(window, run);
    stop();
    const send = createBridgeClient(window);
    send({}).catch(() => undefined);
    await settle();
    expect(run).not.toHaveBeenCalled();
  });
});
