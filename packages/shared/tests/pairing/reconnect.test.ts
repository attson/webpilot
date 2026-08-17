import { describe, expect, it } from "vitest";
import {
  DORMANCY_THRESHOLD,
  INITIAL_RECONNECT_STATE,
  nextReconnect,
  wake
} from "../../src/pairing/reconnect";

const failN = (n: number) => {
  let s = INITIAL_RECONNECT_STATE;
  for (let i = 0; i < n; i++) s = nextReconnect(s, "failure");
  return s;
};

describe("nextReconnect", () => {
  it("backs off exponentially from one second", () => {
    expect(failN(1).delayMs).toBe(1000);
    expect(failN(2).delayMs).toBe(2000);
    expect(failN(3).delayMs).toBe(4000);
  });

  it("caps the delay at thirty seconds", () => {
    expect(failN(9).delayMs).toBe(30_000);
  });

  it("goes dormant at the threshold", () => {
    expect(failN(DORMANCY_THRESHOLD - 1).status).toBe("active");
    expect(failN(DORMANCY_THRESHOLD).status).toBe("dormant");
  });

  it("stays dormant on further failures without growing the delay", () => {
    const d = nextReconnect(failN(DORMANCY_THRESHOLD), "failure");
    expect(d.status).toBe("dormant");
    expect(d.delayMs).toBe(30_000);
  });

  it("success resets everything", () => {
    expect(nextReconnect(failN(5), "success")).toEqual(INITIAL_RECONNECT_STATE);
  });

  it("a graceful close goes dormant immediately", () => {
    const g = nextReconnect(INITIAL_RECONNECT_STATE, "graceful-close");
    expect(g.status).toBe("dormant");
    expect(g.failures).toBe(0);
  });

  it("a graceful close on an already-failing entry still goes dormant", () => {
    const g = nextReconnect(failN(3), "graceful-close");
    expect(g.status).toBe("dormant");
  });

  it("wake reactivates a dormant entry", () => {
    expect(wake(failN(DORMANCY_THRESHOLD))).toEqual(INITIAL_RECONNECT_STATE);
  });

  it("wake is a no-op on an active entry", () => {
    expect(wake(failN(2))).toEqual(INITIAL_RECONNECT_STATE);
  });
});
