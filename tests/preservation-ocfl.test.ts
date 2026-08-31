import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluatePreservationMapping,
  exportOcflObject,
  validateOcflObject
} from "../src/preservation.js";
import { preservationFixture, temporaryRoot } from "./preservation-fixtures.js";

const cleanups: (() => Promise<void>)[] = [];
afterEach(async () => Promise.all(cleanups.splice(0).map((cleanup) => cleanup())));

async function exportFixture(duplicateDerivativeBytes = false): Promise<{
  destination: string;
  mappingEntryCount: number;
}> {
  const temporary = await temporaryRoot();
  cleanups.push(temporary.cleanup);
  const fixture = await preservationFixture({ duplicateDerivativeBytes });
  const mapping = await evaluatePreservationMapping({
    profile: "ocfl-1.1-sha256",
    manifest: fixture.manifest,
    original: { bytes: fixture.original },
    derivatives: fixture.derivatives,
    provenance: fixture.provenance
  });
  const destination = join(temporary.root, "object");
  await exportOcflObject(mapping, { destination });
  return { destination, mappingEntryCount: mapping.entries.length };
}

describe("OCFL preservation export", () => {
  it("exports a conforming new v1 object with inventory parity and fixity", async () => {
    const { destination } = await exportFixture();
    const validation = await validateOcflObject(destination);
    expect(validation.ok).toBe(true);
    expect(validation.contentFileCount).toBe(validation.verifiedContentFileCount);
    expect(await readFile(join(destination, "0=ocfl_object_1.1"), "utf8"))
      .toBe("ocfl_object_1.1\n");
    expect(await readFile(join(destination, "inventory.json"), "utf8"))
      .toBe(await readFile(join(destination, "v1/inventory.json"), "utf8"));
  });

  it("stores identical derivative bytes once while retaining both logical roles", async () => {
    const { destination, mappingEntryCount } = await exportFixture(true);
    const inventory = JSON.parse(await readFile(join(destination, "inventory.json"), "utf8"));
    const statePaths = Object.values(inventory.versions.v1.state).flat() as string[];
    const derivativePaths = statePaths.filter((path) => path.startsWith("derivatives/"));
    expect(derivativePaths).toHaveLength(2);
    expect(Object.keys(inventory.manifest).length).toBeLessThan(mappingEntryCount);
    expect((await validateOcflObject(destination)).ok).toBe(true);
  });

  it("detects changed content, root/version inventory divergence, and digest-sidecar changes", async () => {
    const changed = await exportFixture();
    const inventory = JSON.parse(await readFile(join(changed.destination, "inventory.json"), "utf8"));
    const contentPath = Object.values(inventory.manifest)[0][0] as string;
    await writeFile(join(changed.destination, ...contentPath.split("/")), "changed");
    expect((await validateOcflObject(changed.destination)).issues.map((issue) => issue.code))
      .toContain("preservation.content_changed");

    const inventoryMutation = await exportFixture();
    await writeFile(join(inventoryMutation.destination, "v1/inventory.json"), "{}");
    await writeFile(join(inventoryMutation.destination, "inventory.json.sha256"), "bad\n");
    const codes = (await validateOcflObject(inventoryMutation.destination)).issues.map((issue) => issue.code);
    expect(codes).toContain("preservation.inventory_mismatch");
    expect(codes).toContain("preservation.inventory_digest_invalid");
  });

  it("detects unsafe logical paths and broken relationship state", async () => {
    const { destination } = await exportFixture();
    const inventory = JSON.parse(await readFile(join(destination, "inventory.json"), "utf8"));
    const relationshipDigest = Object.entries(inventory.versions.v1.state)
      .find(([, paths]) => (paths as string[]).includes("metadata/relationships.json"))![0];
    inventory.versions.v1.state[relationshipDigest] = ["../relationships.json"];
    await writeFile(join(destination, "inventory.json"), JSON.stringify(inventory));
    await writeFile(join(destination, "v1/inventory.json"), JSON.stringify(inventory));
    const codes = (await validateOcflObject(destination)).issues.map((issue) => issue.code);
    expect(codes).toContain("preservation.path_unsafe");
    expect(codes).toContain("preservation.relationship_invalid");
  });
});
