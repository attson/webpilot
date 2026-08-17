export type TabBase = { tab_id: string; url: string; title?: string };

export type TabOwner = { connectionId: string; label: string };

export type TabView = TabBase & {
  mine: boolean;
  busy: boolean;
  /** The owning session's label, present only when busy. */
  busy_label?: string;
};

/**
 * Ownership is relative to the viewer: the same tab is "mine" to whoever holds
 * it and "busy" to everyone else, so each connection needs its own derived
 * list rather than a broadcast of one shared truth.
 *
 * The result is advisory. Nothing downstream blocks on `busy` — an agent that
 * sees a tab taken is expected to open its own, but two agents may share a tab
 * deliberately.
 */
export function deriveTabView(
  tabs: TabBase[],
  owners: Record<string, TabOwner>,
  forConnection: string
): TabView[] {
  return tabs.map((t) => {
    const owner = owners[t.tab_id];
    const mine = owner?.connectionId === forConnection;
    const busy = owner != null && !mine;
    return {
      ...t,
      mine,
      busy,
      ...(busy && owner ? { busy_label: owner.label } : {})
    };
  });
}
