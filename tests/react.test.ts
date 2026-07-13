import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it } from "vitest";
import {
  IngestProvider,
  createIngestController,
  useIngestSession,
  useUploadControls,
  useUploadProgress,
  type UploadControls,
  type UploadProgressState
} from "../src/react";
import type { IngestControllerState } from "../src/react-controller";
import type { TransportSession, UploadChunkReceipt, UploadTransport } from "../src/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("React headless hooks", () => {
  it("shares controller state, progress, and actions through one provider", async () => {
    const controller = createIngestController(createFile(), {
      chunking: { chunkSize: 256 * 1024 },
      transport: createTransport()
    });
    let state: IngestControllerState | undefined;
    let progress: UploadProgressState | undefined;
    let controls: UploadControls | undefined;
    let renders = 0;
    function Consumer() {
      state = useIngestSession();
      progress = useUploadProgress();
      controls = useUploadControls();
      renders += 1;
      return null;
    }
    let renderer: ReactTestRenderer | undefined;
    await act(async () => {
      renderer = create(createElement(
        IngestProvider,
        { controller },
        createElement(Consumer)
      ));
    });

    expect(state?.status).toBe("idle");
    expect(controls?.canStart).toBe(true);
    await act(async () => {
      await controls?.start();
    });

    expect(state?.status).toBe("completed");
    expect(progress).toMatchObject({ progress: 1 });
    expect(controls).toMatchObject({ canStart: true, canPause: false, canCancel: false });
    const rendersBeforeUnmount = renders;
    await act(async () => {
      renderer?.unmount();
    });
    await controller.start();
    expect(renders).toBe(rendersBeforeUnmount);
  });

  it("supports an idle server snapshot", () => {
    const controller = createIngestController(createFile(), {
      transport: createTransport()
    });
    function Status() {
      return createElement("span", null, useIngestSession().status);
    }

    const html = renderToString(createElement(
      IngestProvider,
      { controller },
      createElement(Status)
    ));

    expect(html).toContain("idle");
  });

  it("fails clearly when hooks are used outside the provider", () => {
    function MissingProvider() {
      useIngestSession();
      return null;
    }

    expect(() => renderToString(createElement(MissingProvider))).toThrow(
      "large-image-ingest React hooks must be used inside IngestProvider."
    );
  });
});

function createFile(): File {
  return new File([new Uint8Array(600 * 1024)], "wafer.tif", { type: "image/tiff" });
}

function createTransport(): UploadTransport {
  return {
    async createSession(): Promise<TransportSession> {
      return {
        uploadId: "react-hook-upload",
        transportName: "react-hook-fake",
        createdAt: "2026-01-01T00:00:00.000Z"
      };
    },
    async uploadChunk({ chunk, body }): Promise<UploadChunkReceipt> {
      return {
        chunkIndex: chunk.index,
        sizeBytes: body.size,
        completedAt: "2026-01-01T00:00:00.000Z",
        transport: { name: "react-hook-fake" }
      };
    },
    async completeSession(): Promise<void> {}
  };
}
