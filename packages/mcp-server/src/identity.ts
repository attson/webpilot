import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";

/**
 * Install-level identity for pairing (Plan 33).
 *
 * Trust is granted to the installation, not to a directory or a process. A
 * per-directory scheme was considered and rejected: the secret lives in the
 * home directory, so anything able to read it can also claim any working
 * directory it likes — the scoping would be presentation, not protection —
 * while genuinely breaking git worktrees and renamed projects, which would
 * re-prompt for no reason a user can see.
 */

export type Identity = { installId: string; secret: string };

type IdentityFile = Identity & { lastPort?: number };

const FILE = "identity.json";

export function defaultIdentityDir(): string {
  return join(homedir(), ".atwebpilot");
}

function read(dir: string): IdentityFile | null {
  try {
    const raw = readFileSync(join(dir, FILE), "utf-8");
    const parsed = JSON.parse(raw) as Partial<IdentityFile>;
    if (typeof parsed.installId !== "string" || typeof parsed.secret !== "string") return null;
    return parsed as IdentityFile;
  } catch {
    // Missing or corrupt — either way the caller wants a usable identity, not
    // an exception. A corrupt file is replaced below.
    return null;
  }
}

function write(dir: string, data: IdentityFile): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, FILE), `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
}

export function loadOrCreateIdentity(dir: string = defaultIdentityDir()): Identity {
  const existing = read(dir);
  if (existing) return { installId: existing.installId, secret: existing.secret };

  const created: IdentityFile = {
    installId: `inst_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
    secret: randomBytes(24).toString("base64url")
  };
  write(dir, created);
  return { installId: created.installId, secret: created.secret };
}

export function loadLastPort(dir: string = defaultIdentityDir()): number | undefined {
  const existing = read(dir);
  return typeof existing?.lastPort === "number" ? existing.lastPort : undefined;
}

/**
 * Remembering the port is what lets the extension reconnect silently after a
 * restart; the identity is what makes doing so safe, by rejecting whatever
 * else may have taken the port in the meantime.
 */
export function saveLastPort(port: number, dir: string = defaultIdentityDir()): void {
  const existing = read(dir);
  const base: IdentityFile = existing ?? { ...loadOrCreateIdentity(dir) };
  write(dir, { ...base, lastPort: port });
}

export type ProcessInfo = { sessionId: string; label: string; pid: number };

/** Per-process facts. Display and management only; never persisted. */
export function processInfo(cwd: string = process.cwd()): ProcessInfo {
  const home = homedir();
  const label = home && cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
  return {
    sessionId: `sess_${randomUUID().replace(/-/g, "").slice(0, 12)}`,
    label,
    pid: process.pid
  };
}
