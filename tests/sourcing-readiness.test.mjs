import test from "node:test";
import assert from "node:assert/strict";
import { createSignalPeriods } from "../lib/sourcing-signals.mjs";
import { assessSourcingReadiness } from "../lib/sourcing-readiness.mjs";
import { buildLiveSourcingDiagnostics } from "../lib/sourcing-live.mjs";

const asOf = "2026-09-19";
const periods = (start) => createSignalPeriods({
  asOf,
  timezone: "Asia/Seoul",
  start,
});

test("coverage is verified only when it includes the previous 30-day comparison window", () => {
  const ready = assessSourcingReadiness({
    asOf,
    coverageStart: "2026-04-15",
    periods: periods("2026-04-15"),
  });
  assert.equal(ready.recentComparisonStart, "2026-07-22");
  assert.equal(ready.coverage.status, "verified");
  assert.equal(ready.coverage.recentWindowsComplete, true);

  const partial = assessSourcingReadiness({
    asOf,
    coverageStart: "2026-09-01",
    periods: periods("2026-09-01"),
  });
  assert.equal(partial.coverage.status, "partial");
  assert.equal(partial.coverage.recentWindowsComplete, false);
});

test("missing, malformed and future coverage never become verified", () => {
  const missing = assessSourcingReadiness({
    asOf,
    coverageStart: null,
    periods: periods("2000-01-01"),
  });
  assert.equal(missing.coverage.status, "missing");

  const malformed = assessSourcingReadiness({
    asOf,
    coverageStart: "not-a-date",
    periods: periods("2000-01-01"),
  });
  assert.equal(malformed.coverage.status, "invalid");

  const future = assessSourcingReadiness({
    asOf,
    coverageStart: "2027-01-01",
    periods: periods("2000-01-01"),
  });
  assert.equal(future.coverage.status, "invalid");
});

test("registration and season-end dates are descriptive only and keep anomalies visible", () => {
  const readiness = assessSourcingReadiness({
    asOf,
    coverageStart: "2026-04-15",
    periods: periods("2026-04-15"),
    products: [
      { registeredAt: "2026-08-01", seasonEnd: "2026-10-01" },
      { registeredAt: "2028-01-01", seasonEnd: "" },
      { registeredAt: "", seasonEnd: "bad" },
      { registeredAt: "bad", seasonEnd: "2026-09-01" },
    ],
  });
  assert.deepEqual(
    {
      valid: readiness.registrationDates.valid,
      missing: readiness.registrationDates.missing,
      invalid: readiness.registrationDates.invalid,
      future: readiness.registrationDates.future,
    },
    { valid: 1, missing: 1, invalid: 1, future: 1 },
  );
  assert.equal(readiness.seasonEnds.valid, 1);
  assert.equal(readiness.seasonEnds.future, 1);
  assert.equal(readiness.seasonEnds.invalid, 1);
  assert.equal(readiness.requirements.find((item) => item.key === "testDuration").ready, false);
  assert.equal(readiness.requirements.find((item) => item.key === "availability").ready, false);
});

test("upstream ledger and product issues are counted without silently changing sourcing states", () => {
  const readiness = assessSourcingReadiness({
    asOf,
    coverageStart: "2026-04-15",
    periods: periods("2026-04-15"),
    issues: [
      { scope: "ledger", message: "ledger" },
      { scope: "product", message: "p1" },
      { scope: "product", message: "p2" },
    ],
  });
  assert.deepEqual(readiness.upstreamIssues, { total: 3, ledger: 1, product: 2 });
  assert.equal(readiness.strongActivationReady, false);
  assert.equal(readiness.weakActivationReady, false);
});

test("live adapter marks collection completeness verified only for sufficient configured coverage", () => {
  const base = {
    mdProducts: [{ row: 2, productNo: "p1", product: "롱 원피스", registeredAt: "2026-08-01" }],
    orders: [{
      productNo: "p1", productOrder: "po1", orderNo: "o1", date: "2026-09-10",
      qty: 1, cancelQty: 0, netQty: 1, eligibleQty: 1, pendingClaim: false,
    }],
    issues: [],
  };
  const verified = buildLiveSourcingDiagnostics(
    { ...base, coverageStart: "2026-04-15" },
    { today: asOf },
  );
  assert.equal(verified.snapshot.collectionCompleteness, "verified");
  assert.equal(verified.sourceMeta.coverageVerified, true);
  assert.equal(verified.sourceMeta.readiness.coverage.status, "verified");

  const partial = buildLiveSourcingDiagnostics(
    { ...base, coverageStart: "2026-09-01" },
    { today: asOf },
  );
  assert.equal(partial.snapshot.collectionCompleteness, "unknown");
  assert.equal(partial.sourceMeta.coverageVerified, false);
  assert.equal(partial.sourceMeta.readiness.coverage.status, "partial");
});

test("future configured coverage is quarantined instead of crashing the live screen", () => {
  const diagnostics = buildLiveSourcingDiagnostics(
    {
      coverageStart: "2027-01-01",
      mdProducts: [{ row: 2, productNo: "p1", product: "니트" }],
      orders: [],
      issues: [],
    },
    { today: asOf },
  );
  assert.equal(diagnostics.sourceMeta.configuredCoverageStart, null);
  assert.equal(diagnostics.sourceMeta.readiness.coverage.status, "invalid");
  assert.equal(diagnostics.snapshot.collectionCompleteness, "unknown");
});
