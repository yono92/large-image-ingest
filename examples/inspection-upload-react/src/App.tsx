import { useCallback, useMemo, useRef, useState } from "react";
import { WebStorageResumeStore, type IngestManifest } from "large-image-ingest/core";
import { createBrowserWorkerChecksumExecutor } from "large-image-ingest/browser";
import { createIngestController } from "large-image-ingest/react";
import {
  InspectionErrorNotice,
  InspectionFileDropzone,
  InspectionRecoveryPrompt,
  InspectionSourceCard,
  InspectionUploadControls,
  InspectionUploadPanel,
  InspectionUploadProgress,
  InspectionUploadProvider,
  InspectionVerificationStatus,
  type CompletionVerificationAdapter
} from "large-image-ingest/react-ui";
import { createLocalReferenceTransport } from "../../reference-local/local-reference-transport";

const CHUNK_SIZE = 4 * 1024 * 1024;
const MAX_BYTES = 10 * 1024 * 1024 * 1024;

export function App() {
  const [composed, setComposed] = useState(false);
  const resumeStore = useMemo(() => new WebStorageResumeStore(localStorage), []);
  const checksumExecutor = useMemo(() => createBrowserWorkerChecksumExecutor(), []);
  const transport = useMemo(() => createLocalReferenceTransport(), []);
  const uploadIds = useRef(new Map<string, string>());
  const createController = useCallback((file: File) => createIngestController(file, {
    checksum: { executor: checksumExecutor, fallback: "inline" },
    chunking: { chunkSize: CHUNK_SIZE },
    metadata: { example: "first-party-inspection-ui" },
    resume: { store: resumeStore, cleanup: "mark-complete" },
    transport,
    validation: {
      acceptedExtensions: ["tif", "tiff", "png", "jpg", "jpeg"],
      acceptedMimeTypes: ["", "image/tiff", "image/png", "image/jpeg", "application/octet-stream"],
      maxBytes: MAX_BYTES
    },
    onEvent(event) {
      if (event.type === "started") uploadIds.current.set(event.manifest.id, event.uploadId);
    },
    onSnapshot(snapshot) {
      const uploadId = snapshot.transportSession?.uploadId;
      if (uploadId) uploadIds.current.set(snapshot.manifestId, uploadId);
    }
  }), [checksumExecutor, resumeStore, transport]);
  const verifier = useMemo<CompletionVerificationAdapter>(() => ({
    async verify(manifest: IngestManifest) {
      const uploadId = uploadIds.current.get(manifest.id);
      if (!uploadId) return { status: "unavailable", retryable: true };
      const status = await transport.readStatus(uploadId);
      return status.verification === "verified"
        ? { status: "verified", checkedAt: new Date().toISOString() }
        : { status: "failed", retryable: true, issues: [{ code: "verification.original_mismatch", severity: "error" }] };
    }
  }), [transport]);
  const configuration = {
    createController,
    recovery: {
      store: resumeStore,
      chunking: { chunkSize: CHUNK_SIZE },
      capabilities: transport.capabilities!,
      sourceIdentity: { executor: checksumExecutor, fallback: "inline" }
    },
    verifier
  } as const;

  return (
    <main className="example-shell">
      <nav className="example-nav" aria-label="Reference layout">
        <button type="button" onClick={() => setComposed(false)} aria-pressed={!composed}>Default panel</button>
        <button type="button" onClick={() => setComposed(true)} aria-pressed={composed}>Composed theme</button>
      </nav>
      {composed ? (
        <InspectionUploadProvider {...configuration}>
          <article className="lii-panel example-composed">
            <header><p className="eyebrow">FAB INTAKE / LOCAL REFERENCE</p><h1>Original evidence transfer</h1></header>
            <InspectionErrorNotice />
            <InspectionFileDropzone accept=".tif,.tiff,.png,.jpg,.jpeg" guidance="The exact local File remains the source of record." />
            <div className="lii-grid">
              <InspectionSourceCard />
              <InspectionUploadProgress />
              <InspectionUploadControls />
              <InspectionRecoveryPrompt />
              <InspectionVerificationStatus />
            </div>
          </article>
        </InspectionUploadProvider>
      ) : (
        <InspectionUploadPanel
          {...configuration}
          accept=".tif,.tiff,.png,.jpg,.jpeg"
          slots={{ selectionGuidance: "No credentials or cloud account are required." }}
        />
      )}
    </main>
  );
}
