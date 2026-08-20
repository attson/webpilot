# Session Tab Groups Implementation Plan

1. Add the `tabGroups` permission and a dependency-injected background
   `TabSessionGroupManager` with session-storage persistence.
2. Implement claim, status update, per-window grouping, release, restoration,
   startup reconciliation, and manual-detachment handling.
3. Feed local sidepanel/widget snapshots from `session-broker` using
   `runRecordId`, primary tab, attached tabs, and session status.
4. Feed MCP ownership from `SESSION_OPENED/SESSION_CLOSED` and remote chat from
   `START_CHAT_SESSION` lifecycle callbacks.
5. Add focused manager and integration tests, then run full typecheck, tests,
   and production build.
