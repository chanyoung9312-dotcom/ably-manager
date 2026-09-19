export const VALIDATION_POLICY_VERSION = "sourcing-validation-v1";

export const DEFAULT_VALIDATION_POLICY = Object.freeze({
  version: VALIDATION_POLICY_VERSION,
  enableEvidenceStrong: true,
  enableWeakObservedSignal: false,
});

const allTrue = (gates) =>
  gates &&
  Object.values(gates).length > 0 &&
  Object.values(gates).every(Boolean);

function resolveGroup(group, policy) {
  const observedState = group?.primaryState || "insufficient_data";
  const strong = group?.promotion?.evidence_strong || null;
  const strongEligible = Boolean(
    policy.enableEvidenceStrong &&
      group?.validationStatus === "validated" &&
      observedState === "exploration_signal" &&
      strong &&
      allTrue(strong.gates),
  );

  if (strongEligible) {
    return {
      groupId: group.id,
      observedState,
      resolvedState: "evidence_strong",
      validationStatus: group.validationStatus,
      promoted: true,
      reasonCodes: ["VALIDATED_STRONG_GATES_MET"],
      unmetStrongGates: [],
    };
  }

  const unmetStrongGates = strong?.gates
    ? Object.keys(strong.gates).filter((key) => !strong.gates[key])
    : [];

  return {
    groupId: group.id,
    observedState,
    resolvedState: observedState,
    validationStatus: group?.validationStatus || "blocked",
    promoted: false,
    reasonCodes: [
      ...(group?.validationStatus !== "validated"
        ? ["VALIDATION_NOT_COMPLETE"]
        : []),
      ...(observedState !== "exploration_signal"
        ? ["OBSERVED_STATE_NOT_PROMOTABLE"]
        : []),
      ...(strong && !allTrue(strong.gates)
        ? ["STRONG_GATES_UNMET"]
        : []),
    ],
    unmetStrongGates,
  };
}

/**
 * Resolve validated sourcing states without changing the observation engine.
 *
 * evidence_strong may activate only when:
 * - the group is fully validated,
 * - its observed state is exploration_signal,
 * - every pre-existing strong gate from sourcing-signals is true.
 *
 * weak_observed_signal remains disabled because no validated exposure/test
 * protocol has been approved yet.
 */
export function resolveSourcingValidation({
  diagnostics,
  policy = DEFAULT_VALIDATION_POLICY,
} = {}) {
  if (!diagnostics || !Array.isArray(diagnostics.groups))
    throw new TypeError("INVALID_VALIDATION_INPUT");
  if (policy?.version !== VALIDATION_POLICY_VERSION)
    throw new TypeError("VALIDATION_POLICY_VERSION_REQUIRED");
  if (policy.enableWeakObservedSignal)
    throw new TypeError("WEAK_PROTOCOL_NOT_DEFINED");

  const groups = diagnostics.groups.map((group) => resolveGroup(group, policy));
  const promotedStrong = groups.filter(
    (group) => group.resolvedState === "evidence_strong",
  ).length;

  return {
    policyVersion: VALIDATION_POLICY_VERSION,
    groups,
    counts: {
      evidenceStrong: promotedStrong,
      weakObservedSignal: 0,
    },
    weakObservedSignal: {
      enabled: false,
      reason: "WEAK_PROTOCOL_NOT_DEFINED",
      detail:
        "충분한 노출·테스트가 확인된 모집단에서 약한 반응을 정의하는 사전 기준이 아직 없습니다.",
    },
    rules: {
      changesObservationMetrics: false,
      changesCandidateLane: false,
      weakStateEnabled: false,
      scoreUsed: false,
    },
  };
}
