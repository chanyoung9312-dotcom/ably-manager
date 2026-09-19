export const SOURCING_STATE_COPY = Object.freeze({
  exploration_signal: {
    label: "탐색 신호",
    description: "여러 상품에서 주문 반응이 확인됐지만 아직 반복성과 최근 근거가 충분하지 않습니다.",
  },
  concentration_dependent: {
    label: "특정 상품 의존",
    description: "성과가 소수 상품에 집중되어 있어 이 유형 전체의 성과로 일반화하기 어렵습니다.",
  },
  insufficient_data: {
    label: "판단 자료 부족",
    description: "현재 자료만으로 반응 부족과 테스트 부족을 구분하기 어렵습니다.",
  },
  evidence_strong: {
    label: "강한 근거",
    description: "여러 상품에서 반복성과 최근성이 함께 확인된 상태입니다.",
  },
  weak_observed_signal: {
    label: "관측 반응 약함",
    description: "충분한 관측 조건 아래에서도 반복 반응이 제한적인 상태입니다.",
  },
});

export const SOURCING_FLAG_COPY = Object.freeze({
  cooling_observed: "최근 반응 둔화 관측",
  recent_up_observed: "최근 반응 증가 관측",
  mixed_recent: "최근 지표 혼재",
  historical_only: "과거 반응 중심",
  no_recent7_observed: "최근 7일 반응 없음",
  reaction_without_retained_sales: "주문 반응 대비 잔존 판매 낮음",
  single_day_only: "동일 날짜 중심 반응",
  sample_small: "표본 적음",
  outcome_sparse: "반응 상품 수 적음",
  concentration_boundary: "집중도 경계값",
  shared_evidence: "다른 속성과 동일 상품 근거 공유",
  coverage_unverified: "주문 수집 범위 미확인",
  exposure_unknown: "노출 데이터 없음",
  test_duration_unknown: "테스트 기간 미확인",
  availability_unknown: "판매 가능 기간 미확인",
  taxonomy_partial: "분류 일부 확인 필요",
  option_unallocated: "옵션 속성 미배분",
  unlinked_present: "주문 미연결 상품 포함",
});

const FLAG_PRIORITY = [
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

const VALIDATION_COPY = {
  observed_provisional: "현재 관측 기준",
  validated: "관측 범위 확인됨",
  blocked: "계산 일부 보류",
};

const levelPriority = (group) => {
  if (group.level === "baseType") return 0;
  if (group.level === "secondaryCategory") return 1;
  if (group.level === "primaryCategory") return 2;
  if (group.level?.startsWith("attribute:")) return 3;
  if (group.level === "combination") return 4;
  return 5;
};

const pct = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "확인 필요";

const num = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function typeLabel(group) {
  if (group.level === "primaryCategory") return "대분류";
  if (group.level === "baseType") return "품목";
  if (group.level === "secondaryCategory") return "세부 품목";
  if (group.level === "combination") return "조합";
  const field = group.level?.split(":")[1];
  return {
    design: "속성 · 디자인",
    fitEase: "속성 · 핏",
    silhouette: "속성 · 실루엣",
    widthShape: "속성 · 핏",
    materialExpression: "속성 · 소재 표현",
    pattern: "속성 · 패턴",
    length: "속성 · 기장",
    neckline: "속성 · 넥라인",
    garmentForm: "속성 · 형태",
  }[field] || "속성";
}

function filterBucket(group) {
  if (["primaryCategory", "baseType", "secondaryCategory"].includes(group.level)) return "item";
  if (group.level === "combination") return "combination";
  const field = group.level?.split(":")[1];
  if (field === "design") return "design";
  if (["fitEase", "silhouette", "widthShape"].includes(field)) return "fit";
  if (field === "materialExpression") return "material";
  if (field === "pattern") return "pattern";
  if (field === "length") return "length";
  return "other";
}

function concentrationFact(group) {
  const top = group.periods?.all?.top || {};
  const certain = [2, 1].map((k) => top[k]).find((item) => item?.candidate === "certain");
  const fallback = top[1] || null;
  const chosen = certain || fallback;
  if (!chosen) return null;
  return {
    k: chosen.k,
    share: chosen.share,
    shareLabel: pct(chosen.share),
    remainingQ: num(chosen.remaining?.Q),
    remainingRepeat: num(chosen.remaining?.DE),
  };
}

function recentSentence(group) {
  const flags = new Set(group.flags || []);
  const d30 = group.comparisons?.d30;
  const d14 = group.comparisons?.d14;
  if (flags.has("mixed_recent") && d30 && d14) {
    return `최근 30일 주문 ${d30.Q.previous ?? "?"} → ${d30.Q.current ?? "?"}개 · 최근 14일 사입 판단용 수량 ${d14.E.previous ?? "?"} → ${d14.E.current ?? "?"}개로 지표가 엇갈립니다.`;
  }
  if (flags.has("cooling_observed") && d30) {
    return `최근 30일 주문 반응이 ${d30.Q.previous ?? "?"} → ${d30.Q.current ?? "?"}개로 줄어든 흐름이 관측됐습니다.`;
  }
  if (flags.has("recent_up_observed") && d30) {
    return `최근 30일 주문 반응이 ${d30.Q.previous ?? "?"} → ${d30.Q.current ?? "?"}개로 늘어난 흐름이 관측됐습니다.`;
  }
  if (flags.has("historical_only")) return "반응은 과거 기간에 집중되어 있고 최근 30일에는 주문 반응이 관측되지 않았습니다.";
  const active = num(group.periods?.d30?.A);
  return active === null
    ? "최근 흐름을 계산할 자료가 충분하지 않습니다."
    : active > 0
      ? `최근 30일에는 ${active}개 상품에서 주문 반응이 관측됐습니다.`
      : "최근 30일 주문 반응은 관측되지 않았습니다.";
}

function narrative(group) {
  const all = group.periods?.all || {};
  const L = num(all.L);
  const A = num(all.A);
  const D = num(all.D);
  if (group.validationStatus === "blocked" && L === 0) {
    return "주문 연결 가능한 상품이 없어 이 그룹의 주문 반응을 계산할 수 없습니다.";
  }
  if (group.primaryState === "concentration_dependent") {
    const top = concentrationFact(group);
    const concentration = top
      ? `상위 ${top.k}개 상품이 전체 주문의 ${top.shareLabel}를 차지합니다.`
      : "주문 반응이 소수 상품에 집중되어 있습니다.";
    const residual = top?.remainingRepeat === null
      ? ""
      : ` 해당 상품을 제외하면 다른 날짜에 사입 판단용 반응이 반복된 상품은 ${top.remainingRepeat}개입니다.`;
    return `${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 주문 반응이 확인됐습니다. ${concentration}${residual}`;
  }
  if (group.primaryState === "exploration_signal") {
    return `${L ?? "?"}개 연결 상품 중 ${A ?? "?"}개에서 주문 반응이 확인됐습니다. 서로 다른 날짜에 반복된 상품은 ${D ?? "확인 필요"}개로, 여러 상품의 반응은 보이지만 지속성 근거는 아직 제한적입니다.`;
  }
  if (A === 0) {
    return `현재 ${L ?? "?"}개 연결 상품에서 주문 반응이 관측되지 않았습니다. 노출수와 실제 테스트 기간이 확인되지 않아 반응 부족으로 단정할 수 없습니다.`;
  }
  if (A === 1) {
    return `${L ?? "?"}개 연결 상품 중 1개에서 주문 반응이 확인됐습니다. 여러 상품과 서로 다른 날짜에서 재현됐는지 판단할 자료가 아직 부족합니다.`;
  }
  return "현재 자료의 일부가 확인되지 않아 그룹 전체의 반응을 일반화하기 어렵습니다.";
}

function keyFacts(group) {
  const all = group.periods?.all || {};
  const d30 = group.periods?.d30 || {};
  const top = concentrationFact(group);
  const facts = [
    {
      label: "반응 상품",
      value: all.L === null || all.A === null ? "확인 필요" : `${all.A}/${all.L}개`,
    },
    {
      label: "최근 30일 활성",
      value: d30.A === null ? "확인 필요" : `${d30.A}개`,
    },
  ];
  if (group.primaryState === "concentration_dependent" && top) {
    facts.push({ label: `TOP${top.k} 주문 비중`, value: top.shareLabel });
  } else {
    facts.push({ label: "TOP1 주문 비중", value: pct(all.top?.[1]?.share) });
  }
  return facts;
}

function representativeGroups(groups) {
  const clusters = new Map();
  for (const group of groups.filter((g) => g.level !== "total")) {
    const key = JSON.stringify(group.memberKeys || []);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(group);
  }
  return [...clusters.values()].map((cluster) => {
    const sorted = [...cluster].sort(
      (a, b) => levelPriority(a) - levelPriority(b) || a.label.localeCompare(b.label, "ko"),
    );
    return { representative: sorted[0], aliases: sorted.slice(1) };
  });
}

function sharedLabels(group, diagnostics, groupMap) {
  const related = new Set();
  for (const productNo of group.sharedEvidence || []) {
    const evidence = (diagnostics.sharedEvidence || []).find((item) => item.productNo === productNo);
    for (const id of evidence?.groupIds || []) {
      if (id === group.id) continue;
      const other = groupMap.get(id);
      if (!other) continue;
      if (other.level === "combination" || other.level?.startsWith("attribute:")) related.add(other.label);
    }
  }
  return [...related].sort((a, b) => a.localeCompare(b, "ko")).slice(0, 6);
}

export function buildSourcingView(diagnostics = {}) {
  const groups = diagnostics.groups || [];
  const total = groups.find((group) => group.id === "total:전체");
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const clusters = representativeGroups(groups);

  const cards = clusters.map(({ representative: group, aliases }) => {
    const state = SOURCING_STATE_COPY[group.primaryState] || SOURCING_STATE_COPY.insufficient_data;
    const mappedFlags = FLAG_PRIORITY
      .filter((flag) => group.flags?.includes(flag) && SOURCING_FLAG_COPY[flag])
      .map((flag) => ({ key: flag, label: SOURCING_FLAG_COPY[flag] }));
    const related = sharedLabels(group, diagnostics, groupMap);
    return {
      id: group.id,
      label: group.label,
      typeLabel: typeLabel(group),
      filterBucket: filterBucket(group),
      primaryState: group.primaryState,
      stateLabel: state.label,
      stateDescription: state.description,
      validationLabel: VALIDATION_COPY[group.validationStatus] || "현재 관측 기준",
      visibleFlags: mappedFlags.slice(0, 4),
      allFlags: mappedFlags,
      narrative: narrative(group),
      recentSentence: recentSentence(group),
      keyFacts: keyFacts(group),
      aliases: aliases.map((item) => item.label).filter((label) => label !== group.label),
      sharedGroupLabels: related,
      metrics: {
        all: group.periods?.all || null,
        d30: group.periods?.d30 || null,
        p30: group.periods?.p30 || null,
        d14: group.periods?.d14 || null,
        p14: group.periods?.p14 || null,
        d7: group.periods?.d7 || null,
        p7: group.periods?.p7 || null,
      },
      concentration: {
        top1: group.periods?.all?.top?.[1] || null,
        top2: group.periods?.all?.top?.[2] || null,
        top3: group.periods?.all?.top?.[3] || null,
      },
      dataFitness: group.dataFitness || {},
      issueCount: (group.issues || []).length,
      sort: {
        recent30Active: num(group.periods?.d30?.A) ?? -1,
        reactionProducts: num(group.periods?.all?.A) ?? -1,
        linkedProducts: num(group.periods?.all?.L) ?? -1,
      },
    };
  });

  const statusCounts = cards.reduce(
    (acc, card) => {
      acc[card.primaryState] = (acc[card.primaryState] || 0) + 1;
      return acc;
    },
    {},
  );

  return {
    summary: {
      products: total?.periods?.all?.R ?? null,
      linkedProducts: total?.periods?.all?.L ?? null,
      reactingProducts: total?.periods?.all?.A ?? null,
      recent30ActiveProducts: total?.periods?.d30?.A ?? null,
      validationLabel: VALIDATION_COPY[diagnostics.validationStatus] || "현재 관측 기준",
      updatedAt: diagnostics.sourceMeta?.updatedAt || null,
      statusCounts,
      rawGroupCount: groups.filter((group) => group.level !== "total").length,
      visibleGroupCount: cards.length,
    },
    cards,
    filters: [
      { key: "all", label: "전체" },
      { key: "item", label: "품목" },
      { key: "design", label: "디자인" },
      { key: "fit", label: "핏·실루엣" },
      { key: "material", label: "소재 표현" },
      { key: "pattern", label: "패턴" },
      { key: "length", label: "기장" },
      { key: "combination", label: "조합" },
    ],
    states: [
      { key: "all", label: "전체 상태" },
      { key: "exploration_signal", label: "탐색 신호" },
      { key: "concentration_dependent", label: "특정 상품 의존" },
      { key: "insufficient_data", label: "판단 자료 부족" },
    ],
    notice: "추천 점수나 자동 소싱 결정이 아닌 관측 데이터입니다.",
  };
}
