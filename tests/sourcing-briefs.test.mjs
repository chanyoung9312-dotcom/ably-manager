import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { buildSourcingCandidates } from "../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateEvidence } from "../lib/sourcing-evidence.mjs";
import { buildSourcingReviewBriefs } from "../lib/sourcing-briefs.mjs";
import { buildSourcingReviewBriefView } from "../lib/sourcing-brief-view.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);
const candidates = buildSourcingCandidates({ diagnostics });
const catalog = fixture.products
  .filter((product) => product.productNo)
  .map((product) => ({
    productNo: product.productNo,
    product: product.productName,
  }));
const evidence = buildSourcingCandidateEvidence({
  diagnostics,
  candidates,
  products: catalog,
});
const briefs = buildSourcingReviewBriefs({ candidates, evidence });
const view = buildSourcingReviewBriefView(briefs);

test("stage13 briefs include review candidates only", () => {
  assert.equal(briefs.count, 1);
  assert.equal(briefs.briefs[0].groupId, "baseType:숏·하프팬츠");
  assert.ok(!briefs.briefs.some((brief) => brief.groupId === "secondaryCategory:롱원피스"));
  assert.deepEqual(briefs.rules, {
    sourceLane: "review_candidate",
    scoreUsed: false,
    rankUsed: false,
    quantitySuggested: false,
    externalDemandInferred: false,
    supportedHintsOnlyAreRepeatBacked: true,
  });
});

test("shorts brief preserves item-level observations", () => {
  const brief = briefs.briefs[0];
  assert.equal(brief.facts.linkedProducts, 27);
  assert.equal(brief.facts.reactingProducts, 8);
  assert.equal(brief.facts.repeatedDateProducts, 2);
  assert.equal(brief.facts.recent30ActiveProducts, 3);
  assert.equal(brief.facts.top2Share, 0.5);
});

test("early combination evidence is not upgraded to supported sourcing direction", () => {
  const brief = briefs.briefs[0];
  assert.deepEqual(brief.evidenceSummary.supportedCombinations, []);
  assert.ok(brief.evidenceSummary.emergingCombinations.includes("숏·하프팬츠 ∩ 데님"));
  assert.equal(brief.interpretation.hasSupportedCombination, false);
  assert.equal(brief.interpretation.hasOnlyEarlyCombinationEvidence, true);
});

test("brief evidence products remain references and contain no ranking field", () => {
  const products = briefs.briefs[0].evidenceSummary.topProducts;
  assert.ok(products.length > 0);
  assert.ok(products.length <= 3);
  assert.ok(products.every((product) => !("rank" in product)));
  assert.ok(products.every((product) => !("score" in product)));
});

test("brief view states that the result is not score, ranking, or purchase quantity", () => {
  assert.equal(view.count, 1);
  assert.match(view.notice, /추천 점수·추천 순위·사입 수량이 아니라/);
  assert.deepEqual(view.rules, {
    scoreUsed: false,
    rankingUsed: false,
    quantitySuggested: false,
    externalDemandInferred: false,
  });
});

test("brief view explains when item-level evidence exists without repeat-backed combinations", () => {
  const brief = view.briefs[0];
  assert.equal(brief.label, "숏·하프팬츠");
  assert.match(brief.combinationSummary, /반복 근거가 확인된 조합은 아직 없습니다/);
  assert.match(brief.combinationSummary, /초기 관측/);
});

test("brief generation does not infer external demand", () => {
  const serialized = JSON.stringify(briefs);
  assert.doesNotMatch(serialized, /검색량|시장 수요|트렌드 점수|외부 수요/);
  assert.equal(briefs.rules.externalDemandInferred, false);
});

test("missing evidence leaves the review brief intact without inventing products", () => {
  const noEvidence = buildSourcingReviewBriefs({
    candidates,
    evidence: { items: [] },
  });
  assert.equal(noEvidence.briefs[0].groupId, "baseType:숏·하프팬츠");
  assert.deepEqual(noEvidence.briefs[0].evidenceSummary.topProducts, []);
});

test("brief builder rejects missing candidate input", () => {
  assert.throws(() => buildSourcingReviewBriefs({}), /INVALID_BRIEF_CANDIDATES/);
});
