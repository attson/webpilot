import type { ChatMessage, Json, JsonSchema } from "../types";

export type LlmTool = {
  name: string;
  description: string;
  input_schema: JsonSchema;
  /**
   * Short English wording for the MCP surface. `description` above is written
   * for the side-panel LLM (examples, cross-tool guidance, Chinese); the MCP
   * agent gets the strategy from the skill bundle instead, so its tool list
   * only needs "what + when". Absent ⇒ MCP falls back to `description`.
   */
  mcp?: {
    description: string;
    /** Property-level overrides; a property not listed here loses its description over MCP. */
    params?: Record<string, string>;
  };
};

export type LlmStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "tool_use_start"; id: string; name: string }
  | { type: "tool_use_input_delta"; id: string; partial_json: string }
  | { type: "tool_use_end"; id: string; input: Json }
  | { type: "message_end"; usage?: { input_tokens: number; output_tokens: number }; stop_reason?: string }
  | { type: "error"; error: string };

export interface LlmClient {
  stream(input: {
    apiKey: string;
    model: string;
    system: string;
    messages: ChatMessage[];
    tools: LlmTool[];
    maxTokens?: number;
    abortSignal?: AbortSignal;
    /** 自定义 base URL（含 /v1 等版本路径），留空 = 用 provider 默认 */
    endpoint?: string;
  }): AsyncIterable<LlmStreamEvent>;
}
