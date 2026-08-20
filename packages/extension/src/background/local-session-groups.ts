import type { SessionData } from "@/sidepanel/chat/session-store";
import type { TabSessionGroupManager, TabSessionStatus } from "./tab-session-groups";

type ActiveLocal = { sessionId: string; tabIds: Set<number> };

export class LocalSessionGroupSync {
  private activeByPrimary = new Map<number, ActiveLocal>();
  private queue: Promise<void> = Promise.resolve();

  constructor(private groups: TabSessionGroupManager) {}

  sync(primaryTabId: number, snapshot: Partial<SessionData>): Promise<void> {
    this.queue = this.queue.then(
      () => this.reconcile(primaryTabId, snapshot),
      () => this.reconcile(primaryTabId, snapshot)
    );
    return this.queue;
  }

  private async reconcile(primaryTabId: number, snapshot: Partial<SessionData>): Promise<void> {
    const previous = this.activeByPrimary.get(primaryTabId);
    const active = snapshot.status === "streaming" ||
      snapshot.status === "running" ||
      snapshot.status === "awaiting";
    const sessionId = snapshot._sessionId ?? `local-tab-${primaryTabId}`;

    if (!active) {
      if (previous) await this.groups.releaseSession(previous.sessionId);
      this.activeByPrimary.delete(primaryTabId);
      return;
    }

    if (previous && previous.sessionId !== sessionId) {
      await this.groups.releaseSession(previous.sessionId);
    }

    const desired = new Set([
      primaryTabId,
      ...(snapshot.attachedTabs ?? []).map((tab) => tab.tabId)
    ]);
    if (previous?.sessionId === sessionId) {
      for (const tabId of previous.tabIds) {
        if (!desired.has(tabId)) await this.groups.releaseTab(tabId, true);
      }
    }

    const status: TabSessionStatus = snapshot.status === "awaiting" ? "awaiting" : "running";
    for (const tabId of desired) {
      await this.groups.claim({ sessionId, tabId, source: "local", status });
    }
    await this.groups.setStatus(sessionId, status);
    this.activeByPrimary.set(primaryTabId, { sessionId, tabIds: desired });
  }
}
