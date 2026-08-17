import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installPairingRelay } from "@/content/pairing-relay";
import { PAIR_PAGE_SOURCE, PAIR_RESULT_SOURCE } from "@atwebpilot/shared/pairing";

const realChrome = globalThis.chrome;

const payload = {
  v: 1,
  installId: "inst_abc",
  secret: "s3cr3t",
  sessionId: "sess_1",
  label: "~/code/caiji2",
  pid: 1234,
  port: 51234
};

let sent: unknown[];
let reply: unknown;

/** Waits for the relay's async round-trip to settle. */
const settle = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
};

function results(): Array<Record<string, unknown>> {
  return posted.filter((m) => m.source === PAIR_RESULT_SOURCE);
}
let posted: Array<Record<string, unknown>>;

beforeEach(() => {
  sent = [];
  posted = [];
  reply = { decision: "trusted" };
  globalThis.chrome = {
    runtime: {
      sendMessage: vi.fn(async (m: unknown) => {
        sent.push(m);
        return reply;
      })
    }
  } as unknown as typeof chrome;

  document.documentElement.innerHTML = "<body></body>";
  window.addEventListener("message", (ev) => {
    const d = ev.data as Record<string, unknown>;
    if (d && d.source === PAIR_RESULT_SOURCE) posted.push(d);
  });
  installPairingRelay();
});

afterEach(() => {
  globalThis.chrome = realChrome;
  vi.restoreAllMocks();
});

/**
 * Dispatched rather than posted so `source` is genuinely `window` — happy-dom's
 * postMessage sets it to an unrelated EventTarget, which the relay correctly
 * refuses.
 */
const pairMessage = (p: unknown = payload) =>
  window.dispatchEvent(
    new MessageEvent("message", { data: { source: PAIR_PAGE_SOURCE, payload: p }, source: window })
  );

describe("pairing relay", () => {
  it("forwards a well-formed payload to the worker", async () => {
    pairMessage();
    await settle();
    expect(sent[0]).toMatchObject({ type: "pairing.request", payload });
  });

  it("ignores messages from another source", async () => {
    window.dispatchEvent(
      new MessageEvent("message", { data: { source: "something-else", payload }, source: window })
    );
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("ignores a message from a foreign frame", async () => {
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { source: PAIR_PAGE_SOURCE, payload },
        source: null
      })
    );
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("ignores a payload that fails the shape check", async () => {
    for (const bad of [
      null,
      "string",
      { ...payload, v: 2 },
      { ...payload, installId: "" },
      { ...payload, port: "51234" },
      { ...payload, secret: undefined }
    ]) {
      pairMessage(bad);
    }
    await settle();
    expect(sent).toHaveLength(0);
  });

  it("reports success without an overlay when already trusted", async () => {
    pairMessage();
    await settle();
    expect(document.querySelector("[data-atwebpilot-pairing]")).toBeNull();
    expect(results()[0]).toMatchObject({ ok: true, trusted: true });
  });

  it("renders an overlay when the worker asks", async () => {
    reply = { decision: "ask" };
    pairMessage();
    await settle();
    expect(document.querySelector("[data-atwebpilot-pairing]")).not.toBeNull();
  });

  it("keeps the overlay out of the page's reach", async () => {
    reply = { decision: "ask" };
    pairMessage();
    await settle();
    const host = document.querySelector("[data-atwebpilot-pairing]")!;
    // A closed shadow root is not reachable from the page.
    expect(host.shadowRoot).toBeNull();
  });

  it("reports a rejection when the worker errors", async () => {
    reply = { error: "boom" };
    pairMessage();
    await settle();
    expect(results()[0]).toMatchObject({ ok: false });
  });
});
