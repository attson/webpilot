import { useEffect, useState } from "react";
import { useSettings } from "@/sidepanel/chat/settings-store";
import {
  getAllowedHosts,
  getHiddenHosts,
  parseHostRules,
  setAllowedHosts,
  setHiddenHosts
} from "@/content/widget/per-site";

type ListEditorProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onSave: (rules: string[]) => Promise<void>;
};

function HostListEditor({ label, value, onChange, onSave }: ListEditorProps) {
  const parsed = parseHostRules(value);

  return (
    <label className="block space-y-1">
      <span className="text-zinc-300">{label}</span>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!parsed.ok) return;
          onChange(parsed.rules.join("\n"));
          void onSave(parsed.rules);
        }}
        rows={4}
        spellCheck={false}
        placeholder={"example.com\n*.example.com"}
        className="w-full resize-y rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 font-mono text-[11px] text-zinc-200 outline-none focus:border-blue-500"
      />
      {!parsed.ok ? (
        <span className="block break-words text-[11px] text-rose-400">
          无效规则：{parsed.invalid.join("、")}。只填写 hostname，不含协议、端口或路径。
        </span>
      ) : (
        <span className="block text-[11px] text-zinc-500">
          每行一条；example.com 精确匹配，*.example.com 匹配子域名。
        </span>
      )}
    </label>
  );
}

export function SectionMounting() {
  const settings = useSettings();
  const [allowedText, setAllowedText] = useState("");
  const [hiddenText, setHiddenText] = useState("");

  useEffect(() => {
    void Promise.all([getAllowedHosts(), getHiddenHosts()]).then(([allowed, hidden]) => {
      setAllowedText(allowed.join("\n"));
      setHiddenText(hidden.join("\n"));
    });
  }, []);

  return (
    <div className="space-y-3 text-xs">
      <section className="space-y-3 rounded bg-zinc-900 p-3">
        <h3 className="text-zinc-300">页内浮窗</h3>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={settings.widgetEnabled !== false}
            onChange={(event) => void settings.save({ widgetEnabled: event.target.checked })}
          />
          <span className="text-zinc-300">启用每页右下角对话入口</span>
        </label>

        <fieldset className="space-y-1" disabled={settings.widgetEnabled === false}>
          <legend className="mb-1 text-zinc-400">显示范围</legend>
          <div className="inline-flex rounded border border-zinc-700 bg-zinc-950 p-0.5">
            {([
              ["all", "全部站点"],
              ["allowlist", "仅白名单"]
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={(settings.widgetSiteMode ?? "all") === mode}
                onClick={() => void settings.save({ widgetSiteMode: mode })}
                className={(settings.widgetSiteMode ?? "all") === mode
                  ? "rounded bg-zinc-700 px-2 py-1 text-zinc-100"
                  : "rounded px-2 py-1 text-zinc-400 hover:text-zinc-200"}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <HostListEditor
          label="白名单"
          value={allowedText}
          onChange={setAllowedText}
          onSave={setAllowedHosts}
        />
        <HostListEditor
          label="黑名单（优先）"
          value={hiddenText}
          onChange={setHiddenText}
          onSave={setHiddenHosts}
        />
      </section>

      <section className="space-y-1 rounded bg-zinc-900 p-3">
        <h3 className="text-zinc-300">多 tab</h3>
        <ul className="list-inside list-disc space-y-0.5 text-[11px] text-zinc-400">
          <li>当前 tab 始终挂载</li>
          <li>AI 用 <code className="text-zinc-300">openTab</code> 打开的新 tab 会自动 attach</li>
          <li>AI 用 <code className="text-zinc-300">attachTab</code> 拉入其它 tab 需要人工审阅</li>
          <li>已挂载 tab URL 变化时会标记，AI 下次调用前会提示</li>
        </ul>
      </section>
    </div>
  );
}
