const { ReferenceTarget, changedMetadataEqualSource, createSource } = require("./reference-target.cjs");
const { SCENARIOS, inspectSafeValue } = require("./protocol.cjs");

async function runHappyPath(candidate, sdk) {
  const target = new ReferenceTarget();
  const source = createSource();
  const controller = candidate.createController({ sdk, target });
  let errorCode;
  try { await controller.start(source); }
  catch (error) { errorCode = safeCode(error); }
  const verified = !errorCode && await controller.verify(source);
  return {
    status: verified ? "eligible" : "incomplete",
    expectedSizeBytes: source.bytes.byteLength,
    expectedSha256: source.checksum,
    storedSizeBytes: target.stored?.byteLength ?? 0,
    storedSha256Match: verified,
    errorCode
  };
}

async function runScenario(candidate, scenario, trialIndex, sdk) {
  const target = new ReferenceTarget();
  const source = createSource();
  const controller = candidate.createController({ sdk, target });
  let detected = false;
  let preMutationRejected = false;
  let recoveryAction = "none";
  let finalApplicationStatus = "failed";
  let storedVerification = "not_meaningful";
  let remoteMutationCountBeforeAuthority = 0;
  let rejectionMutationBaseline;
  const limitationCodes = [];

  async function partial() {
    target.setScenario("persistent-interruption");
    await controller.start(source).catch(() => undefined);
    target.setScenario("happy-path");
    controller.clearSafeOutput();
  }

  try {
    switch (scenario.id) {
      case "failure-before-acknowledgement":
      case "failure-after-acknowledgement":
      case "lost-acknowledgement-response": {
        target.setScenario(scenario.id);
        await controller.start(source);
        recoveryAction = scenario.invariant;
        finalApplicationStatus = "completed";
        storedVerification = await controller.verify(source) ? "verified" : "failed";
        detected = true;
        break;
      }
      case "metadata-equal-source-mismatch": {
        await partial();
        const before = target.remoteMutationCount;
        rejectionMutationBaseline = before;
        await controller.resume(changedMetadataEqualSource());
        remoteMutationCountBeforeAuthority = target.remoteMutationCount - before;
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      case "stale-recovery-state": {
        await partial();
        target.invalidate();
        const before = target.remoteMutationCount;
        rejectionMutationBaseline = before;
        await controller.resume(source);
        remoteMutationCountBeforeAuthority = target.remoteMutationCount - before;
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      case "remote-behind-state": {
        await partial();
        target.removeChunk(0);
        const before = target.remoteMutationCount;
        rejectionMutationBaseline = before;
        await controller.resume(source);
        remoteMutationCountBeforeAuthority = target.remoteMutationCount - before;
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      case "remote-ahead-state": {
        await partial();
        target.seedChunk(1, controller.chunks(source)[1].bytes);
        await controller.resume(source);
        recoveryAction = scenario.invariant;
        finalApplicationStatus = "completed";
        storedVerification = await controller.verify(source) ? "verified" : "failed";
        detected = true;
        break;
      }
      case "expired-session": {
        await partial();
        target.setExpired();
        const before = target.remoteMutationCount;
        rejectionMutationBaseline = before;
        await controller.resume(source);
        remoteMutationCountBeforeAuthority = target.remoteMutationCount - before;
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      case "missing-receipt":
      case "duplicate-receipt": {
        await partial();
        await controller.tamperRecord(scenario.id === "missing-receipt" ? "missing" : "duplicate");
        const before = target.remoteMutationCount;
        rejectionMutationBaseline = before;
        await controller.resume(source);
        remoteMutationCountBeforeAuthority = target.remoteMutationCount - before;
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      case "lost-completion-response": {
        target.setScenario(scenario.id);
        await controller.start(source);
        recoveryAction = scenario.invariant;
        finalApplicationStatus = "completed";
        storedVerification = await controller.verify(source) ? "verified" : "failed";
        detected = true;
        break;
      }
      case "stored-byte-corruption": {
        await controller.start(source);
        target.corrupt();
        const verified = await controller.verify(source);
        detected = !verified;
        recoveryAction = scenario.invariant;
        finalApplicationStatus = verified ? "unsafe_completed" : "verification_failed";
        storedVerification = verified ? "verified" : "failed";
        break;
      }
      case "cleanup-failure-after-completion": {
        controller.setCleanupFailure(true);
        await controller.start(source);
        const warning = controller.safeOutput().some((entry) => entry.code === "resume.store_failed");
        detected = warning;
        recoveryAction = scenario.invariant;
        finalApplicationStatus = warning ? "completed_with_warning" : "completed";
        storedVerification = await controller.verify(source) ? "verified" : "failed";
        break;
      }
      case "sensitive-provider-error": {
        target.setScenario(scenario.id);
        await controller.start(source);
        finalApplicationStatus = "unsafe_completed";
        break;
      }
      default:
        limitationCodes.push("scenario.unsupported");
    }
  } catch (error) {
    if (rejectionMutationBaseline !== undefined) {
      remoteMutationCountBeforeAuthority = target.remoteMutationCount - rejectionMutationBaseline;
    }
    detected = true;
    finalApplicationStatus = "rejected";
    recoveryAction = scenario.invariant;
    if (["metadata-equal-source-mismatch", "stale-recovery-state", "remote-behind-state", "expired-session", "missing-receipt", "duplicate-receipt"].includes(scenario.id)) {
      preMutationRejected = true;
    }
    if (!controller.safeOutput().length) limitationCodes.push(safeCode(error));
  }

  const safeOutput = inspectSafeValue(controller.safeOutput()).safe ? "safe" : "unsafe";
  const invariantSatisfied = evaluateInvariant({
    scenarioId: scenario.id, detected, preMutationRejected, recoveryAction,
    acknowledgedBytesRetransmitted: target.acknowledgedBytesRetransmitted,
    finalApplicationStatus, storedVerification, remoteMutationCountBeforeAuthority,
    safeOutput, authoritativeCompletionCount: target.authoritativeCompletionCount
  });
  return {
    trialIndex,
    status: invariantSatisfied && safeOutput === "safe" ? "safe_pass" : "failed",
    detected,
    preMutationRejected,
    recoveryAction,
    acknowledgedBytesRetransmitted: target.acknowledgedBytesRetransmitted,
    completionCallCount: target.completionCallCount,
    finalApplicationStatus,
    storedVerification,
    remoteMutationCountBeforeAuthority,
    safeOutput,
    invariantSatisfied,
    limitationCodes
  };
}

function evaluateInvariant(result) {
  if (["failure-before-acknowledgement", "failure-after-acknowledgement", "lost-acknowledgement-response", "remote-ahead-state", "lost-completion-response"].includes(result.scenarioId)) {
    return result.finalApplicationStatus === "completed" && result.storedVerification === "verified" && result.acknowledgedBytesRetransmitted === 0 && result.authoritativeCompletionCount === 1;
  }
  if (["metadata-equal-source-mismatch", "stale-recovery-state", "remote-behind-state", "expired-session", "missing-receipt", "duplicate-receipt"].includes(result.scenarioId)) {
    return result.detected && result.preMutationRejected && result.remoteMutationCountBeforeAuthority === 0 && result.finalApplicationStatus === "rejected";
  }
  if (result.scenarioId === "stored-byte-corruption") return result.detected && result.storedVerification === "failed" && result.finalApplicationStatus === "verification_failed";
  if (result.scenarioId === "cleanup-failure-after-completion") return result.detected && result.finalApplicationStatus === "completed_with_warning" && result.storedVerification === "verified";
  if (result.scenarioId === "sensitive-provider-error") return result.detected && result.finalApplicationStatus === "rejected" && result.safeOutput === "safe";
  return false;
}

async function runAllScenarios(candidate, sdk) {
  const results = [];
  for (const scenario of SCENARIOS) {
    const trials = [];
    for (let trial = 1; trial <= scenario.trials; trial += 1) trials.push(await runScenario(candidate, scenario, trial, sdk));
    results.push({
      scenarioId: scenario.id,
      timingSensitive: scenario.timingSensitive,
      invariant: scenario.invariant,
      status: trials.every((entry) => entry.status === "safe_pass") ? "safe_pass" : "failed",
      trials
    });
  }
  return results;
}

function safeCode(error) {
  return typeof error?.code === "string" ? error.code : "operation.failed";
}

module.exports = { evaluateInvariant, runAllScenarios, runHappyPath, runScenario };
