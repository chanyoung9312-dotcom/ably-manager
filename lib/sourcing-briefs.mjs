const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function hintGroups(candidate) {
  const hints = candidate?.attributeHints || [];
  return {
    supported: hints.filter((hint) => hint.state === "supported_hint"),
    emerging: hints.filter((hint) => hint.state === "emerging_hint"),
    concentrated: hints.filter((hint) => hint.state === "concentrated_hint"),
    held: hints.filter((hint) => hint.state === "data_hold_hint"),
  };
}

function evidenceMap(evidence) {
  return new Map((evidence?.items || []).map((item) => [item.groupId, item]));
}

function topEvidence(item, limit = 3) {
  return (item?.products || []).slice(0, limit).map((product) => ({
    productNo: product.productNo,
    productName: product.productName,
    catalogStatus: product.catalogStatus,
    Q: finite(product.all?.Q),
    N: finite(product.all?.N),
    E: finite(product.all?.E),
    recent30Q: finite(product.recent30?.Q),
    roles: [...(product.roles || [])],
  }));
}

function briefFor(candidate, evidence) {
  const hints = hintGroups(candidate);
  const o = candidate.observations || {};
  return {
    briefId: `brief:${candidate.groupId}`,
    groupId: candidate.groupId,
    label: candidate.label,
    confidence: "provisional",
    facts: {
      linkedProducts: finite(o.linkedProducts),
      reactingProducts: finite(o.reactingProducts),
      repeatedDateProducts: finite(o.repeatedDateProducts),
      retainedRepeatedProducts: finite(o.retainedRepeatedProducts),
      recent30ActiveProducts: finite(o.recent30ActiveProducts),
      Q: finite(o.Q),
      N: finite(o.N),
      E: finite(o.E),
      top1Share: finite(o.top1Share),
      top2Share: finite(o.top2Share),
    },
    evidenceSummary: {
      supportedCombinations: hints.supported.map((hint) => hint.label),
      emergingCombinations: hints.emerging.map((hint) => hint.label),
      concentratedCombinations: hints.concentrated.map((hint) => hint.label),
      heldCombinations: hints.held.map((hint) => hint.label),
      topProducts: topEvidence(evidence.get(candidate.groupId)),
    },
    cautionFlags: [...(candidate.cautionFlags || [])],
    sharedEvidence: (candidate.contributors?.sharedEvidenceProductIds || []).length > 0,
    interpretation: {
      itemLevelCandidate: true,
      hasSupportedCombination: hints.supported.length > 0,
      hasOnlyEarlyCombinationEvidence:
        hints.supported.length === 0 && hints.emerging.length > 0,
      hasConcentratedCombinationEvidence: hints.concentrated.length > 0,
    },
  };
}

/**
 * Builds a read-only sourcing review brief for item-level review candidates.
 *
 * It does not create new candidate lanes, scores, ranks, search demand, or
 * purchasing quantities. All content is projected from stage10 candidates and
 * stage12 evidence.
 */
export function buildSourcingReviewBriefs({
  candidates,
  evidence,
} = {}) {
  if (!candidates || !Array.isArray(candidates.items)) {
    throw new TypeError("INVALID_BRIEF_CANDIDATES");
  }

  const byGroup = evidenceMap(evidence);
  const briefs = candidates.items
    .filter((candidate) => candidate.lane === "review_candidate")
    .map((candidate) => briefFor(candidate, byGroup))
    .sort(
      (a, b) =>
        (b.facts.recent30ActiveProducts ?? -1) -
          (a.facts.recent30ActiveProducts ?? -1) ||
        (b.facts.repeatedDateProducts ?? -1) -
          (a.facts.repeatedDateProducts ?? -1) ||
        (b.facts.reactingProducts ?? -1) -
          (a.facts.reactingProducts ?? -1) ||
        a.label.localeCompare(b.label, "ko"),
    );

  return {
    briefs,
    count: briefs.length,
    confidence: "provisional",
    rules: {
      sourceLane: "review_candidate",
      scoreUsed: false,
      rankUsed: false,
      quantitySuggested: false,
      externalDemandInferred: false,
      supportedHintsOnlyAreRepeatBacked: true,
    },
  };
}
