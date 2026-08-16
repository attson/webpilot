import manifest from "@/manifest";

const WEBPILOT_EXTENSION_KEY =
  "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2MMIurte87Qyc3+fgE14sZvVNdY7Y/olNx0+9P5av+/KaVbtRjgsAWB7hEdJhvX0qjAPi083fknAmZ/kMjTWVGhjWgl+XVxWH19PANwk7gbPw0qxYQsEi8p9iFJteirmszxPootNYsFnSCdgTebk9O7j2E1mNDCcR9+vt6rOMTZXBgjNy8tmAtHeWG5m8XD+EZSvx7sxh4bXNIhKMcpUnnx8j6+BHiuJyAkKsgTHkZ8pDAapwRYX+FpMzSLap5ugeiGCFiA3RWOTFG0LdbjJ1tuIczu3EJ3diGOgQtt5nZmZJvCkcA60l4qShDiJhWTFHHi2VsROY51eJLecQsffFQIDAQAB";

describe("manifest", () => {
  it("includes a fixed extension key so unpacked builds keep the same id", () => {
    expect((manifest as { key?: string }).key).toBe(WEBPILOT_EXTENSION_KEY);
  });

  it("allows the service worker to connect to the local coordinator websocket", () => {
    const hostPermissions = (manifest as { host_permissions?: string[] }).host_permissions ?? [];
    expect(hostPermissions).toContain("ws://127.0.0.1/*");
    expect(hostPermissions).toContain("ws://localhost/*");
  });
});

type ContentScript = { js?: string[]; world?: string; run_at?: string };
const m = manifest as {
  permissions?: string[];
  optional_permissions?: string[];
  content_scripts?: ContentScript[];
};

describe("Plan 32 — recorder and CDP opt-in", () => {
  it("does not request the debugger permission up front", () => {
    expect(m.permissions).not.toContain("debugger");
    expect(m.optional_permissions).toContain("debugger");
  });

  it("declares the recorder as a MAIN-world document_start script", () => {
    const entry = (m.content_scripts ?? []).find((e) =>
      (e.js ?? []).some((f) => f.includes("recorder/main-world"))
    );
    expect(entry).toBeDefined();
    expect(entry!.world).toBe("MAIN");
    expect(entry!.run_at).toBe("document_start");
  });
});
