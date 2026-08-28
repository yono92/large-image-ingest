#!/usr/bin/env node

const { createHash } = require("node:crypto");
const { mkdir, open } = require("node:fs/promises");
const path = require("node:path");

const MIB = 1024 * 1024;
const DEFAULT_SIZE_BYTES = 12 * MIB + 8;
const DEFAULT_OUTPUT_PATH = path.resolve(
  __dirname,
  ".fixtures/synthetic-inspection.tiff"
);
const TIFF_HEADER = Buffer.from([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00]);

async function generateFixture(outputPath = DEFAULT_OUTPUT_PATH, sizeBytes = DEFAULT_SIZE_BYTES) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < TIFF_HEADER.length) {
    throw new RangeError(`Fixture size must be at least ${TIFF_HEADER.length} bytes.`);
  }

  const resolvedPath = path.resolve(outputPath);
  await mkdir(path.dirname(resolvedPath), { recursive: true });
  const handle = await open(resolvedPath, "w");
  const hash = createHash("sha256");

  try {
    await handle.write(TIFF_HEADER);
    hash.update(TIFF_HEADER);

    const block = Buffer.allocUnsafe(Math.min(MIB, sizeBytes - TIFF_HEADER.length || 1));
    let offset = TIFF_HEADER.length;

    while (offset < sizeBytes) {
      const length = Math.min(block.length, sizeBytes - offset);
      for (let index = 0; index < length; index += 1) {
        block[index] = ((offset + index) * 31 + 17) % 251;
      }
      await handle.write(block, 0, length, offset);
      hash.update(block.subarray(0, length));
      offset += length;
    }

    await handle.sync();
  } finally {
    await handle.close();
  }

  return {
    outputPath: resolvedPath,
    sizeBytes,
    checksum: hash.digest("hex")
  };
}

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
      sizeBytes = Math.floor(sizeMiB * MIB);
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

module.exports = {
  DEFAULT_OUTPUT_PATH,
  DEFAULT_SIZE_BYTES,
  generateFixture,
  parseArguments
};
