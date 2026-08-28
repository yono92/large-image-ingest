#!/usr/bin/env node

const path = require("node:path");
const { DEFAULT_SIZE_BYTES, generateFixture } = require("../examples/reference-local/create-fixture.cjs");

const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  "../examples/uppy-react/.fixtures/synthetic-inspection.tiff"
);

function parseArguments(argv) {
  let outputPath = DEFAULT_OUTPUT_PATH;
  let sizeBytes = DEFAULT_SIZE_BYTES;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") {
      outputPath = path.resolve(requireValue(argv, ++index, argument));
    } else if (argument === "--size-mib") {
      const sizeMiB = Number(requireValue(argv, ++index, argument));
      if (!Number.isFinite(sizeMiB) || sizeMiB <= 0) {
        throw new RangeError("--size-mib must be a positive number.");
      }
      sizeBytes = Math.floor(sizeMiB * 1024 * 1024);
    } else {
      throw new RangeError(`Unexpected argument: ${argument}`);
    }
  }
  return { outputPath, sizeBytes };
}

function requireValue(argv, index, name) {
  const value = argv[index];
  if (!value || value.startsWith("--")) {
    throw new RangeError(`${name} requires a value.`);
  }
  return value;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const result = await generateFixture(options.outputPath, options.sizeBytes);
  process.stdout.write(
    `Created ${path.relative(process.cwd(), result.outputPath)} (${result.sizeBytes} bytes, sha256 ${result.checksum})\n`
  );
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Fixture generation failed."}\n`);
    process.exitCode = 1;
  });
}

module.exports = { DEFAULT_OUTPUT_PATH, DEFAULT_SIZE_BYTES, generateFixture, parseArguments };
