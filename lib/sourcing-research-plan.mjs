const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function evidenceSummary(brief) {
  return (brief?.evidenceSummary?.topProducts || []).slice(0, 3).map((product) => ({
    productNo: product.productNo,
    productName: product.productName || null,
    Q: finite(product.Q),
    recent30Q: finite(product.recent30Q),
  }));
}

function researchFields() {
  return [
    { key: "sourceUrl", label: "공급처 링크", required: true },
    { key: "supplyPrice", label: "공급가", required: true },
    { key: "leadDays", label: "공급처 배송기간", required: true },
    { key: "options", label: "색상·사이즈 옵션", required: true },
    { key: "material", label: "소재·상세정보", required: false },
    { key: "notes", label: "비교 메모", required: false },
  ];
}

function keywordText(label) {
  return String(label || "")
    .split("∩")
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function uniqueKeywords(items = []) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.keyword.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function searchKeywords(label, { supported, emerging, concentrated }) {
  const repeated = supported.map((combination) => ({
    keyword: keywordText(combination),
    evidence: "supported",
    sourceLabel: combination,
  }));
  const exploratory = emerging.map((combination) => ({
    keyword: keywordText(combination),
    evidence: "emerging",
    sourceLabel: combination,
  }));
  const fallback = [{
    keyword: keywordText(label),
    evidence: "item",
    sourceLabel: label,
  }];

  const primary = repeated.length ? repeated : exploratory;
  return {
    recommended: uniqueKeywords([...primary, ...fallback]).slice(0, 5),
    caution: uniqueKeywords(concentrated.map((combination) => ({
      keyword: keywordText(combination),
      evidence: "concentrated",
      sourceLabel: combination,
    }))).slice(0, 3),
  };
}

/**
 * Convert review briefs into a read-only sourcing research worklist.
 *
 * This module does not choose a supplier or product, does not rank candidate
 * links, and does not persist anything. It only defines what evidence should
 * be collected before a new sourced item can be reviewed.
 */
export function buildSourcingResearchPlan({ briefResult } = {}) {
  if (!briefResult || !Array.isArray(briefResult.briefs))
    throw new TypeError("INVALID_RESEARCH_PLAN_INPUT");

  const tasks = briefResult.briefs.map((brief) => {
    const supported = [...(brief.evidenceSummary?.supportedCombinations || [])];
    const emerging = [...(brief.evidenceSummary?.emergingCombinations || [])];
    const concentrated = [...(brief.evidenceSummary?.concentratedCombinations || [])];
    const held = [...(brief.evidenceSummary?.heldCombinations || [])];
    const keywords = searchKeywords(brief.label, { supported, emerging, concentrated });

    return {
      taskId: `research:${brief.groupId}`,
      groupId: brief.groupId,
      label: brief.label,
      confidence: "provisional",
      purpose: "신규 소싱 상품 조사",
      observedEvidence: {
        reactingProducts: finite(brief.facts?.reactingProducts),
        repeatedDateProducts: finite(brief.facts?.repeatedDateProducts),
        recent30ActiveProducts: finite(brief.facts?.recent30ActiveProducts),
      },
      combinationContext: {
        supported,
        emerging,
        concentrated,
        held,
      },
      searchKeywords: keywords.recommended,
      cautionKeywords: keywords.caution,
      referenceProducts: evidenceSummary(brief),
      captureFields: researchFields(),
      guardrails: [
        "추천 검색어는 우리 판매 데이터에서 관측된 품목·조합만 사용하며 외부 검색량을 뜻하지 않음",
        "초기 관측 조합을 반복 근거로 승격하지 않음",
        "특정 상품 의존 조합을 품목 전체 성과로 일반화하지 않음",
        "기존 히트상품과 유사하다는 이유만으로 신규 후보를 통과시키지 않음",
        "공급가·배송기간·옵션 정보를 확인하기 전 사입 수량을 만들지 않음",
      ],
    };
  });

  return {
    tasks,
    count: tasks.length,
    confidence: "provisional",
    persistence: "none",
    rules: {
      scoreUsed: false,
      supplierRanked: false,
      productRanked: false,
      quantitySuggested: false,
      autoPurchase: false,
      externalDemandInferred: false,
    },
  };
}
