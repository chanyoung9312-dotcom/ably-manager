import { dateKey, seoulDate } from "./dates.mjs";
import { classifyProductName, TAXONOMY_VERSION } from "./sourcing-taxonomy.mjs";
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

  const configuredCoverageStart = dateKey(data.coverageStart);
  const observationStart = configuredCoverageStart || FALLBACK_OBSERVATION_START;
  const snapshot = {
    asOf,
    timezone: TIMEZONE,
    taxonomyVersion: TAXONOMY_VERSION,
    policyVersion: SIGNAL_POLICY_VERSION,
    collectionCompleteness: "unknown",
    periods: createSignalPeriods({
      asOf,
      timezone: TIMEZONE,
      start: observationStart,
    }),
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
      configuredCoverageStart: configuredCoverageStart || null,
      coverageVerified: false,
      exposureAvailable: false,
      testDurationAvailable: false,
      updatedAt: data.updatedAt || null,
    },
  };
}
