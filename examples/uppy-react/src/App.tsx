import React, { useCallback, useEffect, useMemo, useState } from "react";
import Uppy from "@uppy/core";
import {
  WebStorageResumeStore,
  isLargeImageIngestError,
  listRecoverableResumeRecords,
  type ResumeRecord
} from "large-image-ingest/core";
import {
  IngestProvider,
  createIngestController,
  useIngestSession,
  useUploadControls,
  useUploadProgress,
  type IngestController
} from "large-image-ingest/react";
import { UppySelection } from "./UppySelection";
import {
  createLocalReferenceTransport,
  type LocalReferenceStatus
} from "../../reference-local/local-reference-transport";
import {
  findCompatibleResumeRecord,
  type RemovalPolicy,
  type SelectedSource,
  type SelectionResult
} from "./selection-bridge";

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024 * 1024;

export function App() {
  const [uppy] = useState(() => new Uppy({
    id: "large-image-ingest-uppy-ui",
    autoProceed: false,
    allowMultipleUploadBatches: false,
    restrictions: {
      maxNumberOfFiles: 1,
      maxFileSize: MAX_BYTES,
      allowedFileTypes: [".tif", ".tiff", ".png", ".jpg", ".jpeg"]
    }
  }));
  const [selected, setSelected] = useState<SelectedSource>();
  const [controller, setController] = useState<IngestController>();
  const [recoverable, setRecoverable] = useState<ResumeRecord>();
  const [selectionMessage, setSelectionMessage] = useState<string>();
  const [controllerStatus, setControllerStatus] = useState<ReturnType<IngestController["getState"]>["status"]>("idle");
  const resumeStore = useMemo(() => new WebStorageResumeStore(localStorage), []);
  const transport = useMemo(() => createLocalReferenceTransport(), []);

  useEffect(() => () => uppy.destroy(), [uppy]);

  useEffect(() => {
    if (!selected) {
      setController(undefined);
      setRecoverable(undefined);
      setControllerStatus("idle");
      return;
    }

    const nextController = createIngestController(selected.file, {
      chunking: { chunkSize: CHUNK_SIZE },
      metadata: { example: "uppy-ui-only" },
      resume: { store: resumeStore, cleanup: "mark-complete" },
      transport,
      validation: {
        acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
        acceptedMimeTypes: ["", "image/tiff", "image/png", "image/jpeg", "application/octet-stream"],
        maxBytes: MAX_BYTES
      }
    });
    setController(nextController);
    setControllerStatus(nextController.getState().status);
    const unsubscribe = nextController.subscribe(() => {
      setControllerStatus(nextController.getState().status);
    });

    let disposed = false;
    void resumeStore.list().then(async (records) => {
      const recoveryCandidates = listRecoverableResumeRecords(records);
      const compatible = await findCompatibleResumeRecord(
        recoveryCandidates,
        selected.file,
        { chunkSize: CHUNK_SIZE }
      );
      if (!disposed) {
        setRecoverable(compatible);
        if (!compatible && recoveryCandidates.length > 0) {
          setSelectionMessage(
            "Recovery mismatch: the selected file does not match the stored recoverable source."
          );
        }
      }
    }).catch(() => {
      if (!disposed) {
        setSelectionMessage("Stored recovery state could not be read safely.");
      }
    });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, [resumeStore, selected, transport]);

  const handleSelected = useCallback((source: SelectedSource) => {
    setSelectionMessage(undefined);
    setSelected(source);
  }, []);

  const handleSelectionError = useCallback((result: Extract<SelectionResult, { ok: false }>) => {
    setSelectionMessage(
      result.code === "selection.remote_unsupported"
        ? "This recipe accepts local browser files only."
        : "The selected source bytes are unavailable."
    );
  }, []);

  const handleRemoved = useCallback((policy: RemovalPolicy) => {
    if (policy === "cancel-first" && controller) {
      void controller.cancel("Source removed from Uppy.").finally(() => setSelected(undefined));
      return;
    }
    setSelected(undefined);
  }, [controller]);

  return (
    <main className="page-shell">
      <header className="hero">
        <p className="eyebrow">large-image-ingest × Uppy</p>
        <h1>Uppy selects. The integrity pipeline uploads.</h1>
        <p>
          This reference keeps one source of truth for validation, checksum, resume,
          transport state, and final verification.
        </p>
      </header>

      <section className="card" aria-labelledby="selection-title">
        <div className="section-heading">
          <span>1</span>
          <div>
            <h2 id="selection-title">Select one local inspection image</h2>
            <p>No Uppy uploader, preprocessor, remote provider, or image editor is configured.</p>
          </div>
        </div>
        <UppySelection
          uppy={uppy}
          status={controllerStatus}
          hasRecoverableRecord={Boolean(recoverable)}
          onSelected={handleSelected}
          onRemoved={handleRemoved}
          onSelectionError={handleSelectionError}
        />
        {selectionMessage ? <p className="message error" role="alert">{selectionMessage}</p> : null}
      </section>

      <section className="card" aria-labelledby="ingest-title">
        <div className="section-heading">
          <span>2</span>
          <div>
            <h2 id="ingest-title">Run the authoritative ingest</h2>
            <p>Progress advances when the local target acknowledges complete chunks.</p>
          </div>
        </div>
        {controller ? (
          <IngestProvider controller={controller}>
            <IngestPanel recoverable={recoverable} transport={transport} />
          </IngestProvider>
        ) : (
          <p className="empty-state">Select a file to create one ingest controller.</p>
        )}
      </section>

      <aside className="ownership-note">
        <strong>Ownership boundary</strong>
        <span>Uppy: selection UI</span>
        <span>large-image-ingest: every transfer and integrity state</span>
      </aside>
    </main>
  );
}

function IngestPanel({
  recoverable,
  transport
}: {
  recoverable: ResumeRecord | undefined;
  transport: ReturnType<typeof createLocalReferenceTransport>;
}) {
  const state = useIngestSession();
  const controls = useUploadControls();
  const progress = useUploadProgress();
  const [verification, setVerification] = useState<LocalReferenceStatus>();
  const [verificationError, setVerificationError] = useState<string>();

  useEffect(() => {
    const uploadId = state.snapshot?.transportSession?.uploadId;
    if (state.status !== "completed" || !uploadId) {
      return;
    }
    let disposed = false;
    setVerificationError(undefined);
    void transport.readStatus(uploadId).then((status) => {
      if (!disposed) {
        setVerification(status);
      }
    }).catch(() => {
      if (!disposed) {
        setVerificationError("Stored-file verification status could not be read.");
      }
    });
    return () => {
      disposed = true;
    };
  }, [state.snapshot?.transportSession?.uploadId, state.status, transport]);

  const visibleError = state.status === "paused" || state.status === "canceled"
    ? undefined
    : toSafeError(state.error);
  const resumeRecord = recoverable?.id ?? state.recordId;

  return (
    <div className="ingest-panel">
      <dl className="status-grid">
        <div><dt>Status</dt><dd>{state.status}</dd></div>
        <div><dt>Uploaded</dt><dd>{formatBytes(progress.uploadedBytes)} / {formatBytes(progress.totalBytes)}</dd></div>
        <div><dt>Resume</dt><dd>{resumeRecord ? "available" : "not yet checkpointed"}</dd></div>
        <div><dt>Verification</dt><dd>{verification?.verification ?? "pending"}</dd></div>
      </dl>

      <progress aria-label="Acknowledged upload progress" value={progress.progress} max={1} />

      <div className="controls">
        <button type="button" onClick={() => void controls.start().catch(() => {})} disabled={!controls.canStart}>
          Start ingest
        </button>
        <button type="button" onClick={() => controls.pause("Paused from the example UI.")} disabled={!controls.canPause}>
          Pause
        </button>
        <button
          type="button"
          onClick={() => resumeRecord && void controls.resume(resumeRecord).catch(() => {})}
          disabled={!resumeRecord || !["idle", "paused", "failed"].includes(state.status)}
        >
          Resume
        </button>
        <button className="danger" type="button" onClick={() => void controls.cancel("Canceled from the example UI.")} disabled={!controls.canCancel}>
          Cancel
        </button>
      </div>

      {recoverable && state.status === "idle" ? (
        <p className="message info">A compatible checkpoint was found after same-file reselection.</p>
      ) : null}
      {visibleError ? <p className="message error" role="alert">{visibleError}</p> : null}
      {state.observerFailure ? <p className="message warning">A UI observer failed; ingest control remained isolated.</p> : null}
      {verification?.verification === "verified" ? (
        <p className="message success" role="status">
          Stored original verified. Duplicate accepted bytes: {verification.duplicateBytes}.
        </p>
      ) : null}
      {verificationError ? <p className="message error" role="alert">{verificationError}</p> : null}
    </div>
  );
}

function toSafeError(error: unknown): string | undefined {
  if (!error) {
    return undefined;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    error.message === "Cannot start upload because validation failed."
  ) {
    return "Validation failed: the selected file does not satisfy the ingest policy.";
  }
  if (isLargeImageIngestError(error)) {
    return `${error.code}: ${error.message}`;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return `${error.code}: ${error.message}`;
  }
  return "The ingest operation failed. Inspect the safe status code and retry or cancel.";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}
