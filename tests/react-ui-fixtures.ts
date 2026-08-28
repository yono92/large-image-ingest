import { createManifest } from "../src/manifest";
import type { IngestController, IngestControllerState } from "../src/react-controller";
import type { IngestManifest } from "../src/types";

export class FakeController implements IngestController {
  private readonly listeners = new Set<() => void>();
  private state: IngestControllerState;
  private manifest: IngestManifest | undefined;

  constructor(private readonly file: File) {
    this.state = { status: "idle", uploadedBytes: 0, totalBytes: file.size, progress: 0 };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): IngestControllerState => this.state;

  start = async (): Promise<IngestManifest> => {
    this.manifest ??= await createManifest(this.file, { checksum: false });
    this.setState({
      status: "completed",
      uploadedBytes: this.file.size,
      totalBytes: this.file.size,
      progress: 1,
      manifest: this.manifest
    });
    return this.manifest;
  };

  resume = async (_recordId: string): Promise<IngestManifest> => this.start();
  pause = (): void => this.setState({ ...this.state, status: "paused" });
  cancel = async (): Promise<void> => this.setState({ ...this.state, status: "canceled" });

  setState(state: IngestControllerState): void {
    this.state = state;
    for (const listener of this.listeners) listener();
  }

  fail(error: unknown): void {
    this.setState({ ...this.state, status: "failed", error });
  }
}
