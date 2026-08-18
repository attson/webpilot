import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "@/sidepanel/chat/settings-store";
import { SectionMounting } from "@/sidepanel/drawers/settings/section-mounting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SectionMounting", () => {
  let root: Root;
  let container: HTMLDivElement;
  const save = vi.fn(async (patch) => useSettings.setState(patch));

  beforeEach(() => {
    (globalThis as any).chrome = { tabs: { query: vi.fn(async () => [{ url: "https://www.zhipin.com/" }]) } };
    useSettings.setState({
      defaultInjectionMode: "operate",
      defaultAssistantEnabled: true,
      siteInjectionRules: [],
      loaded: true,
      save
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

  it("renders independent injection and assistant defaults", async () => {
    await act(async () => root.render(<SectionMounting />));
    expect(container.textContent).toContain("默认策略");
    expect(container.textContent).toContain("默认启用网页助手");
    expect(container.textContent).toContain("www.zhipin.com");
  });

  it("adds an inheriting site rule", async () => {
    await act(async () => root.render(<SectionMounting />));
    const add = container.querySelector('button[aria-label="添加站点规则"]') as HTMLButtonElement;
    await act(async () => add.click());
    expect(save).toHaveBeenCalledWith({
      siteInjectionRules: [{ pattern: "", injectionMode: "inherit", assistant: "inherit" }]
    });
  });
});
