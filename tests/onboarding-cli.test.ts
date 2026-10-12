import { afterEach, describe, expect, it, vi } from "vitest";
import { fileURLToPath } from "node:url";
import { formatExampleFailure, ExampleFailure, parseExampleArguments, runCli } from "../examples/onboarding/cli.mts";

const originalArguments = process.argv;
const originalExitCode = process.exitCode;
afterEach(() => {
  process.argv = originalArguments;
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
});

describe("onboarding CLI", () => {
  it("help exits successfully without invoking an upload", async () => {
    process.argv = [process.execPath, fileURLToPath(import.meta.url), "--help"];
    process.exitCode = 0;
    const write = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const run = vi.fn();
    await runCli(import.meta.url, run, true);
    expect(run).not.toHaveBeenCalled();
    expect(write.mock.calls.flat().join("")).toContain("--file");
    expect(process.exitCode).toBe(0);
  });

  it.each(["usage.invalid", "input.not_found", "input.access_denied", "input.not_regular", "input.empty",
    "input.changed", "input.failed", "storage.access_denied", "storage.full", "server.port_in_use",
    "validation.failed", "verification.failed", "example.failed"] as const)("%s exits nonzero with safe guidance", async code => {
      process.argv = [process.execPath, fileURLToPath(import.meta.url)];
      process.exitCode = 0;
      const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const run = vi.fn().mockRejectedValue(new ExampleFailure(code));
      await runCli(import.meta.url, run, true);
      expect(process.exitCode).toBe(1);
      expect(write).toHaveBeenCalledWith(formatExampleFailure(new ExampleFailure(code)));
    });

  it("parses file/root in either order and supports non-executing help", () => {
    expect(parseExampleArguments(["--file", "private image.tiff", "--root", "output"], true))
      .toEqual({ file: "private image.tiff", root: "output" });
    expect(parseExampleArguments(["--root", "output", "--file", "source.tiff"], true))
      .toEqual({ root: "output", file: "source.tiff" });
    expect(parseExampleArguments(["--help"], false)).toEqual({ help: true });
    expect(parseExampleArguments([], true)).toEqual({});
  });

  it.each([["--file"], ["--root"], ["--unknown", "private"], ["--root", "x", "--root", "y"],
    ["--file", "x", "--file", "y"], ["--root", "--help"], ["--help", "--file", "x"]])(
    "rejects malformed arguments %j", (...args) => {
      expect(() => parseExampleArguments(args, true)).toThrow(expect.objectContaining({ code: "usage.invalid" }));
    });

  it("rejects user-file input for the fixture-specific verified workflow", () => {
    expect(() => parseExampleArguments(["--file", "x"], false))
      .toThrow(expect.objectContaining({ code: "usage.invalid" }));
  });

  it.each([
    [{ code: "EACCES" }, "storage.access_denied"],
    [{ code: "ENOSPC" }, "storage.full"],
    [{ code: "EADDRINUSE" }, "server.port_in_use"],
    [{ code: "validation.failed" }, "validation.failed"],
    [{ name: "NotReadableError" }, "input.changed"],
    [new ExampleFailure("verification.failed"), "verification.failed"],
    [new Error("private filename /customer/path token=secret https://secret.example sha256=private"), "example.failed"]
  ])("formats a safe cause for %j", (error, code) => {
    const text = formatExampleFailure(error);
    expect(text).toContain(`[${code}]`);
    expect(text).not.toMatch(/customer|token=|https:|sha256=|private filename/);
    expect(text.split(" ").length).toBeGreaterThan(4);
  });

  it.each(["input.not_found", "input.access_denied", "input.not_regular", "input.empty", "input.changed", "input.failed"] as const)(
    "provides fixed guidance for %s", code => {
      expect(formatExampleFailure(new ExampleFailure(code))).toContain(`[${code}]`);
    });
});
