const finite = (value) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

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

function templateFor(task) {
  const fields = task.captureFields || [];
  return [
    `[소싱 조사] ${task.label}`,
    ...contextLines(task.combinationContext).map(
      (line) => `${line.label}: ${line.value}`,
    ),
    "",
    ...fields.map((field) => `${field.label}: `),
  ].join("\n");
}

export function buildSourcingResearchPlanView(plan = {}) {
  const tasks = (plan.tasks || []).map((task) => ({
    id: task.taskId,
    label: task.label,
    confidenceLabel: "현재 관측 기준",
    purpose: task.purpose,
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
  }));

  return {
    title: "소싱 조사 작업목록",
    description:
      "소싱 검토 후보를 실제 공급처 조사로 넘길 때 확인할 근거와 기록 항목을 정리합니다.",
    notice:
      "현재는 읽기 전용 작업목록입니다. 공급처 링크·가격·옵션 저장은 별도 원장을 만든 뒤 연결합니다.",
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
