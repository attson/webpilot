import { beforeEach, describe, expect, it } from "vitest";
import { findElements } from "@/content/tools/find-elements";
import { lookupUid } from "@/content/tools/uid-cache";

type Match = { uid: string; name: string; role: string; tag: string };
const run = async (args: unknown) =>
  (await findElements(args as never)) as unknown as { matches: Match[] };

describe("findElements", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <button>Save changes</button>
      <button>Cancel</button>
      <a href="/x" aria-label="Download report">link</a>
      <input name="email" />`;
  });

  it("matches text case-insensitively", async () => {
    const out = await run({ text: "save" });
    expect(out.matches).toHaveLength(1);
    expect(out.matches[0].name).toBe("Save changes");
  });

  it("matches aria-label via regex", async () => {
    const out = await run({ regex: "^Download" });
    expect(out.matches.map((m) => m.name)).toEqual(["Download report"]);
  });

  it("honours limit", async () => {
    const out = await run({ regex: ".", limit: 2 });
    expect(out.matches).toHaveLength(2);
  });

  it("returns uids that resolve against the cache", async () => {
    const out = await run({ text: "Cancel" });
    expect(lookupUid(out.matches[0].uid)?.textContent).toBe("Cancel");
  });

  it("reports role and tag", async () => {
    const out = await run({ text: "email" });
    expect(out.matches[0].tag).toBe("input");
    expect(out.matches[0].role).toBe("input");
  });

  it("requires a query", async () => {
    await expect(findElements({} as never)).rejects.toThrow("text or regex required");
  });

  it("rejects an invalid regex", async () => {
    await expect(findElements({ regex: "[" } as never)).rejects.toThrow("invalid regex");
  });

  it("returns an empty list when nothing matches", async () => {
    const out = await run({ text: "nothing-here" });
    expect(out.matches).toEqual([]);
  });
});
