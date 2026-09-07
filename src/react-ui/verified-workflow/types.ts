import type { CSSProperties, ReactNode } from "react";
import type { VerifiedIngestController } from "../../react-workflow-controller.js";

export interface VerifiedIngestPanelProps {
  readonly controller: VerifiedIngestController;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly title?: ReactNode;
  readonly description?: ReactNode;
}
