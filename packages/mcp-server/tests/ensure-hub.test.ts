import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { FakeClock, FakeIdGen } from "@atwebpilot/coordinator";
import { createHubEnsurer } from "../src/ensure-hub";
import { loadLastPort, saveLastPort } from "../src/identity";

const dirs: string[] = [];
const made: Array<ReturnType<typeof createHubEnsurer>> = [];

const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "atwebpilot-hub-"));
  dirs.push(d);
  return d;
};

function makeEnsurer(opts: { openUrl?: (u: string) => void; dir?: string; explicitPort?: number }) {
  const e = createHubEnsurer({
    clock: new FakeClock(0),
    idGen: new FakeIdGen(),
    identityDir: opts.dir ?? tmp(),
    explicitPort: opts.explicitPort,
    openUrl: opts.openUrl,
    processInfo: { sessionId: "sess_test", label: "~/code/x", pid: 1 }
  });
  made.push(e);
  return e;
}

afterEach(async () => {
  for (const e of made.splice(0)) await e.peek()?.hub.close?.();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("createHubEnsurer", () => {
  it("binds nothing until a browser-needing tool runs", async () => {
    const e = makeEnsurer({});
    expect(e.bound()).toBe(false);
    expect(e.peek()).toBeNull();
    expect(e.pairUrl()).toBeNull();

    await e.ensure();
    expect(e.bound()).toBe(true);
    expect(e.peek()).not.toBeNull();
  });

  it("is idempotent", async () => {
    const e = makeEnsurer({});
    const a = await e.ensure();
    const b = await e.ensure();
    expect(a.port).toBe(b.port);
    expect(a.coordinator).toBe(b.coordinator);
  });

  it("shares one bind between concurrent first calls", async () => {
    const e = makeEnsurer({});
    const [a, b] = await Promise.all([e.ensure(), e.ensure()]);
    expect(a.port).toBe(b.port);
  });

  it("opens the pairing page at most once", async () => {
    const opened: string[] = [];
    const e = makeEnsurer({ openUrl: (u) => opened.push(u) });
    await e.ensure();
    await e.ensure();
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/pair$/);
  });

  it("records the port it actually bound", async () => {
    const dir = tmp();
    const e = makeEnsurer({ dir });
    const { port } = await e.ensure();
    expect(loadLastPort(dir)).toBe(port);
  });

  it("prefers the remembered port when it is free", async () => {
    const dir = tmp();
    // Learn a free port, release it, then check the next ensurer reuses it.
    const probe = makeEnsurer({ dir });
    const { port } = await probe.ensure();
    await probe.peek()!.hub.close?.();

    saveLastPort(port, dir);
    const again = createHubEnsurer({
      clock: new FakeClock(0),
      idGen: new FakeIdGen(),
      identityDir: dir,
      processInfo: { sessionId: "s2", label: "~/code/x", pid: 2 }
    });
    made.push(again);
    expect((await again.ensure()).port).toBe(port);
  });

  it("falls back to an ephemeral port when the remembered one is taken", async () => {
    const dir = tmp();
    const first = makeEnsurer({ dir });
    const { port } = await first.ensure();
    // first is still holding it; a second ensurer must not fail.
    const second = createHubEnsurer({
      clock: new FakeClock(0),
      idGen: new FakeIdGen(),
      identityDir: dir,
      processInfo: { sessionId: "s2", label: "~/code/x", pid: 2 }
    });
    made.push(second);
    const got = await second.ensure();
    expect(got.port).not.toBe(port);
    expect(got.port).toBeGreaterThan(0);
  });

  it("surfaces a clash on an explicitly configured port", async () => {
    const dir = tmp();
    const first = makeEnsurer({ dir });
    const { port } = await first.ensure();
    const pinned = createHubEnsurer({
      clock: new FakeClock(0),
      idGen: new FakeIdGen(),
      identityDir: dir,
      explicitPort: port,
      processInfo: { sessionId: "s3", label: "~/code/x", pid: 3 }
    });
    await expect(pinned.ensure()).rejects.toThrow(/ATWEBPILOT_WS_PORT/);
  });

  it("serves the pairing page from the bound port", async () => {
    const e = makeEnsurer({});
    const { port } = await e.ensure();
    const res = await fetch(`http://127.0.0.1:${port}/pair`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("sess_test");
  });
});
