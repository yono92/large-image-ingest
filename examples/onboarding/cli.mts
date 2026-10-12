import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const guidance = {
  "usage.invalid": "Invalid arguments. Run this command with --help for usage.",
  "input.not_found": "Source file was not found. Check the --file path.",
  "input.access_denied": "Source file cannot be read. Check its read permissions.",
  "input.not_regular": "Source must be a regular file. Choose a local image file.",
  "input.empty": "Source file is empty. Choose a non-empty original.",
  "input.changed": "Source changed or became unreadable during execution. Keep the original unchanged and retry.",
  "input.failed": "Source file could not be opened. Check the file and its read permissions.",
  "storage.access_denied": "Local artifacts cannot be written. Choose a writable --root directory.",
  "storage.full": "Local storage is full. Free space or choose another --root directory.",
  "server.port_in_use": "Local server port is already in use. Stop the conflicting local server and retry.",
  "validation.failed": "Source does not satisfy the ingest policy. Check the file and validation settings.",
  "verification.failed": "Stored original verification failed. Keep the source unchanged and inspect local storage before retrying.",
  "example.failed": "Example could not complete. Check local storage, server availability and the example requirements."
} as const;

export type ExampleFailureCode = keyof typeof guidance;
export interface ExampleOptions { root?: string; file?: string }

export class ExampleFailure extends Error {
  constructor(readonly code: ExampleFailureCode) {
    super(guidance[code]);
    this.name = "ExampleFailure";
  }
}

export function formatExampleFailure(error: unknown): string {
  let code: ExampleFailureCode = "example.failed";
  if (error instanceof ExampleFailure) code = error.code;
  else if (error && typeof error === "object") {
    const cause = error as { code?: unknown; name?: unknown };
    if (cause.code === "EACCES" || cause.code === "EPERM" || cause.code === "EROFS") code = "storage.access_denied";
    else if (cause.code === "ENOSPC") code = "storage.full";
    else if (cause.code === "EADDRINUSE") code = "server.port_in_use";
    else if (cause.code === "validation.failed") code = "validation.failed";
    else if (cause.name === "NotReadableError") code = "input.changed";
  }
  return `[${code}] ${guidance[code]}\n`;
}

export function parseExampleArguments(args: readonly string[], allowFile: boolean): ExampleOptions & { help?: boolean } {
  if (args.length === 1 && (args[0] === "--help" || args[0] === "-h")) return { help: true };
  const result: ExampleOptions = {};
  for (let index = 0; index < args.length; index += 2) {
    const option = args[index];
    const value = args[index + 1];
    if ((option !== "--root" && !(allowFile && option === "--file")) || !value || value.startsWith("--")) {
      throw new ExampleFailure("usage.invalid");
    }
    const key = option === "--root" ? "root" : "file";
    if (result[key] !== undefined) throw new ExampleFailure("usage.invalid");
    result[key] = value;
  }
  return result;
}

export function runCli(moduleUrl: string, run: (options: ExampleOptions) => Promise<{
  root: string; status: string; storedVerified: boolean; evidenceReloaded?: boolean; recovered?: boolean
}>, allowFile = false) {
  if (!process.argv[1] || realpathSync(process.argv[1]) !== realpathSync(fileURLToPath(moduleUrl))) return;
  return (async () => {
    const options = parseExampleArguments(process.argv.slice(2), allowFile);
    if (options.help) {
      process.stdout.write(`Usage: ${allowFile ? "large-image-ingest-minimal" : "large-image-ingest-verified"} [--root <directory>]${allowFile ? " [--file <path>]" : ""} [--help]\n`);
      process.stdout.write(allowFile ? "Without --file, uploads a generated TIFF. Requires Node.js 20+.\n" : "Runs the generated-fixture workflow with recovery and evidence. Requires Node.js 20+.\n");
      return;
    }
    const { root, status, storedVerified, evidenceReloaded, recovered } = await run(options);
    process.stdout.write(`${JSON.stringify({ status, storedVerified,
      ...(evidenceReloaded === undefined ? {} : { evidenceReloaded, recovered }) })}\n`);
    process.stdout.write(`Local artifacts: ${root}\n`);
  })().catch(error => {
    process.stderr.write(formatExampleFailure(error));
    process.exitCode = 1;
  });
}
