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

test("상품별 판매 화면은 긴 표 대신 카드형 핵심 정보만 먼저 보여준다", () => {
  assert.match(products, />상품별 판매 현황</);
  assert.match(products, />다음 할 일</);
  assert.match(products, />상세 보기</);
  assert.doesNotMatch(products, /<table>/);
  assert.doesNotMatch(products, /"순판매 누계"/);
  assert.doesNotMatch(products, /"MD 판단"/);
});
