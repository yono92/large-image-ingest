// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { VerifiedIngestPanel } from "../src/react-ui.js";
import type { VerifiedIngestController } from "../src/react.js";
import type {
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflowState
} from "../src/workflow.js";

afterEach(() => cleanup());

class FakeVerifiedController implements VerifiedIngestController {
  private listeners = new Set<() => void>();
  private state: VerifiedIngestWorkflowState = {
    status: "preparing",
    workflowId: "workflow-ui",
    revision: 0,
    updatedAt: "2026-09-07T00:00:00.000Z",
    allowedActions: ["cancel"]
  };
  starts = 0;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getState = () => this.state;
  start = async (): Promise<VerifiedIngestRunResult> => {
    this.starts += 1;
    return this.state as VerifiedIngestRunResult;
  };
  resume = async (): Promise<VerifiedIngestRunResult> => this.state as VerifiedIngestRunResult;
  retry = async (): Promise<VerifiedIngestRunResult> => this.state as VerifiedIngestRunResult;
  pause = (): void => {};
  cancel = async (): Promise<VerifiedIngestTerminalState> => {
    return this.state as VerifiedIngestTerminalState;
  };
  dispose = (): void => { this.listeners.clear(); };
  publish(state: VerifiedIngestWorkflowState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }
}

describe("verified ingest React UI", () => {
  it("renders a keyboard-native action and polite lifecycle status", async () => {
    const controller = new FakeVerifiedController();
    const { container } = render(<VerifiedIngestPanel controller={controller} />);

    expect(screen.getByRole("heading", { name: "Verified ingest" })).toBeTruthy();
    expect(screen.getByText("Workflow state: preparing").getAttribute("aria-live")).toBe("polite");
    const start = screen.getByRole("button", { name: "Start verified ingest" });
    start.focus();
    fireEvent.click(start);
    expect(controller.starts).toBe(1);
    const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(results.violations.filter((violation) =>
      violation.impact === "serious" || violation.impact === "critical"
    )).toEqual([]);
  });

  it("shows only typed safe failures and legal recovery actions", () => {
    const controller = new FakeVerifiedController();
    const { container } = render(<VerifiedIngestPanel controller={controller} />);
    act(() => {
      controller.publish({
        status: "verification_failed",
        workflowId: "workflow-ui",
        revision: 8,
        updatedAt: "2026-09-07T00:00:00.000Z",
        lastAuthoritativeState: "uploaded_unverified",
        issueCodes: ["workflow.verification_failed"],
        retryability: "retry",
        allowedActions: ["retry", "stop"]
      });
    });

    expect(screen.getByRole("alert").textContent).toBe("workflow.verification_failed");
    expect(screen.getByRole("button", { name: "Retry from authority" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop downstream work" })).toBeTruthy();
    expect(container.textContent).not.toContain("provider-secret");
    expect(container.firstElementChild?.getAttribute("data-lii-workflow-state"))
      .toBe("verification_failed");
  });
});
