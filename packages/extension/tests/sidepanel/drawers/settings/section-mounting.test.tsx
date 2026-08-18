import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings } from "@/sidepanel/chat/settings-store";
import { SectionMounting } from "@/sidepanel/drawers/settings/section-mounting";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const storage: Record<string, unknown> = {};

function editTextarea(textarea: HTMLTextAreaElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SectionMounting", () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    for (const key of Object.keys(storage)) delete storage[key];
    (globalThis as any).chrome = {
      storage: {
        local: {
          get: vi.fn(async (keys: string[]) => Object.fromEntries(keys.map((key) => [key, storage[key]]))),
          set: vi.fn(async (values: Record<string, unknown>) => Object.assign(storage, values))
        }
      }
    };
    useSettings.setState({
      widgetEnabled: true,
      widgetSiteMode: "all",
      loaded: true,
      save: vi.fn(async (patch) => useSettings.setState(patch))
    } as Partial<ReturnType<typeof useSettings.getState>>);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("renders the widget switch and both site lists", async () => {
    await act(async () => root.render(<SectionMounting />));
    expect(container.textContent).toContain("启用每页右下角对话入口");
    expect(container.textContent).toContain("白名单");
    expect(container.textContent).toContain("黑名单（优先）");
  });

  it("normalizes and saves a valid allowlist on blur", async () => {
    await act(async () => root.render(<SectionMounting />));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      editTextarea(textarea, " Example.com.\n*.EXAMPLE.com");
    });
    await act(async () => textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(storage["atwebpilot.widget.allowedHosts"]).toEqual(["example.com", "*.example.com"]);
  });

  it("does not save invalid hostname rules", async () => {
    await act(async () => root.render(<SectionMounting />));
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    await act(async () => {
      editTextarea(textarea, "https://example.com/path");
    });
    await act(async () => textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(container.textContent).toContain("无效规则");
    expect(storage["atwebpilot.widget.allowedHosts"]).toBeUndefined();
  });
});
