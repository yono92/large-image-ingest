import React, { useEffect } from "react";
import type Uppy from "@uppy/core";
import { Dropzone, FilesList, UppyContextProvider, useUppyState } from "@uppy/react";
import type { ReactIngestStatus } from "large-image-ingest/react";
import {
  getRemovalPolicy,
  toSelectedSource,
  type SelectedSource,
  type SelectionResult
} from "./selection-bridge";

export interface UppySelectionProps {
  uppy: Uppy;
  status: ReactIngestStatus;
  hasRecoverableRecord: boolean;
  onSelected(source: SelectedSource): void;
  onRemoved(policy: ReturnType<typeof getRemovalPolicy>): void;
  onSelectionError(result: Extract<SelectionResult, { ok: false }>): void;
}

export function UppySelection({
  uppy,
  status,
  hasRecoverableRecord,
  onSelected,
  onRemoved,
  onSelectionError
}: UppySelectionProps) {
  const fileCount = useUppyState(uppy, (state) => Object.keys(state.files).length);
  const removalPolicy = getRemovalPolicy(status, hasRecoverableRecord);
  const selectionLocked = removalPolicy === "cancel-first";

  useEffect(() => {
    const handleAdded = (uppyFile: Parameters<Parameters<typeof uppy.on<"file-added">>[1]>[0]) => {
      const result = toSelectedSource(uppyFile);
      if (result.ok) {
        onSelected(result.source);
        return;
      }

      uppy.removeFile(uppyFile.id);
      onSelectionError(result);
    };
    const handleRemoved = () => onRemoved(removalPolicy);

    uppy.on("file-added", handleAdded);
    uppy.on("file-removed", handleRemoved);
    return () => {
      uppy.off("file-added", handleAdded);
      uppy.off("file-removed", handleRemoved);
    };
  }, [onRemoved, onSelected, onSelectionError, removalPolicy, uppy]);

  return (
    <UppyContextProvider uppy={uppy}>
      <div aria-label="Uppy local file selection" className="selection-shell">
        {fileCount === 0 ? (
          <Dropzone
            width="100%"
            height="190px"
            note="One local TIFF, PNG, or JPEG. Uppy selects; large-image-ingest uploads."
            noClick={selectionLocked}
          />
        ) : selectionLocked ? (
          <p className="selection-locked" role="status">
            Selection is locked while large-image-ingest owns the active operation.
          </p>
        ) : (
          <FilesList imageThumbnail={false} />
        )}
      </div>
    </UppyContextProvider>
  );
}
