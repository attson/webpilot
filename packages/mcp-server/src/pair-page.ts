import type { PairPayload } from "@atwebpilot/shared/pairing";

/**
 * The pairing page is a *carrier*, not an authority. It hands the extension a
 * port the extension has no other way to discover, and nothing more — the
 * approve/deny UI is rendered by the extension itself. Letting the requesting
 * party draw its own approval button would be asking it to sign its own permit.
 */
export function renderPairPage(payload: PairPayload): string {
  // `</script>` inside the JSON would close the block early; escaping `<` is
  // enough to prevent that and any tag injection through the payload.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html>
<meta charset="utf-8">
<title>AtWebPilot 配对</title>
<body style="font:14px/1.6 system-ui,sans-serif;padding:2rem;max-width:32rem;margin:auto;color:#222">
<h1 style="font-size:1.1rem;margin:0 0 1rem">AtWebPilot 配对</h1>
<p id="atwebpilot-status">正在联系扩展…</p>
<p style="color:#666;font-size:13px">会话：${escapeHtml(payload.label)} · pid ${payload.pid} · 端口 ${payload.port}</p>
<p style="color:#666;font-size:13px">没有反应？请确认这个浏览器已安装并启用 AtWebPilot 扩展，然后刷新本页。</p>
<script>
(function () {
  var payload = ${json};
  window.postMessage({ source: "atwebpilot-pair", payload: payload }, "*");
  window.addEventListener("message", function (e) {
    if (!e.data || e.data.source !== "atwebpilot-pair-result") return;
    var el = document.getElementById("atwebpilot-status");
    if (e.data.ok) {
      el.textContent = e.data.trusted ? "已信任，连接中…" : "已连接";
      setTimeout(function () { window.close(); }, 1200);
    } else {
      el.textContent = "已拒绝。可以关闭本页。";
    }
  });
})();
</script>
`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
