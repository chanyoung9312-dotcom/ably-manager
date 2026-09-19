import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { buildSourcingCandidates } from "../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateEvidence } from "../lib/sourcing-evidence.mjs";
import { buildSourcingReviewBriefs } from "../lib/sourcing-briefs.mjs";
import { buildSourcingResearchPlan } from "../lib/sourcing-research-plan.mjs";
import { buildSourcingResearchPlanView } from "../lib/sourcing-research-view.mjs";

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
const plan = buildSourcingResearchPlan({ briefResult: briefs });
const view = buildSourcingResearchPlanView(plan);

test("research plan contains review-brief items only", () => {
  assert.equal(plan.count, 1);
  assert.equal(plan.tasks[0].groupId, "baseType:숏·하프팬츠");
  assert.equal(plan.tasks[0].purpose, "신규 소싱 상품 조사");
  assert.equal(plan.persistence, "none");
});

test("research plan preserves early combination evidence without promoting it", () => {
  const task = plan.tasks[0];
  assert.deepEqual(task.combinationContext.supported, []);
  assert.ok(task.combinationContext.emerging.includes("숏·하프팬츠 ∩ 데님"));
  assert.ok(task.guardrails.some((line) => line.includes("초기 관측 조합")));
});

test("research plan defines concrete information to collect before later review", () => {
  const fields = Object.fromEntries(
    plan.tasks[0].captureFields.map((field) => [field.key, field]),
  );
  assert.equal(fields.sourceUrl.required, true);
  assert.equal(fields.supplyPrice.required, true);
  assert.equal(fields.leadDays.required, true);
  assert.equal(fields.options.required, true);
  assert.equal(fields.material.required, false);
});

test("research worklist never ranks suppliers or suggests purchase quantity", () => {
  assert.deepEqual(plan.rules, {
    scoreUsed: false,
    supplierRanked: false,
    productRanked: false,
    quantitySuggested: false,
    autoPurchase: false,
    externalDemandInferred: false,
  });
  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(serialized, /추천순|BEST|발주수량|추천수량/);
});

test("research view exposes a copyable template with evidence context and blank capture fields", () => {
  assert.equal(view.count, 1);
  const task = view.tasks[0];
  assert.equal(task.label, "숏·하프팬츠");
  assert.match(task.copyTemplate, /\[소싱 조사\] 숏·하프팬츠/);
  assert.match(task.copyTemplate, /초기 관측: 숏·하프팬츠 ∩ 데님/);
  assert.match(task.copyTemplate, /공급처 링크:/);
  assert.match(task.copyTemplate, /공급가:/);
  assert.match(task.copyTemplate, /공급처 배송기간:/);
});

test("research view explicitly says it is read-only until a persistent source ledger exists", () => {
  assert.match(view.notice, /현재는 읽기 전용 작업목록/);
  assert.match(view.notice, /별도 원장을 만든 뒤/);
  assert.equal(view.rules.autoPurchase, false);
});

test("missing brief input is rejected rather than fabricating tasks", () => {
  assert.throws(() => buildSourcingResearchPlan({}), /INVALID_RESEARCH_PLAN_INPUT/);
});
