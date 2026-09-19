import { SOURCING_FLAG_COPY } from "./sourcing-view.mjs";

const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

function pct(value) {
  return finite(value) === null ? null : `${(value * 100).toFixed(1)}%`;
}

function cautionLabels(flags = []) {
  return flags
    .filter((flag) => SOURCING_FLAG_COPY[flag])
    .map((flag) => ({ key: flag, label: SOURCING_FLAG_COPY[flag] }));
}

function productView(product) {
  return {
    productNo: product.productNo,
    productName: product.productName || `상품번호 ${product.productNo}`,
    catalogStatus: product.catalogStatus,
    Q: finite(product.Q),
    N: finite(product.N),
    E: finite(product.E),
    recent30Q: finite(product.recent30Q),
  };
}

function briefView(brief) {
  const supported = brief.evidenceSummary?.supportedCombinations || [];
  const emerging = brief.evidenceSummary?.emergingCombinations || [];
  const concentrated = brief.evidenceSummary?.concentratedCombinations || [];
  const held = brief.evidenceSummary?.heldCombinations || [];
  const facts = brief.facts || {};

  const combinationSummary = supported.length
    ? `반복 근거가 확인된 조합은 ${supported.join(", ")}입니다.`
    : emerging.length
      ? `품목 수준 후보는 성립하지만 반복 근거가 확인된 조합은 아직 없습니다. ${emerging.join(", ")}은 초기 관측으로만 확인합니다.`
      : "품목 수준 후보는 성립하지만 현재 조합 수준에서 반복 근거가 확인된 항목은 없습니다.";

  const concentrationNote = concentrated.length
    ? `${concentrated.join(", ")}은 특정 상품 근거에 의존해 일반화하지 않습니다.`
    : null;

  return {
    id: brief.briefId,
    groupId: brief.groupId,
    label: brief.label,
    confidenceLabel: "현재 관측 기준",
    headline: "소싱 검토 브리프",
    facts: {
      linkedProducts: finite(facts.linkedProducts),
      reactingProducts: finite(facts.reactingProducts),
      repeatedDateProducts: finite(facts.repeatedDateProducts),
      recent30ActiveProducts: finite(facts.recent30ActiveProducts),
      top2Share: finite(facts.top2Share),
      top2ShareLabel: pct(facts.top2Share),
    },
    summary: `${facts.linkedProducts ?? "?"}개 연결 상품 중 ${facts.reactingProducts ?? "?"}개에서 반응이 확인됐고, 다른 날짜 반복은 ${facts.repeatedDateProducts ?? "?"}개, 최근 30일 활성 상품은 ${facts.recent30ActiveProducts ?? "?"}개입니다.`,
    combinationSummary,
    concentrationNote,
    supportedCombinations: supported,
    emergingCombinations: emerging,
    concentratedCombinations: concentrated,
    heldCombinations: held,
    evidenceProducts: (brief.evidenceSummary?.topProducts || []).map(productView),
    cautions: cautionLabels(brief.cautionFlags),
    sharedEvidence: Boolean(brief.sharedEvidence),
    note: "이 브리프는 소싱을 자동 결정하지 않습니다. 현재 관측 근거를 사람이 검토하기 쉽게 묶은 요약입니다.",
  };
}

export function buildSourcingReviewBriefView(briefResult = {}) {
  const briefs = (briefResult.briefs || []).map(briefView);
  return {
    count: briefs.length,
    confidenceLabel: "현재 관측 기준",
    title: "이번 소싱 검토 브리프",
    description: "소싱 검토 후보만 모아 품목 수준 근거, 조합 근거의 단계, 기존 근거 상품을 한 번에 확인합니다.",
    notice: "추천 점수·추천 순위·사입 수량이 아니라 현재 관측 데이터의 검토 요약입니다.",
    briefs,
    rules: {
      scoreUsed: false,
      rankingUsed: false,
      quantitySuggested: false,
      externalDemandInferred: false,
    },
  };
}
