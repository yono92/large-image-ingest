import { useEffect, useRef, type ReactElement } from "react";
import { InspectionUploadCoordinator } from "./coordinator.js";
import { InspectionUploadCoordinatorContext } from "./context.js";
import type { InspectionUploadProviderProps } from "./types.js";

export function InspectionUploadProvider({
  children,
  ...configuration
}: InspectionUploadProviderProps): ReactElement {
  const coordinatorRef = useRef<InspectionUploadCoordinator | null>(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = new InspectionUploadCoordinator(configuration);
  }
  const coordinator = coordinatorRef.current;

  useEffect(() => {
    void coordinator.refreshRecovery();
    return () => coordinator.dispose();
  }, [coordinator]);

  return (
    <InspectionUploadCoordinatorContext.Provider value={coordinator}>
      {children}
    </InspectionUploadCoordinatorContext.Provider>
  );
}
