import type { RetryDecisionContext, RetryPolicy } from "./types.js";

export interface NormalizedRetryPolicy {
  maxAttempts: number;
  delayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: "none" | "full";
  isRetryable?: RetryPolicy["isRetryable"];
}

export function normalizeRetryPolicy(
  policy: RetryPolicy | undefined,
  legacyRetries: number | undefined
): NormalizedRetryPolicy {
  const maxAttempts = policy?.maxAttempts ?? (legacyRetries ?? 2) + 1;
  assertRetryInteger(maxAttempts, "retryPolicy.maxAttempts", 1);

  const delayMs = policy?.delayMs ?? 0;
  assertRetryNumber(delayMs, "retryPolicy.delayMs");

  const backoffFactor = policy?.backoffFactor ?? 1;
  assertRetryNumber(backoffFactor, "retryPolicy.backoffFactor");
  if (backoffFactor < 1) {
    throw new RangeError("retryPolicy.backoffFactor must be at least 1.");
  }

  const maxDelayMs = policy?.maxDelayMs ?? Number.MAX_SAFE_INTEGER;
  assertRetryNumber(maxDelayMs, "retryPolicy.maxDelayMs");

  return {
    maxAttempts,
    delayMs,
    backoffFactor,
    maxDelayMs,
    jitter: policy?.jitter ?? "none",
    isRetryable: policy?.isRetryable
  };
}

export function shouldRetry(
  error: unknown,
  policy: NormalizedRetryPolicy,
  context: RetryDecisionContext
): boolean {
  if (policy.isRetryable) {
    return policy.isRetryable(error, context);
  }

  return true;
}

export function calculateRetryDelay(policy: NormalizedRetryPolicy, retryNumber: number): number {
  const baseDelay = policy.delayMs * Math.pow(policy.backoffFactor, Math.max(0, retryNumber - 1));
  const capped = Math.min(baseDelay, policy.maxDelayMs);

  if (policy.jitter === "full" && capped > 0) {
    return Math.floor(Math.random() * capped);
  }

  return capped;
}

export function assertRetryInteger(value: number, name: string, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new RangeError(`${name} must be a safe integer greater than or equal to ${min}.`);
  }
}

export function assertRetryNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative finite number.`);
  }
}
