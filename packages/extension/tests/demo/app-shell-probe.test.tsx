import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import React from "react";
import "fake-indexeddb/auto";
import { installChromeShim } from "../../demo/chrome-shim";

/**
 * Probe (Plan 34, Task 5): does the real AppShell mount under the demo shim?
 *
 * The answer decides whether the homepage demo can honestly say it runs the
 * real side panel, or has to narrow that claim to the chat view. Kept as a
 * regression test so the demo cannot silently stop mounting.
 */

let container: HTMLDivElement;
let root: Root;
const errors: unknown[] = [];

beforeEach(() => {
  errors.length = 0;
  vi.spyOn(console, "error").mockImplementation((...a) => errors.push(a[0]));
  installChromeShim({ onPageStep: async () => ({ ok: true }) });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("AppShell under the demo shim", () => {
  it("mounts and renders without throwing", async () => {
    const { AppShell } = await import("@/sidepanel/shell/app-shell");
    const { ThemeProvider } = await import("@/sidepanel/shell/theme-provider");

    await act(async () => {
      root.render(
        React.createElement(ThemeProvider, null, React.createElement(AppShell))
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const text = container.textContent ?? "";
    // Not just "rendered something": the panel's own chrome has to be there,
    // otherwise the demo would be showing an empty shell.
    expect(text).toContain("AtWebPilot");
    expect(text).toContain("demo.atwebpilot.local");
    expect(text).toContain("告诉 AI 你要做什么");
    expect(container.querySelectorAll("button").length).toBeGreaterThan(3);
  });

  it("reports no React errors while mounting", async () => {
    const { AppShell } = await import("@/sidepanel/shell/app-shell");
    const { ThemeProvider } = await import("@/sidepanel/shell/theme-provider");
    await act(async () => {
      root.render(React.createElement(ThemeProvider, null, React.createElement(AppShell)));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    const reactErrors = errors.filter(
      (e) => typeof e === "string" && /not wrapped in act|Warning: Each child|Cannot update/.test(e)
    );
    expect(reactErrors).toEqual([]);
  });
});
