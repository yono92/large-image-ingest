import { constants, openAsBlob } from "node:fs";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { ExampleFailure } from "./cli.mjs";

export async function openLocalSource(filePath: string) {
  try {
    const before = await stat(filePath);
    if (!before.isFile()) throw new ExampleFailure("input.not_regular");
    if (before.size === 0) throw new ExampleFailure("input.empty");
    await access(filePath, constants.R_OK);
    const extension = path.extname(filePath).toLowerCase();
    const mediaTypes: Record<string, string> = {
      ".tif": "image/tiff", ".tiff": "image/tiff", ".png": "image/png",
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"
    };
    const file = Object.assign(await openAsBlob(filePath, { type: mediaTypes[extension] ?? "application/octet-stream" }), {
      name: path.basename(filePath), lastModified: before.mtimeMs
    });
    const assertUnchanged = async () => {
      try {
        const current = await stat(filePath);
        if (!current.isFile() || current.dev !== before.dev || current.ino !== before.ino || current.size !== before.size ||
          current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) throw new ExampleFailure("input.changed");
      } catch {
        throw new ExampleFailure("input.changed");
      }
    };
    await assertUnchanged();
    return { file, assertUnchanged };
  } catch (error) {
    if (error instanceof ExampleFailure) throw error;
    const code = (error as NodeJS.ErrnoException).code;
    throw new ExampleFailure(code === "ENOENT" ? "input.not_found" :
      code === "EACCES" || code === "EPERM" ? "input.access_denied" : "input.failed");
  }
}
