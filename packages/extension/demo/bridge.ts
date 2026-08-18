/**
 * postMessage bridge between the panel document (nested iframe) and the demo
 * document that owns the mock page.
 *
 * The split exists because the content tools query `document` with no root
 * parameter, so a shared document would let `takeSnapshot` enumerate the
 * panel's own controls. It also mirrors production, where the panel and the
 * page genuinely are separate documents with the service worker between them —
 * which is the role the harness plays on the receiving end.
 */

export const REQUEST = "demo.runStep";
export const RESULT = "demo.runStep.result";

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };

/** Panel side: sends a step to the harness and awaits its result. */
export function createBridgeClient(target: Window, self: Window = window) {
  const pending = new Map<number, Pending>();
  let seq = 0;

  self.addEventListener("message", (ev: MessageEvent) => {
    const d = ev.data as { type?: string; id?: number; ok?: boolean; data?: unknown; error?: string };
    if (!d || d.type !== RESULT || typeof d.id !== "number") return;
    const p = pending.get(d.id);
    // A result for an id we never issued is not ours to act on.
    if (!p) return;
    pending.delete(d.id);
    if (d.ok) p.resolve(d.data);
    else p.reject(new Error(d.error ?? "demo bridge: step failed"));
  });

  return (step: unknown, bindings?: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      const id = ++seq;
      pending.set(id, { resolve, reject });
      target.postMessage({ type: REQUEST, id, step, bindings }, "*");
    });
}

/** Harness side: answers step requests by running them against its own document. */
export function serveBridge(
  self: Window,
  run: (step: unknown, bindings?: unknown) => Promise<unknown>
): () => void {
  const onMessage = (ev: MessageEvent) => {
    const d = ev.data as { type?: string; id?: number; step?: unknown; bindings?: unknown };
    if (!d || d.type !== REQUEST || typeof d.id !== "number") return;
    const reply = (payload: Record<string, unknown>) => {
      const source = ev.source as Window | null;
      (source ?? self).postMessage({ type: RESULT, id: d.id, ...payload }, "*");
    };
    void run(d.step, d.bindings).then(
      (data) => reply({ ok: true, data }),
      (e: unknown) => reply({ ok: false, error: e instanceof Error ? e.message : String(e) })
    );
  };

  self.addEventListener("message", onMessage);
  return () => self.removeEventListener("message", onMessage);
}
