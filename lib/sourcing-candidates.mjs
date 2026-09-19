export const CANDIDATE_POLICY_VERSION = "sourcing-candidates-review-v1";

export const DEFAULT_CANDIDATE_POLICY = Object.freeze({
  version: CANDIDATE_POLICY_VERSION,
  review: Object.freeze({
    minReactingProducts: 2,
    minRepeatedDateProducts: 1,
    minRecent30ActiveProducts: 1,
  }),
  hint: Object.freeze({
    minReactingProducts: 2,
    minRepeatedDateProducts: 1,
    minRecent30ActiveProducts: 1,
  }),
});

const ITEM_LEVELS = new Set(["baseType", "secondaryCategory"]);
const LANE_VALUES = new Set([
  "review_candidate",
  "emerging_watch",
  "hit_reference",
  "data_hold",
]);
const HINT_VALUES = new Set([
  "supported_hint",
  "emerging_hint",
  "concentrated_hint",
  "data_hold_hint",
]);

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stableKeys = (group) =>
  Array.isArray(group?.memberKeys) ? [...group.memberKeys].sort() : [];

const memberSignature = (group) => JSON.stringify(stableKeys(group));

const itemPriority = (group) => {
  if (group?.level === "baseType") return 0;
  if (group?.level === "secondaryCategory") return 1;
  return 9;
};

function configurePolicy(override) {
  if (!override) return DEFAULT_CANDIDATE_POLICY;
  if (override.version !== CANDIDATE_POLICY_VERSION) {
    throw new TypeError("CANDIDATE_POLICY_VERSION_REQUIRED");
  }
  const policy = {
    version: CANDIDATE_POLICY_VERSION,
    review: { ...DEFAULT_CANDIDATE_POLICY.review, ...(override.review || {}) },
    hint: { ...DEFAULT_CANDIDATE_POLICY.hint, ...(override.hint || {}) },
  };
  for (const block of [policy.review, policy.hint]) {
    for (const value of Object.values(block)) {
      if (!Number.isInteger(value) || value < 0) {
        throw new TypeError("INVALID_CANDIDATE_POLICY");
      }
    }
  }
  return policy;
}

function readinessSummary(readiness) {
  const requirements = new Map(
    (readiness?.requirements || []).map((item) => [item.key, item]),
  );
  const status = (key, fallback = "unknown") =>
    requirements.get(key)?.status || fallback;
  return {
    coverage: status("coverage", readiness?.coverage?.status || "unknown"),
    exposure: status("exposure"),
    testDuration: status("testDuration"),
    availability: status("availability"),
    activationReady: Boolean(
      readiness?.strongActivationReady && readiness?.weakActivationReady,
    ),
  };
}

function observations(group) {
  const all = group?.periods?.all || {};
  const d30 = group?.periods?.d30 || {};
  return {
    linkedProducts: finite(all.L),
    reactingProducts: finite(all.A),
    repeatedDateProducts: finite(all.D),
    retainedRepeatedProducts: finite(all.DE),
    recent30ActiveProducts: finite(d30.A),
    Q: finite(all.Q),
    N: finite(all.N),
    E: finite(all.E),
    top1Share: finite(all.top?.[1]?.share),
    top2Share: finite(all.top?.[2]?.share),
  };
}

function laneFor(group, policy) {
  const o = observations(group);
  const reasons = [];

  if (
    group?.validationStatus === "blocked" ||
    o.linkedProducts === null ||
    o.linkedProducts === 0
  ) {
    reasons.push(
      o.linkedProducts === 0 ? "NO_LINKABLE_PRODUCTS" : "GROUP_BLOCKED",
    );
    return { lane: "data_hold", reasons };
  }

  if (group.primaryState === "concentration_dependent") {
    reasons.push("CONCENTRATION_DEPENDENT");
    return { lane: "hit_reference", reasons };
  }

  if (group.primaryState === "exploration_signal") {
    const enoughReacting =
      o.reactingProducts !== null &&
      o.reactingProducts >= policy.review.minReactingProducts;
    const hasDateRepeat =
      o.repeatedDateProducts !== null &&
      o.repeatedDateProducts >= policy.review.minRepeatedDateProducts;
    const recentActive =
      o.recent30ActiveProducts !== null &&
      o.recent30ActiveProducts >= policy.review.minRecent30ActiveProducts;
    const historicalOnly = (group.flags || []).includes("historical_only");

    if (enoughReacting && hasDateRepeat && recentActive && !historicalOnly) {
      reasons.push(
        "MULTIPLE_PRODUCTS_OBSERVED",
        "DATE_REPEAT_OBSERVED",
        "RECENT30_ACTIVE",
      );
      return { lane: "review_candidate", reasons };
    }

    if (!hasDateRepeat) reasons.push("DATE_REPEAT_NOT_ESTABLISHED");
    if (!recentActive || historicalOnly) reasons.push("RECENT30_NOT_ACTIVE");
    if (!enoughReacting) reasons.push("REACTION_SAMPLE_BELOW_REVIEW_GATE");
    return { lane: "emerging_watch", reasons };
  }

  if (
    group.primaryState === "insufficient_data" &&
    o.recent30ActiveProducts !== null &&
    o.recent30ActiveProducts >= policy.review.minRecent30ActiveProducts
  ) {
    reasons.push("RECENT_ACTIVITY_WITH_INSUFFICIENT_EVIDENCE");
    return { lane: "emerging_watch", reasons };
  }

  reasons.push("INSUFFICIENT_EVIDENCE");
  return { lane: "data_hold", reasons };
}

function hintState(group, policy) {
  const o = observations(group);
  if (group.primaryState === "concentration_dependent") {
    return "concentrated_hint";
  }
  if (
    group.primaryState === "exploration_signal" &&
    o.reactingProducts !== null &&
    o.reactingProducts >= policy.hint.minReactingProducts
  ) {
    const repeated =
      o.repeatedDateProducts !== null &&
      o.repeatedDateProducts >= policy.hint.minRepeatedDateProducts;
    const recent =
      o.recent30ActiveProducts !== null &&
      o.recent30ActiveProducts >= policy.hint.minRecent30ActiveProducts;
    return repeated && recent ? "supported_hint" : "emerging_hint";
  }
  return "data_hold_hint";
}

function subsetOf(childKeys, parentSet) {
  return childKeys.every((key) => parentSet.has(key));
}

function aliasesFor(group, groups) {
  const signature = memberSignature(group);
  return groups
    .filter((other) => other.id !== group.id && memberSignature(other) === signature)
    .map((other) => ({
      groupId: other.id,
      level: other.level,
      label: other.label,
    }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId, "ko"));
}

function attributeHintsFor(item, groups, policy) {
  const itemSet = new Set(stableKeys(item));
  const itemSignature = memberSignature(item);
  return groups
    .filter(
      (group) =>
        group.level === "combination" &&
        memberSignature(group) !== itemSignature &&
        subsetOf(stableKeys(group), itemSet),
    )
    .map((group) => {
      const state = hintState(group, policy);
      if (!HINT_VALUES.has(state)) throw new Error("INVALID_HINT_STATE");
      return {
        groupId: group.id,
        label: group.label,
        state,
        primaryState: group.primaryState,
        observations: observations(group),
        cautionFlags: [...(group.flags || [])],
        contributingProductIds: [...(group.contributingProductIds || [])],
        repeatedProductIds: [...(group.repeatedProductIds?.D || [])],
        retainedRepeatedProductIds: [...(group.repeatedProductIds?.DE || [])],
        sharedEvidenceProductIds: [...(group.sharedEvidence || [])],
        aliases: aliasesFor(group, groups),
      };
    })
    .sort((a, b) => a.groupId.localeCompare(b.groupId, "ko"));
}

function representativeItems(groups) {
  const clusters = new Map();
  for (const group of groups.filter((item) => ITEM_LEVELS.has(item.level))) {
    const signature = memberSignature(group);
    if (!clusters.has(signature)) clusters.set(signature, []);
    clusters.get(signature).push(group);
  }
  return [...clusters.values()]
    .map((cluster) =>
      [...cluster].sort(
        (a, b) =>
          itemPriority(a) - itemPriority(b) ||
          a.id.localeCompare(b.id, "ko"),
      )[0],
    )
    .sort((a, b) => a.id.localeCompare(b.id, "ko"));
}

function candidateFromGroup(group, groups, readiness, policy) {
  const assessment = laneFor(group, policy);
  if (!LANE_VALUES.has(assessment.lane)) throw new Error("INVALID_CANDIDATE_LANE");
  const o = observations(group);
  return {
    candidateId: `candidate:${group.id}`,
    groupId: group.id,
    groupLevel: group.level,
    label: group.label,
    lane: assessment.lane,
    confidence: "provisional",
    primaryState: group.primaryState,
    validationStatus: group.validationStatus,
    observations: o,
    cautionFlags: [...(group.flags || [])],
    reasonCodes: assessment.reasons,
    contributors: {
      reactingProductIds: [...(group.contributingProductIds || [])],
      repeatedProductIds: [...(group.repeatedProductIds?.D || [])],
      retainedRepeatedProductIds: [...(group.repeatedProductIds?.DE || [])],
      sharedEvidenceProductIds: [...(group.sharedEvidence || [])],
    },
    aliases: aliasesFor(group, groups),
    attributeHints: attributeHintsFor(group, groups, policy),
    readiness,
    displaySort: {
      recent30ActiveProducts: o.recent30ActiveProducts,
      repeatedDateProducts: o.repeatedDateProducts,
      reactingProducts: o.reactingProducts,
      label: group.label,
    },
  };
}

function attributeReference(group, readiness) {
  return {
    groupId: group.id,
    groupLevel: group.level,
    label: group.label,
    independentCandidate: false,
    primaryState: group.primaryState,
    validationStatus: group.validationStatus,
    observations: observations(group),
    cautionFlags: [...(group.flags || [])],
    contributors: {
      reactingProductIds: [...(group.contributingProductIds || [])],
      repeatedProductIds: [...(group.repeatedProductIds?.D || [])],
      retainedRepeatedProductIds: [...(group.repeatedProductIds?.DE || [])],
      sharedEvidenceProductIds: [...(group.sharedEvidence || [])],
    },
    readiness,
  };
}

/**
 * Build human-review sourcing candidates from sourcing-signals diagnostics.
 *
 * This layer does not recalculate Q/C/N/E, does not score/rank groups, and does
 * not activate evidence_strong / weak_observed_signal.
 */
export function buildSourcingCandidates({
  diagnostics,
  readiness = diagnostics?.sourceMeta?.readiness || null,
  policy: override,
} = {}) {
  if (!diagnostics || !Array.isArray(diagnostics.groups)) {
    throw new TypeError("INVALID_CANDIDATE_INPUT");
  }
  const policy = configurePolicy(override);
  const groups = diagnostics.groups;
  const readinessState = readinessSummary(readiness);

  const items = representativeItems(groups).map((group) =>
    candidateFromGroup(group, groups, readinessState, policy),
  );

  const laneCounts = Object.fromEntries(
    [...LANE_VALUES].map((lane) => [
      lane,
      items.filter((item) => item.lane === lane).length,
    ]),
  );

  const attributeReferences = groups
    .filter((group) => group.level?.startsWith("attribute:"))
    .map((group) => attributeReference(group, readinessState))
    .sort((a, b) => a.groupId.localeCompare(b.groupId, "ko"));

  return {
    policyVersion: policy.version,
    confidence: "provisional",
    items,
    laneCounts,
    attributeReferences,
    rules: {
      noScore: true,
      noRank: true,
      noAutomaticAction: true,
      strongWeakActivation: false,
    },
  };
}
