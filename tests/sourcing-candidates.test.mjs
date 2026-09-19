import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import {
  buildSourcingCandidates,
  CANDIDATE_POLICY_VERSION,
} from "../lib/sourcing-candidates.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);
const result = buildSourcingCandidates({ diagnostics });

const item = (id) => {
  const found = result.items.find((candidate) => candidate.groupId === id);
  assert.ok(found, id);
  return found;
};

const attribute = (id) => {
  const found = result.attributeReferences.find((candidate) => candidate.groupId === id);
  assert.ok(found, id);
  return found;
};

test("stage10 candidate output stays review-only with no score, rank, or automatic action", () => {
  assert.equal(result.policyVersion, CANDIDATE_POLICY_VERSION);
  assert.equal(result.confidence, "provisional");
  assert.deepEqual(result.rules, {
    noScore: true,
    noRank: true,
    noAutomaticAction: true,
    strongWeakActivation: false,
  });
  for (const candidate of result.items) {
    assert.equal("score" in candidate, false);
    assert.equal("rank" in candidate, false);
    assert.equal("quantity" in candidate, false);
    assert.equal(candidate.confidence, "provisional");
  }
});

test("independent candidates are only item/base-detail levels and never attributes or combinations", () => {
  assert.ok(result.items.length > 0);
  assert.ok(
    result.items.every((candidate) =>
      ["baseType", "secondaryCategory"].includes(candidate.groupLevel),
    ),
  );
  assert.ok(!result.items.some((candidate) => candidate.groupId.startsWith("attribute:")));
  assert.ok(!result.items.some((candidate) => candidate.groupId.startsWith("combination:")));
  assert.ok(!result.items.some((candidate) => candidate.groupId.startsWith("primaryCategory:")));
});

test("shorts are the known review candidate under the stage9 gates", () => {
  const candidate = item("baseType:숏·하프팬츠");
  assert.equal(candidate.lane, "review_candidate");
  assert.equal(candidate.observations.linkedProducts, 27);
  assert.equal(candidate.observations.reactingProducts, 8);
  assert.equal(candidate.observations.repeatedDateProducts, 2);
  assert.equal(candidate.observations.retainedRepeatedProducts, 2);
  assert.equal(candidate.observations.recent30ActiveProducts, 3);
  assert.equal(candidate.observations.top1Share, 4 / 14);
  assert.equal(candidate.observations.top2Share, 0.5);
  assert.deepEqual(candidate.reasonCodes, [
    "MULTIPLE_PRODUCTS_OBSERVED",
    "DATE_REPEAT_OBSERVED",
    "RECENT30_ACTIVE",
  ]);
});

test("exactly 50 percent TOP2 does not turn shorts into concentration reference", () => {
  const candidate = item("baseType:숏·하프팬츠");
  assert.equal(candidate.primaryState, "exploration_signal");
  assert.equal(candidate.observations.top2Share, 0.5);
  assert.equal(candidate.lane, "review_candidate");
});

test("long dress, skirt and pants remain hit references rather than sourcing review candidates", () => {
  const longDress = item("secondaryCategory:롱원피스");
  assert.equal(longDress.lane, "hit_reference");
  assert.equal(longDress.observations.top2Share, 176 / 178);
  assert.ok(longDress.aliases.some((alias) => alias.groupId === "combination:원피스 ∩ 롱"));

  assert.equal(item("baseType:스커트").lane, "hit_reference");
  assert.equal(item("baseType:팬츠").lane, "hit_reference");
  assert.equal(item("baseType:슬랙스").lane, "hit_reference");
  assert.equal(item("baseType:나시·슬리브리스").lane, "hit_reference");
});

test("zero or sparse item observations stay data-hold rather than becoming negative recommendations", () => {
  assert.equal(item("baseType:티셔츠").lane, "data_hold");
  assert.equal(item("baseType:블라우스").lane, "data_hold");
  assert.equal(item("baseType:니트").lane, "data_hold");
});

test("wide and A-line are references only, never independent sourcing candidates", () => {
  const wide = attribute("attribute:widthShape:와이드");
  assert.equal(wide.independentCandidate, false);
  assert.equal(wide.primaryState, "concentration_dependent");

  const aline = attribute("attribute:silhouette:A라인");
  assert.equal(aline.independentCandidate, false);
  assert.equal(aline.primaryState, "exploration_signal");
  assert.equal(aline.observations.repeatedDateProducts, 0);
  assert.equal(aline.observations.recent30ActiveProducts, 1);
});

test("item candidates attach combination hints without promoting concentrated or early signals", () => {
  const shorts = item("baseType:숏·하프팬츠");
  const denimShorts = shorts.attributeHints.find(
    (hint) => hint.groupId === "combination:숏·하프팬츠 ∩ 데님",
  );
  assert.ok(denimShorts);
  assert.equal(denimShorts.state, "emerging_hint");
  assert.equal(denimShorts.observations.repeatedDateProducts, 0);
  assert.equal(denimShorts.observations.recent30ActiveProducts, 0);

  const skirt = item("baseType:스커트");
  const aLineSkirt = skirt.attributeHints.find(
    (hint) => hint.groupId === "combination:스커트 ∩ A라인",
  );
  assert.ok(aLineSkirt);
  assert.equal(aLineSkirt.state, "emerging_hint");

  const pants = item("baseType:팬츠");
  const widePants = pants.attributeHints.find(
    (hint) => hint.groupId === "combination:팬츠 ∩ 와이드",
  );
  assert.ok(widePants);
  assert.equal(widePants.state, "concentrated_hint");

  const wideDenimPants = pants.attributeHints.find(
    (hint) => hint.groupId === "combination:팬츠 ∩ 와이드 ∩ 데님",
  );
  assert.ok(wideDenimPants);
  assert.equal(wideDenimPants.state, "data_hold_hint");
});

test("equivalent member sets are aliases and not duplicated as item candidates", () => {
  const longDress = item("secondaryCategory:롱원피스");
  assert.ok(longDress.aliases.some((alias) => alias.groupId === "combination:원피스 ∩ 롱"));
  assert.equal(
    result.items.filter((candidate) => candidate.groupId === "combination:원피스 ∩ 롱").length,
    0,
  );
});

test("shared evidence is preserved as product ids rather than counted as independent wins", () => {
  const longDress = item("secondaryCategory:롱원피스");
  assert.ok(longDress.contributors.sharedEvidenceProductIds.length > 0);
  assert.equal(
    new Set(longDress.contributors.sharedEvidenceProductIds).size,
    longDress.contributors.sharedEvidenceProductIds.length,
  );
  assert.equal("sharedEvidenceScore" in longDress, false);
});

test("seven-day zero alone cannot remove an otherwise valid review candidate", () => {
  const cloned = structuredClone(diagnostics);
  const shorts = cloned.groups.find((group) => group.id === "baseType:숏·하프팬츠");
  assert.ok(shorts);
  shorts.periods.d7.A = 0;
  shorts.periods.d7.Q = 0;
  shorts.flags = [...new Set([...(shorts.flags || []), "no_recent7_observed"])];
  const next = buildSourcingCandidates({ diagnostics: cloned });
  const candidate = next.items.find((entry) => entry.groupId === "baseType:숏·하프팬츠");
  assert.equal(candidate.lane, "review_candidate");
});

test("missing readiness keeps candidates provisional but does not convert them to data hold", () => {
  const shorts = item("baseType:숏·하프팬츠");
  assert.equal(shorts.confidence, "provisional");
  assert.deepEqual(shorts.readiness, {
    coverage: "unknown",
    exposure: "unknown",
    testDuration: "unknown",
    availability: "unknown",
    activationReady: false,
  });
  assert.equal(shorts.lane, "review_candidate");
});

test("verified readiness metadata still does not activate strong or weak candidate states in stage10", () => {
  const readiness = {
    requirements: [
      { key: "coverage", status: "verified" },
      { key: "exposure", status: "verified" },
      { key: "testDuration", status: "verified" },
      { key: "availability", status: "verified" },
    ],
    strongActivationReady: true,
    weakActivationReady: true,
  };
  const next = buildSourcingCandidates({ diagnostics, readiness });
  const shorts = next.items.find((entry) => entry.groupId === "baseType:숏·하프팬츠");
  assert.equal(shorts.confidence, "provisional");
  assert.equal(next.rules.strongWeakActivation, false);
  assert.equal(shorts.lane, "review_candidate");
});

test("supported hints require both date repetition and recent30 activity", () => {
  const synthetic = {
    groups: [
      {
        id: "baseType:테스트",
        level: "baseType",
        label: "테스트",
        memberKeys: ["a", "b", "c"],
        primaryState: "exploration_signal",
        validationStatus: "observed_provisional",
        flags: [],
        periods: {
          all: { L: 3, A: 3, D: 2, DE: 2, Q: 4, N: 4, E: 4, top: { 1: { share: 0.5 }, 2: { share: 0.75 } } },
          d30: { A: 2 },
        },
        contributingProductIds: ["1", "2", "3"],
        repeatedProductIds: { D: ["1", "2"], DE: ["1", "2"] },
        sharedEvidence: [],
      },
      {
        id: "combination:테스트 ∩ 속성",
        level: "combination",
        label: "테스트 ∩ 속성",
        memberKeys: ["a", "b"],
        primaryState: "exploration_signal",
        validationStatus: "observed_provisional",
        flags: [],
        periods: {
          all: { L: 2, A: 2, D: 1, DE: 1, Q: 2, N: 2, E: 2, top: { 1: { share: 0.5 }, 2: { share: 1 } } },
          d30: { A: 1 },
        },
        contributingProductIds: ["1", "2"],
        repeatedProductIds: { D: ["1"], DE: ["1"] },
        sharedEvidence: [],
      },
    ],
  };
  const next = buildSourcingCandidates({ diagnostics: synthetic });
  assert.equal(next.items[0].lane, "review_candidate");
  assert.equal(next.items[0].attributeHints[0].state, "supported_hint");
});

test("candidate policy overrides require the stage10 policy version", () => {
  assert.throws(
    () =>
      buildSourcingCandidates({
        diagnostics,
        policy: { review: { minRepeatedDateProducts: 2 } },
      }),
    /CANDIDATE_POLICY_VERSION_REQUIRED/,
  );

  const next = buildSourcingCandidates({
    diagnostics,
    policy: {
      version: CANDIDATE_POLICY_VERSION,
      review: { minRepeatedDateProducts: 3 },
    },
  });
  assert.equal(
    next.items.find((entry) => entry.groupId === "baseType:숏·하프팬츠").lane,
    "emerging_watch",
  );
});

test("candidate construction is pure and leaves sourcing diagnostics unchanged", () => {
  const before = JSON.stringify(diagnostics);
  buildSourcingCandidates({ diagnostics });
  assert.equal(JSON.stringify(diagnostics), before);
});
