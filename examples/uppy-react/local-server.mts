import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { createLocalReferenceServer as createSharedServer, type LocalReferenceServerOptions } from "../reference-local/local-server.mjs";

export function createLocalReferenceServer(options: LocalReferenceServerOptions = {}) {
  return createSharedServer({ ...options, root: options.root ?? path.join(os.tmpdir(), "large-image-ingest-uppy-reference") });
}

async function main() {
  const port = Number(process.env.LII_UPPY_EXAMPLE_PORT ?? 4174);
  const root = process.env.LII_UPPY_EXAMPLE_ROOT;
  const chunkResponseDelayMs = Number(process.env.LII_UPPY_EXAMPLE_CHUNK_DELAY_MS ?? 600);
  const local = await createLocalReferenceServer({ port, ...(root === undefined ? {} : { root }), chunkResponseDelayMs });
  process.stdout.write(`Local reference target: ${local.baseUrl}\n`);
  process.stdout.write(`Temporary artifact root: ${local.root}\n`);
  process.stdout.write(`Demonstration chunk response delay: ${chunkResponseDelayMs} ms\n`);

  const shutdown = async () => {
    await local.close();
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Local server failed."}\n`);
    process.exitCode = 1;
  });
}
