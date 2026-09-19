import { dateKey, seoulDate } from "./dates.mjs";
import { classifyProductName, TAXONOMY_VERSION } from "./sourcing-taxonomy.mjs";
import { assessSourcingReadiness } from "./sourcing-readiness.mjs";
import {
  diagnoseSourcingSignals,
  createSignalPeriods,
  SIGNAL_POLICY_VERSION,
} from "./sourcing-signals.mjs";

const TIMEZONE = "Asia/Seoul";
const FALLBACK_OBSERVATION_START = "2000-01-01";

/**
 * Adapt the authoritative live dashboard snapshot into the sourcing-signals input contract.
 * This layer does not recalculate commerce quantities and never infers exposure or test duration.
 */
export function buildLiveSourcingDiagnostics(data = {}, { today = seoulDate() } = {}) {
  const asOf = dateKey(today);
  if (!asOf) throw new Error("유효하지 않은 소싱 진단 기준일");

  const products = (data.mdProducts || []).map((item, index) => {
    const sourceKey = `MD:${item.row || index + 1}`;
    const taxonomy = classifyProductName(item.product || "", {
      productNo: item.productNo || null,
      sourceKey,
    });
    return {
      sourceKey,
      productNo: item.productNo || "",
      productName: item.product || "",
      taxonomy,
      orderLinkStatus: taxonomy.orderLinkStatus,
      registrationDate: item.registeredAt || null,
      seasonEnd: item.seasonEnd || null,
    };
  });

  const orderFacts = (data.orders || []).map((order) => ({
    productNo: order.productNo || "",
    productOrder: order.productOrder || "",
    orderNo: order.orderNo || "",
    orderDate: order.date || "",
    qty: order.qty,
    cancelQty: order.cancelQty,
    netQty: order.netQty,
    eligibleQty: order.eligibleQty,
    pendingClaim: order.pendingClaim,
  }));

  const rawCoverageStart = data.coverageStart || null;
  const rawCoverageThrough = data.coverageThrough || null;
  const configuredCoverageStart = dateKey(rawCoverageStart);
  const usableCoverageStart =
    configuredCoverageStart && configuredCoverageStart <= asOf
      ? configuredCoverageStart
      : null;
  const observationStart = usableCoverageStart || FALLBACK_OBSERVATION_START;
  const periods = createSignalPeriods({
    asOf,
    timezone: TIMEZONE,
    start: observationStart,
  });
  const readiness = assessSourcingReadiness({
    asOf,
    coverageStart: rawCoverageStart,
    coverageThrough: rawCoverageThrough,
    periods,
    products: data.mdProducts || [],
    issues: data.issues || [],
  });
  const snapshot = {
    asOf,
    timezone: TIMEZONE,
    taxonomyVersion: TAXONOMY_VERSION,
    policyVersion: SIGNAL_POLICY_VERSION,
    collectionCompleteness: readiness.coverage.recentWindowsComplete
      ? "verified"
      : "unknown",
    periods,
  };

  const diagnostics = diagnoseSourcingSignals({
    snapshot,
    products,
    orderFacts,
  });

  return {
    ...diagnostics,
    sourceMeta: {
      live: true,
      configuredCoverageStart: usableCoverageStart,
      configuredCoverageThrough: readiness.coverage.through,
      coverageVerified: readiness.coverage.recentWindowsComplete,
      exposureAvailable: false,
      testDurationAvailable: false,
      availabilityAvailable: false,
      readiness,
      updatedAt: data.updatedAt || null,
    },
  };
}
