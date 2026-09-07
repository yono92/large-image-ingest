import { describe, expectTypeOf, it } from "vitest";
import { createVerifiedIngestWorkflow } from "../src/workflow.js";
import type {
  VerifiedIngestRunResult,
  VerifiedIngestTerminalState,
  VerifiedIngestWorkflow
} from "../src/workflow.js";

describe("verified workflow contract", () => {
  it("keeps recoverable run results broader than strict terminal states", () => {
    expectTypeOf(createVerifiedIngestWorkflow).returns.toMatchTypeOf<VerifiedIngestWorkflow>();
    expectTypeOf<VerifiedIngestTerminalState>().toMatchTypeOf<VerifiedIngestRunResult>();
    expectTypeOf<Extract<VerifiedIngestRunResult, { status: "paused" }>>().not.toEqualTypeOf<never>();
    expectTypeOf<Extract<VerifiedIngestTerminalState, { status: "paused" }>>().toEqualTypeOf<never>();
  });
});
