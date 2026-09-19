import { dateKey } from "./dates.mjs";

const text = (value) => String(value ?? "").trim();

const normalizedDate = (value) => dateKey(value);

function countDateField(products, field, asOf, { allowFuture = false } = {}) {
  const stats = { total: products.length, valid: 0, missing: 0, invalid: 0, future: 0 };
  for (const product of products) {
    const raw = text(product?.[field]);
    if (!raw) {
      stats.missing += 1;
      continue;
    }
    const day = normalizedDate(raw);
    if (!day) {
      stats.invalid += 1;
      continue;
    }
    if (day > asOf) {
      stats.future += 1;
      if (!allowFuture) continue;
    }
    stats.valid += 1;
  }
  stats.usable = stats.valid;
  stats.anomalies = stats.invalid + stats.future;
  stats.coverage = stats.total ? stats.valid / stats.total : null;
  return stats;
}

/**
 * Describe what the live sourcing diagnostics can and cannot validate.
 * This is metadata only: it never promotes/demotes sourcing signal states.
 */
export function assessSourcingReadiness({
  asOf,
  coverageStart,
  periods,
  products = [],
  issues = [],
} = {}) {
  const day = normalizedDate(asOf);
  if (!day || !periods?.p30?.start) throw new TypeError("INVALID_READINESS_INPUT");

  const rawCoverage = text(coverageStart);
  const coverageDay = rawCoverage ? normalizedDate(rawCoverage) : null;
  const coverageInvalid = Boolean(rawCoverage && !coverageDay);
  const coverageFuture = Boolean(coverageDay && coverageDay > day);
  const requiredRecentStart = periods.p30.start;
  const recentWindowsComplete = Boolean(
    coverageDay &&
    !coverageFuture &&
    coverageDay <= requiredRecentStart,
  );
  const coverageStatus = coverageInvalid || coverageFuture
    ? "invalid"
    : !coverageDay
      ? "missing"
      : recentWindowsComplete
        ? "verified"
        : "partial";

  const registrationDates = countDateField(products, "registeredAt", day);
  const seasonEnds = countDateField(products, "seasonEnd", day, { allowFuture: true });
  const ledgerIssues = issues.filter((issue) => issue?.scope === "ledger").length;
  const productIssues = issues.filter((issue) => issue?.scope === "product").length;

  const requirements = [
    {
      key: "coverage",
      label: "주문 수집 범위",
      status: coverageStatus,
      ready: coverageStatus === "verified",
      detail: coverageStatus === "verified"
        ? `${coverageDay}부터 주문 수집 완전성이 확인되어 최근 30·14·7일 비교 구간을 포함합니다.`
        : coverageStatus === "partial"
          ? `${coverageDay}부터의 주문은 확인됐지만 이전 30일 비교에 필요한 ${requiredRecentStart}까지는 포함하지 못합니다.`
          : coverageStatus === "invalid"
            ? "설정된 주문 수집 시작일 형식을 확인해야 합니다."
            : "주문 수집 완전성을 증명하는 시작일이 설정되지 않았습니다.",
    },
    {
      key: "exposure",
      label: "상품 노출",
      status: "missing",
      ready: false,
      detail: "현재 운영 데이터에는 상품별 노출수·클릭수 연결이 없습니다.",
    },
    {
      key: "testDuration",
      label: "실제 테스트 기간",
      status: "missing",
      ready: false,
      detail: "상품 등록일은 일부 확인할 수 있지만 실제 노출·판매 가능 기간과 같다고 간주하지 않습니다.",
    },
    {
      key: "availability",
      label: "현재 판매 가능 여부",
      status: "missing",
      ready: false,
      detail: "판매 종료일 입력만으로 현재 판매 가능 상태를 확정하지 않습니다.",
    },
  ];

  return {
    version: "sourcing-readiness-v1",
    asOf: day,
    recentComparisonStart: requiredRecentStart,
    coverage: {
      raw: rawCoverage || null,
      start: coverageDay,
      status: coverageStatus,
      recentWindowsComplete,
    },
    registrationDates,
    seasonEnds,
    upstreamIssues: {
      total: issues.length,
      ledger: ledgerIssues,
      product: productIssues,
    },
    requirements,
    validatedRequirementCount: requirements.filter((item) => item.ready).length,
    totalRequirementCount: requirements.length,
    strongActivationReady: requirements.every((item) => item.ready),
    weakActivationReady: requirements.every((item) => item.ready),
    note: "등록일·판매종료일 존재 여부는 참고 정보이며 노출·실제 테스트 기간을 대신하지 않습니다.",
  };
}
