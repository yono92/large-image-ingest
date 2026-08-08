import { describe, expect, it } from "vitest";
import { createIngestQueue } from "../src/queue";
import type { IngestQueueEvent } from "../src/types";
import { GateTransport, MemoryQueueStore, createQueueFile, waitFor } from "./queue-fixtures";

describe("production ingest queue", () => {
  it("admits in FIFO order within item and byte limits without bypassing a blocked head", async () => {
    const starts: string[] = [];
    const transports = new Map<string, GateTransport>();
    const queue = createIngestQueue({
      maxActiveItems: 2,
      maxActiveBytes: 6,
      createSessionOptions({ itemId }) {
        const transport = new GateTransport(itemId, starts);
        transports.set(itemId, transport);
        return { checksum: false, transport };
      }
    });

    await queue.enqueue(createQueueFile("a.tif", 4), { id: "a" });
    await queue.enqueue(createQueueFile("b.tif", 4), { id: "b" });
    await queue.enqueue(createQueueFile("c.tif", 2), { id: "c" });
    const drained = queue.start();

    await waitFor(() => starts.length === 1);
    expect(starts).toEqual(["a"]);
    expect(queue.getSnapshot()).toMatchObject({ activeItems: 1, activeBytes: 4 });

    transports.get("a")?.releaseAll();
    await waitFor(() => starts.length === 3);
    expect(starts).toEqual(["a", "b", "c"]);
    expect(queue.getSnapshot()).toMatchObject({ activeItems: 2, activeBytes: 6 });

    transports.get("b")?.releaseAll();
    transports.get("c")?.releaseAll();
    await expect(drained).resolves.toMatchObject({ status: "drained", counts: { completed: 3 } });
  });

  it("admits one oversized item without deadlock and enforces queue capacity", async () => {
    const starts: string[] = [];
    const transports = new Map<string, GateTransport>();
    const queue = createIngestQueue({
      maxActiveBytes: 5,
      maxQueuedItems: 2,
      createSessionOptions({ itemId }) {
        const transport = new GateTransport(itemId, starts);
        transports.set(itemId, transport);
        return { checksum: false, transport };
      }
    });

    await queue.enqueue(createQueueFile("large.tif", 10), { id: "large" });
    await queue.enqueue(createQueueFile("small.tif", 1), { id: "small" });
    await expect(queue.enqueue(createQueueFile("extra.tif", 1), { id: "extra" }))
      .rejects.toMatchObject({ code: "queue.capacity_exceeded" });

    const drained = queue.start();
    await waitFor(() => starts.length === 1);
    expect(starts).toEqual(["large"]);
    expect(queue.getSnapshot().activeBytes).toBe(10);
    transports.get("large")?.releaseAll();
    await waitFor(() => starts.length === 2);
    transports.get("small")?.releaseAll();
    await drained;
  });

  it("validates policy and duplicate IDs before session construction", async () => {
    for (const options of [
      { maxActiveItems: 0 },
      { maxActiveItems: 33 },
      { maxActiveBytes: 0 },
      { maxQueuedItems: 100_001 }
    ]) {
      expect(() => createIngestQueue({
        ...options,
        createSessionOptions() {
          throw new Error("must not run");
        }
      })).toThrow(expect.objectContaining({ code: "queue.invalid_options" }));
    }

    const queue = createIngestQueue({
      createSessionOptions() {
        throw new Error("must not run");
      }
    });
    await queue.enqueue(createQueueFile("a.tif", 1), { id: "same" });
    await expect(queue.enqueue(createQueueFile("b.tif", 1), { id: "same" }))
      .rejects.toMatchObject({ code: "queue.duplicate_item" });
  });

  it("pauses active work, resumes it through a fresh session, and removes only terminal items", async () => {
    const transports: GateTransport[] = [];
    const events: IngestQueueEvent["type"][] = [];
    const queue = createIngestQueue({
      createSessionOptions({ itemId }) {
        const transport = new GateTransport(itemId);
        transports.push(transport);
        return { checksum: false, transport };
      },
      onEvent(event) {
        events.push(event.type);
      }
    });
    await queue.enqueue(createQueueFile("pause.tif", 4), { id: "pause" });
    const firstRun = queue.start();
    await waitFor(() => transports.length === 1 && transports[0]!.waiting.length === 1);
    await queue.pause();
    await firstRun;
    await waitFor(() => queue.getSnapshot().counts.paused === 1);
    await expect(queue.removeItem("pause")).rejects.toMatchObject({ code: "queue.invalid_transition" });

    const resumed = queue.resume();
    await waitFor(() => transports.length === 2 && transports[1]!.waiting.length === 1);
    transports[1]!.releaseAll();
    await resumed;
    expect(queue.getSnapshot().counts.completed).toBe(1);
    expect(events).toContain("item:paused");
    await queue.removeItem("pause");
    expect(queue.getSnapshot().items).toEqual([]);
  });

  it("retries failed items and cancels pending items deterministically", async () => {
    let attempts = 0;
    const queue = createIngestQueue({
      maxActiveItems: 1,
      createSessionOptions({ itemId }) {
        attempts += 1;
        const transport = new GateTransport(itemId, [], attempts === 1);
        if (attempts > 1) setTimeout(() => transport.releaseAll(), 10);
        return { checksum: false, retries: 0, transport };
      }
    });
    await queue.enqueue(createQueueFile("retry.tif", 2), { id: "retry" });
    await queue.enqueue(createQueueFile("cancel.tif", 2), { id: "cancel" });
    await queue.cancelItem("cancel");
    await queue.start();
    expect(queue.getSnapshot().items.find((item) => item.id === "retry")?.status).toBe("failed");
    await queue.retryItem("retry");
    await queue.start();
    expect(queue.getSnapshot().counts).toMatchObject({ completed: 1, canceled: 1 });
  });

  it("cancels active work without admitting it again", async () => {
    const transport = new GateTransport("active-cancel");
    const queue = createIngestQueue({
      createSessionOptions() {
        return { checksum: false, transport };
      }
    });
    await queue.enqueue(createQueueFile("active-cancel.tif", 2), { id: "active-cancel" });
    const run = queue.start();
    await waitFor(() => transport.waiting.length === 1);
    await queue.cancelItem("active-cancel");
    await run;

    expect(queue.getSnapshot()).toMatchObject({
      status: "drained",
      counts: { canceled: 1 },
      activeItems: 0
    });
    expect(transport.completeCalls).toBe(0);
  });
});
