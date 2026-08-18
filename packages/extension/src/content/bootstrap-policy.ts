import type { ResolvedInjectionPolicy } from "@atwebpilot/shared";

export type BootstrapActivation = {
  runner: boolean;
  assistant: boolean;
  recorder: boolean;
};

export function activationForPolicy(policy: ResolvedInjectionPolicy): BootstrapActivation {
  return {
    runner: policy.injectionMode !== "disabled",
    assistant: policy.assistantEnabled,
    recorder: policy.injectionMode === "diagnostic"
  };
}
