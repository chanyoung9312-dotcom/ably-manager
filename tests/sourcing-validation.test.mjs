import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { resolveSourcingValidation } from "../lib/sourcing-validation.mjs";
import { buildSourcingView } from "../lib/sourcing-view.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);

function syntheticGroup(overrides = {}) {
  return {
    id: "baseType:테스트",
    level: "baseType",
    label: "테스트",
    primaryState: "exploration_signal",
    validationStatus: "validated",
    promotion: {
      evidence_strong: {
        enabled: false,
        gates: {
          linkedSample: true,
          reactingProducts: true,
          retainedRepetition: true,
          recent30Replication: true,
          recent14Retention: true,
          residualReplication: true,
          recentConsistent: true,
          coverage: true,
          availability: true,
          taxonomy: true,
          facts: true,
        },
      },
      weak_observed_signal: {
        enabled: false,
      },
    },
    periods: {
      all: {
        L: 12, A: 4, D: 3, Q: 20,
        top: { 1: { share: 0.3 }, 2: { share: 0.5 }, 3: { share: 0.6 } },
      },
      d30: { A: 3 },
      p30: { A: 2 },
      d14: { A: 2 },
      p14: { A: 2 },
      d7: { A: 1 },
      p7: { A: 1 },
    },
    comparisons: {
      d30: { Q: { previous: 5, current: 8, direction: "up" }, A: { direction: "up" }, N: { direction: "up" }, E: { direction: "up" } },
      d14: { Q: { previous: 3, current: 4, direction: "up" }, A: { direction: "flat" }, N: { direction: "up" }, E: { direction: "flat" } },
    },
    flags: [],
    memberKeys: ["id:p1", "id:p2"],
    dataFitness: {},
    issues: [],
    sharedEvidence: [],
    ...overrides,
  };
}

test("current production fixture remains provisional with zero strong promotions", () => {
  const validation = resolveSourcingValidation({ diagnostics });
  assert.equal(validation.counts.evidenceStrong, 0);
  assert.equal(validation.counts.weakObservedSignal, 0);
  assert.ok(validation.groups.every((group) => group.resolvedState !== "evidence_strong"));
});

test("fully validated exploration group with every existing strong gate is promoted", () => {
  const input = { groups: [syntheticGroup()] };
  const validation = resolveSourcingValidation({ diagnostics: input });
  assert.equal(validation.groups[0].resolvedState, "evidence_strong");
  assert.equal(validation.groups[0].promoted, true);
  assert.deepEqual(validation.groups[0].unmetStrongGates, []);
});

test("provisional groups never become strong even when numeric gates pass", () => {
  const input = {
    groups: [syntheticGroup({ validationStatus: "observed_provisional" })],
  };
  const validation = resolveSourcingValidation({ diagnostics: input });
  assert.equal(validation.groups[0].resolvedState, "exploration_signal");
  assert.equal(validation.groups[0].promoted, false);
  assert.ok(validation.groups[0].reasonCodes.includes("VALIDATION_NOT_COMPLETE"));
});

test("a failed pre-existing strong gate prevents promotion", () => {
  const group = syntheticGroup();
  group.promotion.evidence_strong.gates.residualReplication = false;
  const validation = resolveSourcingValidation({ diagnostics: { groups: [group] } });
  assert.equal(validation.groups[0].resolvedState, "exploration_signal");
  assert.ok(validation.groups[0].unmetStrongGates.includes("residualReplication"));
});

test("concentration-dependent groups cannot be promoted to strong evidence", () => {
  const group = syntheticGroup({ primaryState: "concentration_dependent" });
  const validation = resolveSourcingValidation({ diagnostics: { groups: [group] } });
  assert.equal(validation.groups[0].resolvedState, "concentration_dependent");
  assert.ok(validation.groups[0].reasonCodes.includes("OBSERVED_STATE_NOT_PROMOTABLE"));
});

test("weak observed signal remains disabled until an explicit exposure/test protocol exists", () => {
  assert.throws(
    () =>
      resolveSourcingValidation({
        diagnostics: { groups: [syntheticGroup()] },
        policy: {
          version: "sourcing-validation-v1",
          enableEvidenceStrong: true,
          enableWeakObservedSignal: true,
        },
      }),
    /WEAK_PROTOCOL_NOT_DEFINED/,
  );
});

test("sourcing view displays strong evidence only from the validation layer", () => {
  const group = syntheticGroup();
  const diagnostic = {
    groups: [group],
    sharedEvidence: [],
    validationStatus: "validated",
    sourceMeta: {},
  };
  const validation = resolveSourcingValidation({ diagnostics: diagnostic });
  const view = buildSourcingView(diagnostic, validation);
  assert.equal(view.cards[0].primaryState, "evidence_strong");
  assert.equal(view.cards[0].observedState, "exploration_signal");
  assert.equal(view.cards[0].stateLabel, "강한 근거");
  assert.equal(view.cards[0].promoted, true);
  assert.match(view.cards[0].narrative, /강한 근거 게이트를 모두 충족/);
});

test("validation layer is pure and never changes candidate or observation metrics", () => {
  const before = JSON.stringify(diagnostics);
  const validation = resolveSourcingValidation({ diagnostics });
  assert.equal(JSON.stringify(diagnostics), before);
  assert.deepEqual(validation.rules, {
    changesObservationMetrics: false,
    changesCandidateLane: false,
    weakStateEnabled: false,
    scoreUsed: false,
  });
});
