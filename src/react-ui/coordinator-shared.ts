// Part of coordinator.ts, split out to keep modules under 500 lines; public exports stay on coordinator.ts.
import type { InspectionUiControls } from "./types.js";

export const emptyControls: InspectionUiControls = Object.freeze({
  canSelect: true,
  canRemove: false,
  canStart: false,
  canPause: false,
  canResume: false,
  canCancel: false,
  canRetryVerification: false,
  canDiscardRecovery: false
});
