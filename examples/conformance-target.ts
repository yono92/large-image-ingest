import {
  TRANSPORT_CONFORMANCE_CATALOG,
  runTransportConformance,
  type TransportConformanceObservation,
  type TransportConformanceTarget
} from "large-image-ingest/conformance";

export const conformanceTarget: TransportConformanceTarget = {
  profile: {
    profileId: "operator-s3-staging",
    transportCategory: "s3-multipart",
    targetClass: "real-deployment",
    environment: {
      runtime: "node-20",
      os: "linux",
      architecture: "x64"
    },
    configurationCategories: ["dedicated-test-prefix"]
  },
  capabilities: {
    resumable: true,
    snapshotResume: true,
    persistentResume: true,
    abortable: true,
    expirationAware: false,
    parallelChunks: false,
    chunkIntegrity: true
  },
  async runScenario({ scenario, signal }): Promise<TransportConformanceObservation> {
    signal.throwIfAborted();
    throw new Error(`Operator driver must implement safe scenario ${scenario.id}.`);
  }
};

export async function qualifyConfiguredTarget() {
  return runTransportConformance(conformanceTarget);
}

export const conformanceScenarioIds = TRANSPORT_CONFORMANCE_CATALOG.scenarios.map(({ id }) => id);
