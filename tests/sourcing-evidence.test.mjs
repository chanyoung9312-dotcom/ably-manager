import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { buildSourcingCandidates } from "../lib/sourcing-candidates.mjs";
import { buildSourcingCandidateEvidence } from "../lib/sourcing-evidence.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);
const candidates = buildSourcingCandidates({ diagnostics });
const catalog = fixture.products
  .filter((product) => product.productNo)
  .map((product, index) => ({
    row: index + 2,
    productNo: product.productNo,
    product: product.productName,
  }));
const evidence = buildSourcingCandidateEvidence({
  diagnostics,
  candidates,
  products: catalog,
});

const group = (id) => {
  const found = evidence.items.find((item) => item.groupId === id);
  assert.ok(found, id);
  return found;
};

test("product evidence is a projection of existing stats and never changes candidate lanes", () => {
  assert.deepEqual(evidence.rules, {
    usesExistingProductStats: true,
    recalculatesQuantities: false,
    exposesCustomerData: false,
    changesCandidateLane: false,
  });
  assert.equal(evidence.items.length, candidates.items.length);
});

test("long-dress evidence identifies the two dominant products and their observed quantities", () => {
  const longDress = group("secondaryCategory:롱원피스");
  assert.equal(longDress.products.length, 4);
  assert.equal(longDress.products[0].productNo, "67545180");
  assert.equal(longDress.products[0].productName, "체형 커버 스트라이프 오버핏 롱 원피스");
  assert.equal(longDress.products[0].all.Q, 113);
  assert.equal(longDress.products[1].productNo, "67182128");
  assert.equal(longDress.products[1].all.Q, 63);
  assert.ok(longDress.products[0].roles.includes("top1_contributor"));
  assert.ok(longDress.products[1].roles.includes("top2_contributor"));
  assert.equal(longDress.products[0].all.Q + longDress.products[1].all.Q, 176);
});

test("shorts evidence contains exactly the reacting products and preserves repetition roles", () => {
  const shorts = group("baseType:숏·하프팬츠");
  const candidate = candidates.items.find((item) => item.groupId === "baseType:숏·하프팬츠");
  assert.equal(shorts.products.length, candidate.contributors.reactingProductIds.length);
  assert.ok(shorts.products.some((product) => product.roles.includes("date_repeat")));
  assert.ok(shorts.products.some((product) => product.roles.includes("recent30_active")));
});

test("product metrics come from sourcing-signal productStats without quantity reconstruction", () => {
  const longGroup = diagnostics.groups.find((item) => item.id === "secondaryCategory:롱원피스");
  const stats = new Map(longGroup.periods.all.productStats.map((item) => [item.productNo, item]));
  for (const product of group("secondaryCategory:롱원피스").products) {
    const source = stats.get(product.productNo);
    assert.equal(product.all.Q, source.Q);
    assert.equal(product.all.N, source.N);
    assert.equal(product.all.E, source.E);
    assert.equal(product.all.orderCount, source.orderCount);
    assert.equal(product.all.dateCount, source.dateCount);
  }
});

test("shared evidence is kept as a role rather than an extra success count", () => {
  const longDress = group("secondaryCategory:롱원피스");
  assert.ok(longDress.products.some((product) => product.roles.includes("shared_evidence")));
  assert.equal("score" in longDress, false);
});

test("missing catalog names fall back later without inventing a title", () => {
  const missingCatalog = buildSourcingCandidateEvidence({
    diagnostics,
    candidates,
    products: [],
  });
  const longDress = missingCatalog.items.find((item) => item.groupId === "secondaryCategory:롱원피스");
  assert.equal(longDress.products[0].productName, null);
  assert.equal(longDress.products[0].catalogStatus, "missing");
});

test("conflicting catalog names are surfaced rather than arbitrarily choosing one", () => {
  const conflicted = buildSourcingCandidateEvidence({
    diagnostics,
    candidates,
    products: [
      { productNo: "67545180", product: "이름 A", row: 1 },
      { productNo: "67545180", product: "이름 B", row: 2 },
    ],
  });
  const longDress = conflicted.items.find((item) => item.groupId === "secondaryCategory:롱원피스");
  const product = longDress.products.find((item) => item.productNo === "67545180");
  assert.equal(product.productName, null);
  assert.equal(product.catalogStatus, "conflict");
});

test("evidence output contains no order numbers or customer fields", () => {
  const serialized = JSON.stringify(evidence);
  assert.doesNotMatch(serialized, /orderNo|productOrder|phone|address|recipient|name":/i);
});
