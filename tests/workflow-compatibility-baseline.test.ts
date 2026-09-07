import { describe, expect, it } from "vitest";
import { createIngestSession } from "../src/session.js";
import { createIngestProvenanceRecorder } from "../src/provenance.js";
import { evaluatePreservationMapping } from "../src/preservation.js";
import { evaluateDomainValidationProfile } from "../src/profiles.js";

describe("verified workflow compatibility baseline", () => {
  it("keeps existing independently usable entry points intact", () => {
    expect(typeof createIngestSession).toBe("function");
    expect(typeof createIngestProvenanceRecorder).toBe("function");
    expect(typeof evaluatePreservationMapping).toBe("function");
    expect(typeof evaluateDomainValidationProfile).toBe("function");
  });
});
