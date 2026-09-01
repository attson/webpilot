import type { JsonSchema } from "@atwebpilot/shared/types";

export type ControlTool = { name: string; description: string; inputSchema: JsonSchema };

export const CONTROL_TOOLS: ControlTool[] = [
  {
    name: "list_tabs",
    description: "列出浏览器可用标签页：[{tab_id,url,title}]。若扩展尚未连接，首次调用会尝试自动打开配对页并等待授权（最多 90 秒），等待期间会通知实际配对 URL。先调它拿 tab_id。",
    inputSchema: { type: "object", properties: {}, additionalProperties: false } as JsonSchema
  },
  {
    name: "open_session",
    description: "为某个 tab 开一个会话，返回 session_id；后续 browser_* 工具都带这个 session_id。capabilities 省略=授予全部能力。",
    inputSchema: {
      type: "object",
      required: ["tab_id"],
      properties: {
        tab_id: { type: "string", description: "list_tabs 返回的 tab_id" },
        capabilities: { type: "array", items: { type: "string" }, description: "能力域白名单；省略=全部" },
        idle_timeout_min: { type: "number", description: "覆盖默认空闲超时（分钟）" }
      },
      additionalProperties: false
    } as JsonSchema
  },
  {
    name: "close_session",
    description: "关闭会话。",
    inputSchema: { type: "object", required: ["session_id"], properties: { session_id: { type: "string" } }, additionalProperties: false } as JsonSchema
  },
  {
    name: "get_quota",
    description: "查询会话剩余预算：steps/dangerous 已用与上限、距过期时间。",
    inputSchema: { type: "object", required: ["session_id"], properties: { session_id: { type: "string" } }, additionalProperties: false } as JsonSchema
  }
];
