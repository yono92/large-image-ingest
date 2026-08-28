import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InspectionUploadPanel } from "../src/react-ui";
import { InspectionUploadProgress } from "../src/react-ui/InspectionUploadProgress";
import { FakeController } from "./react-ui-fixtures";

describe("first-party React UI components", () => {
  it("renders the complete panel during server rendering without browser globals", () => {
    const html = renderToStaticMarkup(createElement(InspectionUploadPanel, {
      createController: (file) => new FakeController(file)
    }));

    expect(html).toContain("Inspection upload");
    expect(html).toContain('type="file"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("Stored-original verification");
    expect(html).not.toContain("uppy");
  });

  it("fails clearly when a stateful primitive is outside the provider", () => {
    expect(() => renderToStaticMarkup(createElement(InspectionUploadProgress))).toThrow(
      "must be rendered inside InspectionUploadProvider"
    );
  });

  it("renders only an explicit caller-owned derivative preview", () => {
    const html = renderToStaticMarkup(createElement(InspectionUploadPanel, {
      createController: (file) => new FakeController(file),
      preview: {
        kind: "derivative",
        src: "/safe-preview.webp",
        alt: "Downsampled inspection derivative"
      }
    }));
    expect(html).not.toContain("safe-preview.webp");
  });
});
