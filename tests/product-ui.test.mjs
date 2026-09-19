import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reaction = fs.readFileSync(new URL("../app/product-reaction/page.js", import.meta.url), "utf8");
const products = fs.readFileSync(new URL("../app/products/page.js", import.meta.url), "utf8");
const analysis = fs.readFileSync(new URL("../app/analysis/page.js", import.meta.url), "utf8");

test("상품 반응 화면은 상태·핵심 수치·할 일 중심으로 구성한다", () => {
  assert.match(reaction, />현재 상태</);
  assert.match(reaction, />지금 할 일</);
  assert.match(reaction, />최근 7일</);
  assert.match(reaction, />최근 30일</);
  assert.match(reaction, />상세 보기</);
  assert.doesNotMatch(reaction, />초기 반응</);
  assert.doesNotMatch(reaction, />유효 판매</);
  assert.doesNotMatch(reaction, />미확정 클레임</);
});

test("재고 화면은 재고 현황 시트의 실제 보유 재고만 보여준다", () => {
  assert.match(products, />재고 현황</);
  assert.match(products, /row\.stock !== null && row\.stock > 0/);
  assert.match(products, /option\.qty !== null && option\.qty > 0/);
  assert.match(products, />재고 보유 상품</);
  assert.match(products, />전체 보유 재고</);
  assert.match(products, />옵션별 재고 보기</);
  assert.doesNotMatch(products, />재고 여유</);
  assert.doesNotMatch(products, />품절</);
  assert.doesNotMatch(products, />재고 확인 필요</);
  assert.doesNotMatch(products, />사입 검토</);
  assert.doesNotMatch(products, />추가 주문 중단</);
  assert.doesNotMatch(products, /<table>/);
});


test("상품 분석 화면은 취소를 발주 전후로 나누지 않고 취소·반품만 집계한다", () => {
  assert.match(analysis, /claim\.kind === "cancel"/);
  assert.match(analysis, /claim\.kind === "return"/);
  assert.match(analysis, /<span>취소<\/span><b>{summary\.cancels}건<\/b>/);
  assert.match(analysis, /<span>반품<\/span><b>{summary\.returns}건<\/b>/);
  assert.doesNotMatch(analysis, /발주 전 취소/);
  assert.doesNotMatch(analysis, /발주 후 취소/);
  assert.doesNotMatch(analysis, /구분 확인/);
});
