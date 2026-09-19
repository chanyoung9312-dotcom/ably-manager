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
  stats.anomalies = stats.invalid + (allowFuture ? 0 : stats.future);
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
  coverageThrough,
  periods,
  products = [],
  issues = [],
} = {}) {
  const day = normalizedDate(asOf);
  if (!day || !periods?.p30?.start) throw new TypeError("INVALID_READINESS_INPUT");

  const rawCoverageStart = text(coverageStart);
  const rawCoverageThrough = text(coverageThrough);
  const coverageDay = rawCoverageStart ? normalizedDate(rawCoverageStart) : null;
  const coverageThroughDay = rawCoverageThrough ? normalizedDate(rawCoverageThrough) : null;
  const startInvalid = Boolean(rawCoverageStart && !coverageDay);
  const throughInvalid = Boolean(rawCoverageThrough && !coverageThroughDay);
  const startFuture = Boolean(coverageDay && coverageDay > day);
  const throughFuture = Boolean(coverageThroughDay && coverageThroughDay > day);
  const requiredRecentStart = periods.p30.start;
  const requiredRecentEnd = periods.d30.end;
  const historySufficient = Boolean(
    coverageDay &&
    !startFuture &&
    coverageDay <= requiredRecentStart,
  );
  const currentSufficient = Boolean(
    coverageThroughDay &&
    !throughFuture &&
    coverageThroughDay >= requiredRecentEnd,
  );
  const recentWindowsComplete = historySufficient && currentSufficient;
  const anyCoverageMetadata = Boolean(rawCoverageStart || rawCoverageThrough);
  const coverageStatus = startInvalid || throughInvalid || startFuture || throughFuture
    ? "invalid"
    : recentWindowsComplete
      ? "verified"
      : anyCoverageMetadata
        ? "partial"
        : "missing";

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
        ? `${coverageDay}부터 ${coverageThroughDay}까지 주문 수집 완전성이 확인되어 최근 30·14·7일 비교 구간을 포함합니다.`
        : coverageStatus === "partial"
          ? [
              historySufficient
                ? `시작 범위는 충분합니다(${coverageDay}).`
                : coverageDay
                  ? `이전 30일 비교에 필요한 ${requiredRecentStart}보다 수집 시작이 늦습니다(${coverageDay}).`
                  : "검증된 수집 시작일이 없습니다.",
              currentSufficient
                ? `종료 범위는 ${coverageThroughDay}까지 확인됐습니다.`
                : coverageThroughDay
                  ? `현재 비교 종료일 ${requiredRecentEnd}까지 완전성이 확인되지 않았습니다(${coverageThroughDay}까지 확인).`
                  : "수집 완전성이 확인된 종료일이 없습니다.",
            ].join(" ")
          : coverageStatus === "invalid"
            ? "설정된 주문 수집 시작일/완료일 형식 또는 날짜 범위를 확인해야 합니다."
            : "주문 수집 완전성을 증명하는 시작일과 완료일이 설정되지 않았습니다.",
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
      rawStart: rawCoverageStart || null,
      rawThrough: rawCoverageThrough || null,
      start: coverageDay,
      through: coverageThroughDay,
      status: coverageStatus,
      historySufficient,
      currentSufficient,
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
