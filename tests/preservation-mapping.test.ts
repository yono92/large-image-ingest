import { describe, expect, it } from "vitest";
import { evaluatePreservationMapping } from "../src/preservation.js";
import { preservationFixture } from "./preservation-fixtures.js";

describe("preservation mapping", () => {
  it.each(["bagit-1.0-sha256", "ocfl-1.1-sha256"] as const)(
    "maps one original, derivatives, manifest, provenance, and relationships for %s",
    async (profile) => {
      const fixture = await preservationFixture();
      const mapping = await evaluatePreservationMapping({
        profile,
        manifest: fixture.manifest,
        original: { bytes: fixture.original },
        derivatives: fixture.derivatives,
        provenance: fixture.provenance
      });

      expect(mapping.status).toBe("exportable");
      expect(mapping.entries.map((entry) => entry.role)).toEqual([
        "original", "derivative", "derivative", "manifest", "provenance", "relationships"
      ]);
      expect(mapping.entries.every((entry) => /^[a-f0-9]{64}$/.test(entry.digest.value))).toBe(true);
      expect(JSON.stringify(mapping)).not.toContain("same-name.jpg");
      expect(JSON.stringify(mapping)).not.toContain("untrusted");
    }
  );

  it("is deterministic for identical authoritative inputs", async () => {
    const fixture = await preservationFixture();
    const input = {
      profile: "ocfl-1.1-sha256" as const,
      manifest: fixture.manifest,
      original: { bytes: fixture.original },
      derivatives: fixture.derivatives,
      provenance: fixture.provenance
    };
    const first = await evaluatePreservationMapping(input);
    const second = await evaluatePreservationMapping(input);
    expect(JSON.parse(JSON.stringify(first))).toEqual(JSON.parse(JSON.stringify(second)));
  });

  it("blocks missing trusted digest evidence unless calculation is explicitly allowed", async () => {
    const fixture = await preservationFixture();
    const manifest = structuredClone(fixture.manifest);
    delete manifest.original.checksum;
    const blocked = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest,
      original: { bytes: fixture.original }
    });
    const calculated = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest,
      original: { bytes: fixture.original },
      digestPolicy: "calculate-and-verify"
    });
    expect(blocked.status).toBe("blocked");
    expect(blocked.blockers).toContainEqual({ code: "preservation.digest_missing", role: "original" });
    expect(calculated.status).toBe("exportable_with_warnings");
  });

  it("blocks changed original bytes, unavailable derivatives, and invalid provenance", async () => {
    const fixture = await preservationFixture();
    const mapping = await evaluatePreservationMapping({
      profile: "ocfl-1.1-sha256",
      manifest: fixture.manifest,
      original: { bytes: new Blob(["changed"]) as Blob & { name: string } },
      derivatives: [{ derivative: fixture.derivatives[0]!.derivative }],
      provenance: { ...fixture.provenance, terminalStatus: "active" }
    });
    expect(mapping.status).toBe("blocked");
    expect(mapping.blockers.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "preservation.source_size_mismatch",
      "preservation.source_unavailable",
      "preservation.provenance_invalid"
    ]));
  });

  it("does not treat planned or failed derivatives as preserved content", async () => {
    const fixture = await preservationFixture();
    const planned = { ...fixture.derivatives[0]!.derivative, status: "planned" as const };
    const mapping = await evaluatePreservationMapping({
      profile: "bagit-1.0-sha256",
      manifest: fixture.manifest,
      original: { bytes: fixture.original },
      derivatives: [{ derivative: planned, bytes: fixture.derivatives[0]!.bytes }]
    });
    expect(mapping.status).toBe("blocked");
    expect(mapping.entries.filter((entry) => entry.role === "derivative")).toHaveLength(0);
  });
});
