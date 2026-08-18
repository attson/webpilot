import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SectionLlm } from "@/sidepanel/drawers/settings/section-llm";
import { useSettings } from "@/sidepanel/chat/settings-store";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const streamMock = vi.fn();

vi.mock("@/sidepanel/llm/client", () => ({
  pickClient: vi.fn(() => ({ stream: streamMock }))
}));

async function* okStream() {
  yield { type: "message_end" as const, usage: { input_tokens: 1, output_tokens: 1 } };
}

describe("SectionLlm", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    streamMock.mockImplementation(okStream);
    useSettings.setState({
      provider: "openai",
      model: "gpt-test",
      apiKey: "sk-test",
      endpoint: "https://example.test/v1",
      maxTokens: 4096,
      maxRounds: 20,
      maxContinuationNudges: 1,
      apiKeyMode: "persistent",
      trustedDangerTools: [],
      defaultPermissionMode: "default",
      defaultChatMode: "compact",
      selfHealEnabled: true,
      maxSelfHealOutputTokens: 4096,
      widgetEnabled: true,
      contextPolicy: "auto",
      loaded: true,
      save: vi.fn(async (patch) => {
        useSettings.setState(patch);
      })
    } as Partial<ReturnType<typeof useSettings.getState>>);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  it("tests the current LLM configuration and shows success", async () => {
    await act(async () => {
      root.render(<SectionLlm />);
    });

    const testButton = Array.from(container.querySelectorAll("button")).find((b) =>
      (b.textContent ?? "").includes("测试")
    ) as HTMLButtonElement | undefined;
    expect(testButton).toBeTruthy();

    await act(async () => {
      testButton?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(streamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-test",
        model: "gpt-test",
        endpoint: "https://example.test/v1",
        maxTokens: 16,
        tools: []
      })
    );
    expect(container.textContent).toContain("连接正常");
    expect(container.textContent).not.toContain("启用页内浮窗");
  });

});
