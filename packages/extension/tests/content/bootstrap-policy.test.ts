import { describe, expect, it } from "vitest";
import { activationForPolicy } from "@/content/bootstrap-policy";

describe("activationForPolicy", () => {
  it("keeps a disabled page inert", () => {
    expect(activationForPolicy({ injectionMode: "disabled", assistantEnabled: false })).toEqual({
      runner: false,
      assistant: false,
      recorder: false
    });
  });

  it("supports page reads without the assistant", () => {
    expect(activationForPolicy({ injectionMode: "read", assistantEnabled: false })).toEqual({
      runner: true,
      assistant: false,
      recorder: false
    });
  });

  it("enables the assistant independently in operate mode", () => {
    expect(activationForPolicy({ injectionMode: "operate", assistantEnabled: true })).toEqual({
      runner: true,
      assistant: true,
      recorder: false
    });
  });

  it("only enables the MAIN-world recorder in diagnostic mode", () => {
    expect(activationForPolicy({ injectionMode: "diagnostic", assistantEnabled: false })).toEqual({
      runner: true,
      assistant: false,
      recorder: true
    });
  });
});
