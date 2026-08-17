import type { ReconnectOutcome, ReconnectState } from "./types";

const BASE_MS = 1000;
const MAX_MS = 30_000;

/** Consecutive failures after which an endpoint stops being retried. */
export const DORMANCY_THRESHOLD = 10;

export const INITIAL_RECONNECT_STATE: ReconnectState = {
  failures: 0,
  status: "active",
  delayMs: 0
};

/**
 * Reconnection needs a terminating condition. Without one, an endpoint whose
 * session ended hours ago keeps knocking forever — harmless with a single
 * hand-configured URL, but multiplied by every session that ever paired.
 */
export function nextReconnect(state: ReconnectState, outcome: ReconnectOutcome): ReconnectState {
  if (outcome === "success") return INITIAL_RECONNECT_STATE;

  // A clean shutdown is not something to back off through: the peer is gone
  // deliberately, so retrying it at any interval is wasted work.
  if (outcome === "graceful-close") {
    return { failures: 0, status: "dormant", delayMs: 0 };
  }

  if (state.status === "dormant") return state;

  const failures = state.failures + 1;
  return {
    failures,
    status: failures >= DORMANCY_THRESHOLD ? "dormant" : "active",
    delayMs: Math.min(BASE_MS * 2 ** (failures - 1), MAX_MS)
  };
}

/** Reactivates an endpoint after a manual reconnect, re-pairing, or restart. */
export function wake(_state: ReconnectState): ReconnectState {
  return INITIAL_RECONNECT_STATE;
}
