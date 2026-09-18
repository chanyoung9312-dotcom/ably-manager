import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyProductName, TAXONOMY_VERSION } from "../lib/sourcing-taxonomy.mjs";

// Independent expectations copied from the completed name-by-name audit,
// never generated from classifier output. Contains product data, no customers.
const snapshot = JSON.parse(readFileSync(new URL("./fixtures/sourcing-taxonomy-md-271.json", import.meta.url), "utf8"));
const fields = ["length", "fitEase", "silhouette", "widthShape", "design", "neckline", "pattern", "materialExpression", "garmentForm"];
const sorted = (values) => [...values].sort();
const classify = (name, productNo = null) => classifyProductName(name, { productNo });
const tags = (name, field) => classify(name).attributes[field].values;

function expectedAttributes(text) {
  const out = Object.fromEntries(fields.map((field) => [field, []]));
  if (text === "미확인") return out;
  const labels = { 기장: "length", 디자인: "design", 넥라인: "neckline", 패턴: "pattern", 소재표현: "materialExpression", 형태: "garmentForm" };
  const fitFields = { 슬림: "fitEase", 루즈: "fitEase", 오버핏: "fitEase", 박시: "fitEase", 와이드: "widthShape", 일자: "widthShape" };
  for (const section of text.split("; ")) {
    const [label, values] = section.split(": ");
    for (const entry of values.split(", ")) {
      const tag = entry.split("←")[0];
      out[label === "핏" ? fitFields[tag] || "silhouette" : labels[label]].push(tag);
    }
  }
  return out;
}

function expectedBase(secondary) {
  if (/원피스/.test(secondary)) return "원피스";
  return secondary.replace("(세부미확인)", "");
}

for (const product of snapshot.products) {
  test(`MD snapshot row ${product.row}: category and every confirmed attribute`, () => {
    const r = classifyProductName(product.product, { productNo: product.productNo, sourceKey: `MD:${product.row}` });
    assert.equal(r.originalName, product.product);
    assert.equal(r.primaryCategory, product.expected.primaryCategory, product.product);
    assert.equal(r.baseType, expectedBase(product.expected.secondaryCategory), product.product);
    assert.equal(r.secondaryCategory, product.expected.secondaryCategory, product.product);
    const expected = expectedAttributes(product.expected.attributes);
    for (const field of fields) {
      assert.deepEqual(sorted(r.attributes[field].values), sorted(expected[field]), `${product.product}: ${field}`);
      // Every accepted tag must be traceable to this exact name, not an inferred feature.
      for (const value of r.attributes[field].values) {
        assert.ok(r.evidence.some((e) => e.field === `attributes.${field}` && e.value === value && e.scope === "product"));
      }
    }
    assert.equal(r.orderLinkStatus, product.productNo ? "linked" : "unlinked");
    for (const e of r.evidence) {
      assert.equal(product.product.slice(e.start, e.end), e.keyword);
      assert.ok(e.ruleId);
      assert.ok(e.basis === "explicit" || e.basis === "normalized");
    }
  });
}

test("all 271 cards meet the independently validated coverage, conflicts and options", () => {
  const results = snapshot.products.map((p) => classifyProductName(p.product, p));
  assert.equal(results.length, 271);
  assert.equal(results.filter((r) => r.primaryCategory !== "미확인").length, 268);
  assert.equal(results.filter((r) => r.baseType !== "미확인").length, 263);
  const categoryReview = results.filter((r) => r.review.some((i) => i.code === "CATEGORY_CONFLICT" || i.code === "MIXED_SALE_COMPOSITION"));
  assert.deepEqual(sorted(categoryReview.map((r) => r.productNo)), sorted([
    "76538098", "76537982", "75409731", "75319577", "68914084", "68460262", "68311174", "67225964",
  ]));
  const conflictingAttributes = results.filter((r) => r.review.some((i) => i.code === "ATTRIBUTE_CONFLICT"));
  assert.deepEqual(sorted(conflictingAttributes.map((r) => r.productNo)), sorted(["70339350", "70240590", "69357544", "67431067"]));
  assert.deepEqual(sorted(results.filter((r) => r.optionAttributes.length.status === "option").map((r) => r.productNo)), sorted(["70339341", "69382270", "69357543"]));
  const primaryCounts = {};
  results.forEach((r) => { primaryCounts[r.primaryCategory] = (primaryCounts[r.primaryCategory] || 0) + 1; });
  assert.deepEqual(primaryCounts, { 하의: 122, 아우터: 8, 상의: 89, 세트: 13, 원피스: 30, 가방: 5, 미확인: 3, 기타: 1 });
  const missingIds = results.filter((r) => r.orderLinkStatus === "unlinked");
  assert.equal(missingIds.length, 10);
  assert.ok(missingIds.every((r) => r.primaryCategory !== "미확인"));
});

for (const [name, primary, base, field, value] of [
  ["셔츠원피스", "원피스", "원피스", "garmentForm", "셔츠형"],
  ["니트가디건", "아우터", "가디건", "materialExpression", "니트"],
  ["니트카디건", "아우터", "가디건", "materialExpression", "니트"],
  ["니트티셔츠", "상의", "티셔츠", "materialExpression", "니트"],
  ["니트 티 셔츠", "상의", "티셔츠", "materialExpression", "니트"],
  ["니트나시", "상의", "나시·슬리브리스", "materialExpression", "니트"],
  ["니트 스커트", "하의", "스커트", "materialExpression", "니트"],
]) {
  test(`compound decomposition: ${name}`, () => {
    const r = classify(name);
    assert.equal(r.primaryCategory, primary);
    assert.equal(r.baseType, base);
    assert.ok(r.attributes[field].values.some((v) => v === value));
  });
}

for (const [name, base] of [
  ["하이웨스트 워싱 데님 백포켓 숏팬츠 핫팬츠", "숏·하프팬츠"],
  ["셔츠묶음 레이어드 플레어 숏스커트", "스커트"],
  ["셔츠형 랩 블라우스", "블라우스"],
  ["속바지내장 미니스커트", "스커트"],
  ["데님 치마바지 생지 미니스커트", "치마바지"],
  ["캉캉 프릴 미니 스커트 치마바지", "치마바지"],
  ["나시 티셔츠", "나시·슬리브리스"],
]) {
  test(`specific noun and exclusions: ${name}`, () => assert.equal(classify(name).baseType, base));
}

for (const belt of ["벨트세트", "벨트셋트", "벨트SET", "벨트 SET", "벨트 set"]) {
  test(`${belt} is an accessory, not a clothing set`, () => {
    const r = classify(`${belt} 롱 원피스`);
    assert.equal(r.baseType, "원피스");
    assert.equal(r.saleComposition, "single");
    assert.deepEqual(r.accessoryBundle, ["벨트"]);
  });
}

test("strap/flap substrings do not produce a wrap tag; explicit wrap still does", () => {
  assert.deepEqual(tags("로프 스트랩 미니백", "design"), []);
  assert.deepEqual(tags("언발 플랩 미니스커트", "design"), []);
  assert.deepEqual(tags("언발 플랩 랩 미니스커트", "design"), ["랩"]);
});

test("collar/neck width is not body fit and a negative collar is not a collar", () => {
  assert.deepEqual(tags("와이드카라 셔츠 블라우스", "widthShape"), []);
  const r = classify("와이드 라운드 유넥 슬림 반팔 티셔츠");
  assert.deepEqual(r.attributes.widthShape.values, []);
  assert.equal(r.attributes.neckline.status, "conflict");
  assert.deepEqual(tags("노카라 자켓", "neckline"), ["노카라"]);
  assert.deepEqual(tags("와이드 팬츠", "widthShape"), ["와이드"]);
});

test("sleeve length and bag size do not become garment length", () => {
  assert.equal(classify("롱슬리브 티셔츠").attributes.length.status, "unknown");
  for (const name of ["미니백", "미디 숄더백"]) {
    const r = classify(name);
    assert.equal(r.primaryCategory, "가방");
    assert.equal(r.attributes.length.status, "not_applicable");
    assert.deepEqual(r.attributes.length.values, []);
  }
});

test("marketing and texture expressions do not invent fit, pattern or fibre", () => {
  const r = classify("여리핏 인생핏 체형커버 주문폭주 골지 실키 바스락 티셔츠");
  for (const field of fields) assert.deepEqual(r.attributes[field].values, []);
  assert.equal(r.attributes.pattern.status, "unknown");
  assert.deepEqual(tags("무지 티셔츠", "pattern"), ["무지"]);
});

test("mini/long are options, not conflicting or two counted lengths", () => {
  const r = classify("[미니&롱/벨트세트] 브이넥 셔링 원피스");
  assert.equal(r.secondaryCategory, "원피스(기장선택)");
  assert.equal(r.attributes.length.status, "option");
  assert.deepEqual(r.attributes.length.values, []);
  assert.deepEqual(r.optionAttributes.length.choices, ["미니", "롱"]);
  assert.ok(!r.review.some((i) => i.code === "ATTRIBUTE_CONFLICT"));
  assert.ok(r.evidence.filter((e) => e.field === "attributes.length").every((e) => e.scope === "option"));
});

test("unspecified length choices stay unknown", () => {
  const r = classify("[기장선택] 체크 원피스");
  assert.equal(r.optionAttributes.length.status, "option");
  assert.equal(r.optionAttributes.length.choices, null);
  assert.deepEqual(r.attributes.length.values, []);
});

test("field conflicts preserve candidates without withholding other fields", () => {
  const r = classify("슬림 루즈핏 스트라이프 티셔츠");
  assert.equal(r.baseType, "티셔츠");
  assert.equal(r.attributes.fitEase.status, "conflict");
  assert.deepEqual(r.attributes.fitEase.values, []);
  assert.deepEqual(r.attributes.fitEase.candidates, ["슬림", "루즈"]);
  assert.deepEqual(r.attributes.pattern.values, ["스트라이프"]);
  assert.equal(classify("미디 롱 스커트").attributes.length.status, "conflict");
  assert.equal(classify("라운드 스퀘어넥 나시").attributes.neckline.status, "conflict");
  assert.equal(classify("롱 맥시 스커트").attributes.length.status, "confirmed");
  assert.equal(classify("와이드 일자 팬츠").attributes.widthShape.status, "confirmed");
  assert.equal(classify("A라인 플레어 스커트").attributes.silhouette.status, "confirmed");
});

for (const [name, primary] of [
  ["셔츠 블라우스", "상의"], ["블라우스 셔츠", "상의"],
  ["셔츠 자켓", "미확인"], ["자켓 셔츠", "미확인"],
  ["카디건 티셔츠", "미확인"], ["티셔츠 가디건", "미확인"],
]) {
  test(`competing nouns never use last-token priority: ${name}`, () => {
    const r = classify(name);
    assert.equal(r.primaryCategory, primary);
    assert.equal(r.baseType, "미확인");
    assert.ok(r.review.some((i) => i.code === "CATEGORY_CONFLICT"));
  });
}

test("mixed single/set listing withholds both categories and common attributes", () => {
  const r = classify("[단품/세트] 리본 블라우스 + 프릴 롱 스커트 셋업");
  assert.equal(r.saleComposition, "mixedSingleSet");
  assert.equal(r.primaryCategory, "미확인");
  assert.equal(r.baseType, "미확인");
  assert.equal(r.attributes.design.status, "unscoped");
  assert.deepEqual(r.attributes.design.values, []);
});

test("set component attributes are evidence only, not top-level product facts", () => {
  const r = classify("레이스 브이넥 니트 + 체크 캉캉 롱 스커트 투피스 세트");
  assert.equal(r.primaryCategory, "세트");
  assert.equal(r.baseType, "의류세트");
  assert.equal(r.saleComposition, "clothingSet");
  for (const field of fields) assert.deepEqual(r.attributes[field].values, []);
  assert.deepEqual(r.attributes.materialExpression.candidates, ["니트"]);
  assert.deepEqual(r.attributes.pattern.candidates, ["체크"]);
  assert.ok(r.evidence.filter((e) => /^attributes\./.test(e.field)).every((e) => e.scope === "component_unassigned"));
});

test("explicit aliases retain exact original evidence and offsets", () => {
  const name = "  🩶 V넥 단가라 카디건  ";
  const r = classify(name);
  assert.equal(r.originalName, name);
  assert.equal(r.baseType, "가디건");
  assert.deepEqual(r.attributes.neckline.values, ["브이넥"]);
  assert.deepEqual(r.attributes.pattern.values, ["스트라이프"]);
  for (const word of ["V넥", "단가라", "카디건"]) {
    assert.ok(r.evidence.some((e) => e.keyword === word && e.basis === "normalized"));
  }
  for (const e of r.evidence) assert.equal(name.slice(e.start, e.end), e.keyword);
});

test("one invalid name or ID does not interrupt other products; no inferred order link", () => {
  const names = [null, "원피스", undefined, 123, "  ", "티셔츠"];
  const results = names.map((name) => classify(name));
  assert.equal(results[1].baseType, "원피스");
  assert.equal(results[5].baseType, "티셔츠");
  for (const index of [0, 2, 3, 4]) {
    assert.ok(results[index].review.some((i) => i.scope === "product" && i.code === "INVALID_PRODUCT_NAME"));
  }
  const invalidId = classify("롱 원피스", { malformed: true });
  assert.equal(invalidId.baseType, "원피스");
  assert.equal(invalidId.orderLinkStatus, "unlinked");
  assert.ok(invalidId.review.some((i) => i.field === "productNo"));
  const sameName = [classify("원피스", "123"), classify("원피스")];
  assert.equal(sameName[1].orderLinkStatus, "unlinked");
  for (const r of sameName) {
    for (const field of ["sales", "netQty", "cancelQty", "score", "decision"]) assert.ok(!Object.hasOwn(r, field));
  }
});

test("deterministic, JSON-safe, independent outputs with no input mutations", () => {
  const identity = Object.freeze({ productNo: "00123", sourceKey: "MD:D153" });
  const first = classifyProductName("니트 가디건", identity);
  assert.equal(first.productNo, "00123");
  assert.equal(first.taxonomyVersion, TAXONOMY_VERSION);
  assert.deepEqual(first, JSON.parse(JSON.stringify(first)));
  assert.deepEqual(first, classifyProductName("니트 가디건", identity));
  first.attributes.materialExpression.values.push("invented");
  assert.deepEqual(classifyProductName("니트 가디건", identity).attributes.materialExpression.values, ["니트"]);
  assert.equal(classifyProductName("스커트", null).baseType, "스커트");
});
