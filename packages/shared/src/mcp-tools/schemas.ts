import type { JsonSchema } from "../types";

/**
 * JSON Schema for each control-plane MCP tool's input. We use plain JSON
 * Schema objects (not zod) because MCP SDK consumes them as-is.
 */

export const OPEN_SESSION_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["url", "capabilities"],
  properties: {
    url: { type: "string", description: "Initial URL or URL pattern for the session's tab" },
    labels: {
      type: "array",
      items: { type: "string" },
      description: "Worker labels to prefer (e.g. 'logged-in:shop')"
    },
    capabilities: {
      type: "array",
      items: { type: "string" },
      description: "Requested capability scope (e.g. ['interact:form','submit:form'])"
    },
    idle_timeout_min: {
      type: "number",
      description: "Override default 30-minute idle timeout"
    }
  },
  additionalProperties: false
};

export const CLOSE_SESSION_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["session_id"],
  properties: {
    session_id: { type: "string" }
  },
  additionalProperties: false
};

export const LIST_TOOLS_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["session_id"],
  properties: {
    session_id: { type: "string" }
  },
  additionalProperties: false
};

export const RUN_TOOL_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["session_id", "tool_id", "input"],
  properties: {
    session_id: { type: "string" },
    tool_id: { type: "string", description: "Saved tool ID returned by list_tools" },
    input: { description: "Tool-specific input (depends on the saved tool's schema)" }
  },
  additionalProperties: false
};

export const GET_QUOTA_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["session_id"],
  properties: {
    session_id: { type: "string" }
  },
  additionalProperties: false
};

export const LIST_TABS_INPUT_SCHEMA: JsonSchema = {
  type: "object",
  required: ["session_id"],
  properties: {
    session_id: { type: "string" }
  },
  additionalProperties: false
};
