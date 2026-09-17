import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const reaction = fs.readFileSync(new URL("../app/product-reaction/page.js", import.meta.url), "utf8");
const products = fs.readFileSync(new URL("../app/products/page.js", import.meta.url), "utf8");

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

test("재고 화면은 사입 판단과 분리해 수량·옵션 관리에 집중한다", () => {
  assert.match(products, />재고 현황</);
  assert.match(products, />현재 재고</);
  assert.match(products, />옵션별 재고 보기</);
  assert.doesNotMatch(products, />재고 여유</);
  assert.doesNotMatch(products, /<div className="inventory-list-head"><h2>상품 재고<\/h2><span>/);
  assert.doesNotMatch(products, /<table>/);
  assert.doesNotMatch(products, />사입 검토</);
  assert.doesNotMatch(products, />추가 주문 중단</);
});
