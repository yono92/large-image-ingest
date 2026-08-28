// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { InspectionUploadPanel } from "../src/react-ui";
import { FakeController } from "./react-ui-fixtures";

describe("first-party React UI accessibility", () => {
  afterEach(() => cleanup());

  it("has no serious or critical automated violations in the idle panel", async () => {
    const { container } = render(
      <InspectionUploadPanel createController={(file) => new FakeController(file)} />
    );
    const results = await scan(container);
    expect(results.violations.filter((violation) => (
      violation.impact === "serious" || violation.impact === "critical"
    ))).toEqual([]);
    expect(container.querySelector("input[type=file]")?.getAttribute("type")).toBe("file");
    expect(screen.getByText("Waiting for a local source").getAttribute("aria-live")).toBe("polite");
  });

  it("uses exact selection, semantic progress, valid actions, and a caller-owned derivative", async () => {
    const controllers: FakeController[] = [];
    const file = createFile();
    let sliceCalls = 0;
    const originalSlice = file.slice.bind(file);
    Object.defineProperty(file, "slice", {
      value: (...arguments_: Parameters<File["slice"]>) => {
        sliceCalls += 1;
        return originalSlice(...arguments_);
      }
    });
    const { container } = render(
      <InspectionUploadPanel
        createController={(selected) => {
          const controller = new FakeController(selected);
          controllers.push(controller);
          return controller;
        }}
        preview={{ kind: "derivative", src: "/preview.webp", alt: "Inspection derivative" }}
      />
    );

    const input = container.querySelector("input[type=file]");
    if (!input) throw new Error("Expected the native file input.");
    fireEvent.change(input, {
      target: { files: [file] }
    });
    await screen.findByText("inspection-long-name.tif");
    expect(screen.getByAltText("Inspection derivative").getAttribute("src")).toBe("/preview.webp");
    expect(sliceCalls).toBe(0);
    expect((screen.getByRole("button", { name: "Start ingest" }) as HTMLButtonElement).disabled).toBe(false);

    act(() => controllers[0]?.setState({
      status: "uploading",
      uploadedBytes: 64,
      totalBytes: 128,
      progress: 0.5
    }));
    const progress = screen.getByRole("progressbar", { name: "Acknowledged upload progress" });
    expect(progress.getAttribute("value")).toBe("64");
    expect(progress.getAttribute("max")).toBe("128");
    expect((screen.getByRole("button", { name: "Pause" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("button", { name: "Start ingest" })).toBeNull();

    const results = await scan(container);
    expect(results.violations.filter((violation) => violation.impact === "critical")).toEqual([]);
  });

  it("rejects multiple files and focuses a stable blocking error heading", async () => {
    const controllers: FakeController[] = [];
    const { container } = render(<InspectionUploadPanel createController={(file) => {
      const controller = new FakeController(file);
      controllers.push(controller);
      return controller;
    }} />);
    const input = container.querySelector("input[type=file]");
    if (!input) throw new Error("Expected the native file input.");
    fireEvent.change(input, { target: { files: [createFile(), createFile("second.tif")] } });
    expect(screen.getByRole("alert").textContent).toContain("Choose one local file at a time.");

    fireEvent.change(input, { target: { files: [createFile()] } });
    await screen.findByText("inspection-long-name.tif");
    act(() => controllers[0]?.fail(Object.assign(new Error("private URL"), {
      code: "validation.failed",
      retryable: false
    })));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Upload needs attention" })));
    expect(document.body.textContent).not.toContain("private URL");
  });
});

function createFile(name = "inspection-long-name.tif"): File {
  return new File([new Uint8Array(128)], name, { type: "image/tiff", lastModified: Date.UTC(2026, 0, 1) });
}

async function scan(container: HTMLElement): Promise<axe.AxeResults> {
  return axe.run(container, { rules: { "color-contrast": { enabled: false } } });
}
