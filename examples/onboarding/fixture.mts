import { realpathSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// A valid, uncompressed 512 × 512 grayscale TIFF with one strip and 8-bit samples.
export function createFixture() {
  const tags: [number, number, number][] = [[256, 4, 512], [257, 4, 512], [258, 3, 8], [259, 3, 1],
    [262, 3, 1], [273, 4, 122], [277, 3, 1], [278, 4, 512], [279, 4, 262144]];
  const bytes = new Uint8Array(262266);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, tags.length, true);
  tags.forEach(([tag, type, value], index) => {
    const offset = 10 + index * 12;
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, 1, true);
    view.setUint32(offset + 8, value, true);
  });
  bytes.fill(127, 122);
  return Object.assign(new Blob([bytes], { type: "image/tiff" }), { name: "starter.tiff", lastModified: 0 });
}

export async function exampleRoot(root?: string) {
  return root ? path.resolve(root) : mkdtemp(path.join(os.tmpdir(), "large-image-ingest-onboarding-"));
}

export function runCli(moduleUrl: string, run: (options: { root?: string }) => Promise<{ root: string; status: string; storedVerified: boolean; evidenceReloaded?: boolean; recovered?: boolean }>) {
  if (!process.argv[1] || realpathSync(process.argv[1]) !== realpathSync(fileURLToPath(moduleUrl))) return;
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== "--root")) {
    process.stderr.write("Usage: node example.mjs [--root <directory>]\n");
    process.exitCode = 1;
    return;
  }
  run(args[1] === undefined ? {} : { root: args[1] }).then(result => {
    const { root, status, storedVerified, evidenceReloaded, recovered } = result;
    process.stdout.write(`${JSON.stringify({ status, storedVerified,
      ...(evidenceReloaded === undefined ? {} : { evidenceReloaded, recovered }) })}\n`);
    process.stdout.write(`Local artifacts: ${root}\n`);
  }).catch(() => {
    process.stderr.write("Onboarding example failed; check local storage permissions and available ports.\n");
    process.exitCode = 1;
  });
}
