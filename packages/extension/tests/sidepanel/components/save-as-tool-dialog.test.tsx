import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SaveAsToolDialog } from "@/sidepanel/components/save-as-tool-dialog";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  saveTool: vi.fn(async (draft) => ({ id: "saved-1", ...draft })),
  generatePromptToolDraft: vi.fn(async () => ({
    name: "提示词采集",
    description: "AI 重新执行采集",
    prompt: "请读取当前页面并返回 JSON"
  })),
  generateStepsToolDraft: vi.fn(async () => ({
    name: "固定采集",
    description: "固定返回标题",
    steps: [{ kind: "js", source: "return { title: document.title };" }]
  }))
}));

vi.mock("@/sidepanel/rpc", () => ({ rpc: { saveTool: mocks.saveTool } }));
vi.mock("@/sidepanel/llm/tool-draft-generator", () => ({
  generatePromptToolDraft: mocks.generatePromptToolDraft,
  generateStepsToolDraft: mocks.generateStepsToolDraft
}));
vi.mock("@/sidepanel/llm/client", () => ({ pickClient: vi.fn(() => ({ stream: vi.fn() })) }));

describe("SaveAsToolDialog", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    mocks.saveTool.mockClear();
    mocks.generatePromptToolDraft.mockClear();
    mocks.generateStepsToolDraft.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render() {
    act(() => {
      root.render(
        <SaveAsToolDialog
          tabId={1}
          initialName="old"
          initialDescription="old desc"
          initialUrl="https://example.com/item/1"
          steps={[{ kind: "tool", tool: "snapshotDOM", args: {} }]}
          lastOutput={{ title: "A" }}
          messages={[{ role: "user", content: "采集" }]}
          llmSettings={{
            provider: "openai",
            model: "gpt-test",
            apiKey: "sk-test",
            apiKeyMode: "session",
            maxRounds: 10,
            trustedDangerTools: [], defaultPermissionMode: "default", theme: "dark", selfHealEnabled: true, maxSelfHealOutputTokens: 4096, defaultInjectionMode: "operate" as const, defaultAssistantEnabled: true, siteInjectionRules: [],
          }}
          onClose={() => undefined}
          onSaved={() => undefined}
        />
      );
    });
  }

  it("starts with type selection", () => {
    render();
    expect(container.textContent).toContain("提示词工具");
    expect(container.textContent).toContain("纯函数工具");
    expect(container.textContent).not.toContain("保存中");
  });

  it("generates and saves prompt tools", async () => {
    render();
    const promptBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("提示词工具"));
    await act(async () => promptBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const genBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "让 AI 生成候选");
    await act(async () => genBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("请读取当前页面并返回 JSON");

    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "保存");
    await act(async () => saveBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.saveTool).toHaveBeenCalledWith(expect.objectContaining({ kind: "prompt", prompt: "请读取当前页面并返回 JSON" }));
  });

  it("generates and saves steps tools", async () => {
    render();
    const stepsBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("纯函数工具"));
    await act(async () => stepsBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    const genBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "让 AI 生成候选");
    await act(async () => genBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(container.textContent).toContain("return { title: document.title };");

    const saveBtn = Array.from(container.querySelectorAll("button")).find((b) => b.textContent === "保存");
    await act(async () => saveBtn?.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    expect(mocks.saveTool).toHaveBeenCalledWith(expect.objectContaining({ kind: "steps", steps: [{ kind: "js", source: "return { title: document.title };" }] }));
  });
});
