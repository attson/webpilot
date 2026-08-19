type ContentScript = {
  matches?: string[];
  js?: string[];
  css?: string[];
};

type BuiltManifest = {
  content_scripts?: ContentScript[];
};

export function stripBootstrapCss(manifest: BuiltManifest): BuiltManifest {
  for (const entry of manifest.content_scripts ?? []) {
    const isOrdinaryBootstrap = entry.matches?.includes("<all_urls>") &&
      entry.js?.some((file) => file.includes("bootstrap.ts-loader"));
    if (isOrdinaryBootstrap) delete entry.css;
  }
  return manifest;
}

export function bootstrapHasPageCss(manifest: BuiltManifest): boolean {
  return (manifest.content_scripts ?? []).some((entry) =>
    entry.matches?.includes("<all_urls>") &&
    entry.js?.some((file) => file.includes("bootstrap.ts-loader")) &&
    (entry.css?.length ?? 0) > 0
  );
}
