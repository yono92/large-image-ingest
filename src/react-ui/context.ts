import { createContext, useContext, useSyncExternalStore } from "react";
import type { InspectionUploadCoordinator } from "./coordinator.js";
import type { InspectionUploadUiValue } from "./types.js";

export const InspectionUploadCoordinatorContext = createContext<InspectionUploadCoordinator | undefined>(undefined);

export function useInspectionUploadUi(): InspectionUploadUiValue {
  const coordinator = useContext(InspectionUploadCoordinatorContext);
  if (!coordinator) {
    throw new Error(
      "large-image-ingest React UI components must be rendered inside InspectionUploadProvider."
    );
  }
  return useSyncExternalStore(coordinator.subscribe, coordinator.getValue, coordinator.getValue);
}
