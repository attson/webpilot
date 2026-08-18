import { useEffect, useState } from "react";
import { useSettings } from "@/sidepanel/chat/settings-store";
import { useUi } from "@/sidepanel/chat/ui-store";
import { Drawer } from "@/sidepanel/shell/drawer";
import { SectionAppearance } from "./settings/section-appearance";
import { SectionContext } from "./settings/section-context";
import { SectionLlm } from "./settings/section-llm";
import { SectionMcp } from "./settings/section-mcp";
import { SectionPermissions } from "./settings/section-permissions";
import { SectionMounting } from "./settings/section-mounting";
import { SectionCoordinator } from "./settings/section-coordinator";
import { SectionAdvanced } from "./settings/section-advanced";

type SettingsTab = "llm" | "context" | "mcp" | "permissions" | "appearance" | "mounting" | "coordinator" | "advanced";

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: "llm", label: "LLM" },
  { id: "context", label: "上下文" },
  { id: "mcp", label: "MCP" },
  { id: "permissions", label: "权限" },
  { id: "appearance", label: "外观" },
  { id: "mounting", label: "注入 / 助手" },
  { id: "coordinator", label: "Coordinator" },
  { id: "advanced", label: "高级" },
];

export function SettingsDrawer() {
  const opened = useUi((s) => s.openedDrawer);
  const close = useUi((s) => s.close);
  const settings = useSettings();
  const open = opened === "settings";
  const [activeTab, setActiveTab] = useState<SettingsTab>("llm");

  useEffect(() => {
    if (open && !settings.loaded) void settings.load();
  }, [open, settings]);

  return (
    <Drawer open={open} title="设置" onClose={close}>
      <div className="flex h-full min-h-0">
        <nav className="w-28 shrink-0 border-r border-zinc-800 bg-zinc-950 px-2 py-3 space-y-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              aria-label={`设置分类: ${tab.label}`}
              aria-current={activeTab === tab.id ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
              className={
                activeTab === tab.id
                  ? "w-full rounded px-2 py-1.5 text-left text-[12px] bg-zinc-800 text-zinc-100"
                  : "w-full rounded px-2 py-1.5 text-left text-[12px] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
              }
            >
              {tab.label}
            </button>
          ))}
        </nav>
        <div className="flex-1 min-w-0 overflow-y-auto p-3">
          {activeTab === "llm" ? <SectionLlm /> : null}
          {activeTab === "context" ? <SectionContext /> : null}
          {activeTab === "mcp" ? <SectionMcp /> : null}
          {activeTab === "permissions" ? <SectionPermissions /> : null}
          {activeTab === "appearance" ? <SectionAppearance /> : null}
          {activeTab === "mounting" ? <SectionMounting /> : null}
          {activeTab === "coordinator" ? <SectionCoordinator /> : null}
          {activeTab === "advanced" ? <SectionAdvanced /> : null}
        </div>
      </div>
    </Drawer>
  );
}
