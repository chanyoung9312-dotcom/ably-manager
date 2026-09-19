import { SOURCING_FLAG_COPY } from "./sourcing-view.mjs";

export const CANDIDATE_LANE_COPY = Object.freeze({
  review_candidate: {
    label: "소싱 검토 후보",
    description: "여러 상품 반응, 다른 날짜 반복, 최근 30일 활동이 함께 관측된 품목입니다.",
  },
  hit_reference: {
    label: "히트 구조 참고",
    description: "반응은 확인됐지만 소수 상품 의존이 커서 품목 전체로 일반화하지 않습니다.",
  },
  emerging_watch: {
    label: "추가 관찰",
    description: "반응은 보이지만 반복성 또는 최근 근거가 아직 충분히 쌓이지 않은 품목입니다.",
  },
  data_hold: {
    label: "데이터 보류",
    description: "현재 자료로 소싱 검토 후보 여부를 구분하기 어려운 품목입니다.",
  },
});

export const CANDIDATE_HINT_COPY = Object.freeze({
  supported_hint: {
    label: "반복 관측",
    description: "품목 안에서 여러 상품 반응과 날짜 반복, 최근 활동이 함께 관측된 조합입니다.",
  },
  emerging_hint: {
    label: "초기 관측",
    description: "조합 반응은 있으나 날짜 반복 또는 최근 활동 근거가 아직 제한적입니다.",
  },
  concentrated_hint: {
    label: "특정 상품 근거",
    description: "조합 반응이 소수 상품에 집중되어 독립적인 재현 근거로 보지 않습니다.",
  },
  data_hold_hint: {
    label: "데이터 보류",
    description: "현재 자료로 이 조합의 반응을 해석하기 어렵습니다.",
  },
});

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const pct = (value) =>
  finite(value) === null ? null : `${(value * 100).toFixed(1)}%`;

const EVIDENCE_ROLE_COPY = Object.freeze({
  top1_contributor: "TOP1 기여 상품",
  top2_contributor: "TOP2 기여 상품",
  date_repeat: "다른 날짜 반복",
  retained_repeat: "판단 반영 반복",
  recent30_active: "최근 30일 반응",
  shared_evidence: "다른 그룹과 근거 공유",
});

const CATALOG_STATUS_COPY = Object.freeze({
  matched: "상품명 연결",
  missing: "상품명 미연결",
  conflict: "상품명 확인 필요",
});

const flagPriority = [
  "cooling_observed",
  "recent_up_observed",
  "mixed_recent",
  "historical_only",
  "reaction_without_retained_sales",
  "single_day_only",
  "concentration_boundary",
  "shared_evidence",
  "outcome_sparse",
  "sample_small",
  "coverage_unverified",
  "exposure_unknown",
  "test_duration_unknown",
  "availability_unknown",
  "taxonomy_partial",
  "option_unallocated",
  "unlinked_present",
  "no_recent7_observed",
];

function visibleFlags(flags = []) {
  const set = new Set(flags);
  return flagPriority
    .filter((flag) => set.has(flag) && SOURCING_FLAG_COPY[flag])
    .map((flag) => ({ key: flag, label: SOURCING_FLAG_COPY[flag] }));
}

function narrative(candidate) {
  const o = candidate.observations || {};
  const L = finite(o.linkedProducts);
  const A = finite(o.reactingProducts);
  const D = finite(o.repeatedDateProducts);
  const recent = finite(o.recent30ActiveProducts);
  const top2 = pct(o.top2Share);

  if (candidate.lane === "review_candidate") {
    return `${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 주문 반응이 확인됐고, 서로 다른 날짜에 반복된 상품은 ${D ?? "?"}개입니다. 최근 30일에도 ${recent ?? "?"}개 상품에서 반응이 관측돼 소싱 검토 후보 조건을 충족합니다.`;
  }
  if (candidate.lane === "hit_reference") {
    const concentration = top2
      ? ` 상위 2개 상품의 주문 비중은 ${top2}입니다.`
      : "";
    return `${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 주문 반응이 확인됐지만, 기존 진단에서 특정 상품 의존으로 분류됐습니다.${concentration} 품목 전체의 재현 가능한 성과로 일반화하지 않고 히트 구조를 참고합니다.`;
  }
  if (candidate.lane === "emerging_watch") {
    return `${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 반응이 관측됐습니다. 다른 날짜 반복은 ${D ?? "?"}개, 최근 30일 활성 상품은 ${recent ?? "?"}개로 추가 관찰이 필요합니다.`;
  }
  if (A === 0) {
    return `현재 ${L ?? "?"}개 연결 상품에서 주문 반응이 관측되지 않았습니다. 노출과 실제 테스트 기간이 확인되지 않아 실패나 낮은 상품성으로 판단하지 않습니다.`;
  }
  return `현재 ${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 반응이 관측됐지만, 소싱 검토 후보 여부를 구분할 근거가 충분하지 않습니다.`;
}

function hintView(hint) {
  const copy = CANDIDATE_HINT_COPY[hint.state] || CANDIDATE_HINT_COPY.data_hold_hint;
  const o = hint.observations || {};
  return {
    groupId: hint.groupId,
    label: hint.label,
    state: hint.state,
    stateLabel: copy.label,
    stateDescription: copy.description,
    facts: {
      reactingProducts: finite(o.reactingProducts),
      repeatedDateProducts: finite(o.repeatedDateProducts),
      recent30ActiveProducts: finite(o.recent30ActiveProducts),
      top1Share: finite(o.top1Share),
      top2Share: finite(o.top2Share),
    },
    flags: visibleFlags(hint.cautionFlags),
    sharedEvidence: (hint.sharedEvidenceProductIds || []).length > 0,
    aliases: (hint.aliases || []).map((item) => item.label),
  };
}

function evidenceProductView(product) {
  const name = product.productName || `상품번호 ${product.productNo}`;
  return {
    productNo: product.productNo,
    productName: name,
    catalogStatus: product.catalogStatus,
    catalogStatusLabel: CATALOG_STATUS_COPY[product.catalogStatus] || "상품명 확인 필요",
    roles: (product.roles || [])
      .filter((role) => EVIDENCE_ROLE_COPY[role])
      .map((role) => ({ key: role, label: EVIDENCE_ROLE_COPY[role] })),
    all: {
      Q: finite(product.all?.Q),
      N: finite(product.all?.N),
      E: finite(product.all?.E),
      orderCount: finite(product.all?.orderCount),
      dateCount: finite(product.all?.dateCount),
      eligibleDateCount: finite(product.all?.eligibleDateCount),
    },
    recent30: {
      Q: finite(product.recent30?.Q),
      N: finite(product.recent30?.N),
      E: finite(product.recent30?.E),
      orderCount: finite(product.recent30?.orderCount),
      dateCount: finite(product.recent30?.dateCount),
    },
  };
}

function evidenceFor(groupId, evidenceMap) {
  const evidence = evidenceMap.get(groupId);
  if (!evidence) return { products: [], issue: null };
  return {
    products: (evidence.products || []).map(evidenceProductView),
    issue: evidence.issue || null,
  };
}

function cardView(candidate, evidenceMap) {
  const copy = CANDIDATE_LANE_COPY[candidate.lane] || CANDIDATE_LANE_COPY.data_hold;
  const o = candidate.observations || {};
  return {
    id: candidate.candidateId,
    groupId: candidate.groupId,
    label: candidate.label,
    lane: candidate.lane,
    laneLabel: copy.label,
    laneDescription: copy.description,
    confidenceLabel: "현재 관측 기준",
    narrative: narrative(candidate),
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
    flags: visibleFlags(candidate.cautionFlags),
    aliases: (candidate.aliases || []).map((item) => item.label),
    sharedEvidence: (candidate.contributors?.sharedEvidenceProductIds || []).length > 0,
    attributeHints: (candidate.attributeHints || []).map(hintView),
    evidence: evidenceFor(candidate.groupId, evidenceMap),
    sort: {
      recent30ActiveProducts: finite(candidate.displaySort?.recent30ActiveProducts) ?? -1,
      repeatedDateProducts: finite(candidate.displaySort?.repeatedDateProducts) ?? -1,
      reactingProducts: finite(candidate.displaySort?.reactingProducts) ?? -1,
      label: candidate.label,
    },
  };
}

function observationSort(a, b) {
  return (
    b.sort.recent30ActiveProducts - a.sort.recent30ActiveProducts ||
    b.sort.repeatedDateProducts - a.sort.repeatedDateProducts ||
    b.sort.reactingProducts - a.sort.reactingProducts ||
    a.label.localeCompare(b.label, "ko")
  );
}

export function buildSourcingCandidateView(candidateResult = {}, evidenceResult = null) {
  const evidenceMap = new Map((evidenceResult?.items || []).map((item) => [item.groupId, item]));
  const cards = (candidateResult.items || []).map((candidate) => cardView(candidate, evidenceMap));
  const lanes = [
    "review_candidate",
    "hit_reference",
    "emerging_watch",
    "data_hold",
  ].map((key) => {
    const copy = CANDIDATE_LANE_COPY[key];
    const items = cards.filter((card) => card.lane === key).sort(observationSort);
    return {
      key,
      label: copy.label,
      description: copy.description,
      count: items.length,
      items,
    };
  });

  return {
    confidenceLabel: "현재 관측 기준",
    notice: "소싱 검토 후보는 관측 데이터 분류이며 추천 순위·사입 지시·구매 수량이 아닙니다.",
    lanes,
    counts: Object.fromEntries(lanes.map((lane) => [lane.key, lane.count])),
    attributeReferenceCount: (candidateResult.attributeReferences || []).length,
    rules: {
      scoreUsed: false,
      rankingUsed: false,
      automaticAction: false,
      customerDataExposed: false,
    },
  };
}
