import { rmSync } from "node:fs";
import { join } from "node:path";

rmSync(join(__dirname, "..", "dist"), { recursive: true, force: true });
