import {
  installChecksumWorkerRuntime,
  type ChecksumWorkerRuntimeScope
} from "large-image-ingest/core";

installChecksumWorkerRuntime(self as unknown as ChecksumWorkerRuntimeScope);
