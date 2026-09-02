import { discoveryCatalog, type CatalogEntry, type GeneratedTool } from "./tool-gen";

export const DISCOVER_TOOL: {
  name: "browser_discoverTools";
  description: string;
  inputSchema: GeneratedTool["inputSchema"] & { additionalProperties?: boolean };
} = {
  name: "browser_discoverTools",
  description:
    "The default tool list is the core set. Call with no arguments to see the catalog of additional browser tools " +
    "(export, network, storage, browser-data, inspect, legacy-dom, form). Call with enable=[names] to add them to " +
    "tools/list for this server; the response includes their full schemas so you can call them immediately. " +
    "Use this instead of rebuilding missing capabilities with runJS.",
  inputSchema: {
    type: "object",
    properties: {
      enable: { type: "array", items: { type: "string" }, description: "Tool names from the catalog to advertise" }
    },
    additionalProperties: false
  }
};

export type DiscoverResult = {
  catalog?: CatalogEntry[];
  enabled?: Array<Pick<GeneratedTool, "name" | "description" | "inputSchema">>;
  unknown?: string[];
  /** True when `advertised` grew; the caller sends tools/list_changed. */
  changed: boolean;
};

export function handleDiscover(input: {
  all: GeneratedTool[];
  advertised: Set<string>;
  args: Record<string, unknown>;
}): DiscoverResult {
  const { all, advertised, args } = input;
  const byName = new Map(all.map((t) => [t.name, t]));
  const requested = Array.isArray(args.enable) ? (args.enable as unknown[]).map(String) : null;
  if (!requested) return { catalog: discoveryCatalog(all, advertised), changed: false };

  const enabled: DiscoverResult["enabled"] = [];
  const unknown: string[] = [];
  for (const raw of requested) {
    const name = raw.startsWith("browser_") ? raw : `browser_${raw}`;
    const t = byName.get(name);
    if (!t) { unknown.push(raw); continue; }
    if (advertised.has(name)) continue;
    advertised.add(name);
    enabled.push({ name: t.name, description: t.description, inputSchema: t.inputSchema });
  }
  return { enabled, ...(unknown.length ? { unknown } : {}), changed: enabled.length > 0 };
}
