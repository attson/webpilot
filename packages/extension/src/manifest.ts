import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "../package.json" with { type: "json" };

const extensionKey =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2MMIurte87Qyc3+fgE14sZvVNdY7Y/olNx0+9P5av+/KaVbtRjgsAWB7hEdJhvX0qjAPi083fknAmZ/kMjTWVGhjWgl+XVxWH19PANwk7gbPw0qxYQsEi8p9iFJteirmszxPootNYsFnSCdgTebk9O7j2E1mNDCcR9+vt6rOMTZXBgjNy8tmAtHeWG5m8XD+EZSvx7sxh4bXNIhKMcpUnnx8j6+BHiuJyAkKsgTHkZ8pDAapwRYX+FpMzSLap5ugeiGCFiA3RWOTFG0LdbjJ1tuIczu3EJ3diGOgQtt5nZmZJvCkcA60l4qShDiJhWTFHHi2VsROY51eJLecQsffFQIDAQAB";

export default defineManifest({
  manifest_version: 3,
  name: "AtWebPilot — AI 网页助手",
  description: "让 AI 帮你浏览、总结、操作网页，并把成功的对话固化为可复用工具",
  version: pkg.version,
  key: extensionKey,
  action: { default_title: "AtWebPilot" },
  side_panel: { default_path: "src/sidepanel/index.html" },
  background: { service_worker: "src/background/index.ts", type: "module" },
  optional_permissions: ["debugger"],
  permissions: ["sidePanel", "storage", "scripting", "activeTab", "tabs", "webNavigation", "contextMenus", "bookmarks", "history", "downloads"],
  host_permissions: [
    "*://*.yangkeduo.com/*",
    "*://*.pinduoduo.com/*",
    "https://*/*",
    "ws://127.0.0.1/*",
    "ws://localhost/*"
  ],
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: [
        "src/content/index.ts",
        "src/content/breathing-border.ts",
        "src/content/element-capture.ts",
        "src/content/external-replay.ts",
        "src/content/widget/mount.ts"
      ],
      run_at: "document_idle"
    },
    {
      // MAIN world so the recorder can see the page's own console / fetch /
      // XMLHttpRequest / alert. Declared statically rather than registered
      // dynamically because crxjs copies web_accessible_resources verbatim
      // without transpiling, so a dynamically-registered .ts never runs.
      // Consequence: the settings master switch means "uninstall the patches
      // and stop draining", not "the script never loads".
      matches: ["<all_urls>"],
      js: ["src/content/recorder/main-world.ts"],
      world: "MAIN",
      run_at: "document_start"
    }
  ],
  web_accessible_resources: [
    { resources: ["src/sidepanel/index.html"], matches: ["<all_urls>"] }
  ]
});
