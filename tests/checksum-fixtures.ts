import type { IngestFileLike } from "../src/types";

export class CountingFile extends Blob implements IngestFileLike {
  readonly name: string;
  readonly lastModified: number;
  arrayBufferReads = 0;
  maxReadBytes = 0;

  constructor(bytes: BlobPart[], name = "counting.bin", options: BlobPropertyBag = {}) {
    super(bytes, options);
    this.name = name;
    this.lastModified = Date.UTC(2026, 0, 1);
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    const sliced = super.slice(start, end, contentType);
    const read = sliced.arrayBuffer.bind(sliced);
    Object.defineProperty(sliced, "arrayBuffer", {
      value: async () => {
        this.arrayBufferReads += 1;
        this.maxReadBytes = Math.max(this.maxReadBytes, sliced.size);
        return read();
      }
    });
    return sliced;
  }
}
