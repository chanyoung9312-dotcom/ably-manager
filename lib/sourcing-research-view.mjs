const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const KEYWORD_EVIDENCE_COPY = Object.freeze({
  supported: {
    label: "반복 근거",
    description: "여러 날짜의 반복 반응과 최근 반응이 확인된 조합",
  },
  emerging: {
    label: "초기 반응",
    description: "아직 반복 근거는 부족하지만 탐색 가치가 있는 조합",
  },
  item: {
    label: "품목 기본",
    description: "세부 조합을 넓혀 볼 때 쓰는 기본 품목 키워드",
  },
  concentrated: {
    label: "특정 상품 의존",
    description: "일부 상품 영향이 커서 추천 검색어에서는 분리한 조합",
  },
});

function contextLines(context = {}) {
  const lines = [];
  if ((context.supported || []).length)
    lines.push({
      key: "supported",
      label: "반복 근거 확인",
      value: context.supported.join(", "),
    });
  if ((context.emerging || []).length)
    lines.push({
      key: "emerging",
      label: "초기 관측",
      value: context.emerging.join(", "),
    });
  if ((context.concentrated || []).length)
    lines.push({
      key: "concentrated",
      label: "특정 상품 근거",
      value: context.concentrated.join(", "),
    });
  if ((context.held || []).length)
    lines.push({
      key: "held",
      label: "데이터 보류",
      value: context.held.join(", "),
    });
  if (!lines.some((line) => line.key === "supported"))
    lines.unshift({
      key: "supported",
      label: "반복 근거 확인",
      value: "현재 확인된 조합 없음",
    });
  return lines;
}

function keywordView(keyword) {
  const copy = KEYWORD_EVIDENCE_COPY[keyword.evidence] || KEYWORD_EVIDENCE_COPY.item;
  return {
    keyword: keyword.keyword,
    evidence: keyword.evidence,
    evidenceLabel: copy.label,
    evidenceDescription: copy.description,
    sourceLabel: keyword.sourceLabel,
  };
}

function templateFor(task) {
  const fields = task.captureFields || [];
  const recommended = (task.searchKeywords || []).map((item) => item.keyword).join(", ");
  const cautions = (task.cautionKeywords || []).map((item) => item.keyword).join(", ");
  return [
    `[소싱 조사] ${task.label}`,
    `추천 검색 키워드: ${recommended || task.label}`,
    ...(cautions ? [`특정 상품 의존 참고: ${cautions}`] : []),
    ...contextLines(task.combinationContext).map(
      (line) => `${line.label}: ${line.value}`,
    ),
    "",
    ...fields.map((field) => `${field.label}: `),
  ].join("\n");
}

export function buildSourcingResearchPlanView(plan = {}) {
  const tasks = (plan.tasks || []).map((task) => {
    const searchKeywords = (task.searchKeywords || []).map(keywordView);
    const cautionKeywords = (task.cautionKeywords || []).map(keywordView);
    return {
      id: task.taskId,
      label: task.label,
      confidenceLabel: "우리 판매 데이터 기준",
      purpose: task.purpose,
      keywordTitle: "추천 검색 키워드",
      keywordGuide: searchKeywords.some((item) => item.evidence === "supported")
        ? "반복 근거가 확인된 조합부터 공급처에서 찾아보세요."
        : "반복 근거는 아직 부족합니다. 초기 반응 조합부터 가볍게 탐색해보세요.",
      searchKeywords,
      cautionKeywords,
      copyKeywords: searchKeywords.map((item) => item.keyword).join("\n"),
      facts: {
        reactingProducts: finite(task.observedEvidence?.reactingProducts),
        repeatedDateProducts: finite(task.observedEvidence?.repeatedDateProducts),
        recent30ActiveProducts: finite(task.observedEvidence?.recent30ActiveProducts),
      },
      combinationLines: contextLines(task.combinationContext),
      referenceProducts: (task.referenceProducts || []).map((product) => ({
        productNo: product.productNo,
        productName: product.productName || `상품번호 ${product.productNo}`,
        Q: finite(product.Q),
        recent30Q: finite(product.recent30Q),
      })),
      captureFields: (task.captureFields || []).map((field) => ({
        ...field,
        requirementLabel: field.required ? "필수" : "선택",
      })),
      guardrails: [...(task.guardrails || [])],
      copyTemplate: templateFor(task),
    };
  });

  return {
    title: "다음 소싱 검색 키워드",
    description:
      "우리 상품의 실제 주문 반응에서 확인된 품목·조합을 공급처에서 바로 검색할 수 있는 키워드로 정리합니다.",
    notice:
      "키워드는 외부 인기 검색어가 아니라 우리 판매 데이터에서 나온 소싱 방향입니다. 공급처 링크·가격·옵션 저장은 별도 원장을 만든 뒤 연결합니다.",
    count: tasks.length,
    tasks,
    rules: {
      scoreUsed: false,
      supplierRanked: false,
      productRanked: false,
      quantitySuggested: false,
      autoPurchase: false,
    },
  };
}
