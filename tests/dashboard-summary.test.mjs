import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCommerce, parseSalesRows } from "../lib/commerce.mjs";

const orderHeaders = [
  "결제일",
  "상품주문번호",
  "주문번호",
  "상품번호",
  "상품명",
  "수량",
  "판매가",
  "주문상태",
];
const claimHeaders = [...orderHeaders, "발주일"];
const order = (id, status, date) => [
  date,
  id,
  `order-${id}`,
  "p1",
  "테스트 상품",
  1,
  20000,
  status,
];

test("취소 반품 시트의 발주일 기준으로 발주 전·후 취소를 분류한다", () => {
  const orders = [
    orderHeaders,
    order("before", "배송준비중", "2026-09-10"),
    order("after", "배송중", "2026-09-11"),
  ];
  const claims = [
    claimHeaders,
    [...order("before", "결제 완료", "2026-09-10"), "취소"],
    [...order("after", "상품 준비중", "2026-09-11"), "0911"],
  ];
  const result = buildCommerce(orders, claims, [], [], { salesMode: "unit" });
  assert.deepEqual(
    result.claims.map((claim) => [claim.productOrder, claim.type]),
    [
      ["before", "before"],
      ["after", "after"],
    ],
  );
  assert.equal(result.cancels.length, 0);
});

test("매출 화면은 취소를 하나로 합치고 취소 반품 시트 매칭 건을 표시한다", () => {
  const source = fs.readFileSync(
    new URL("../app/dashboard/page.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /const claims = \(data\.claims \|\| \[\]\)\.filter\(inPeriod\)/);
  assert.match(source, /const cancel = claims\.filter\(isCancellationClaim\)/);
  assert.match(source, /const returns = claims\.filter\(\(item\) => !isCancellationClaim\(item\)\)/);
  assert.match(source, />취소</);
  assert.match(source, />반품</);
  assert.match(source, />실매출</);
  assert.match(source, /취소·반품 시트와 원주문이 매칭된 건/);
  assert.doesNotMatch(source, />발주 전 취소</);
  assert.doesNotMatch(source, />발주 후 취소</);
  assert.doesNotMatch(source, />볼 기간</);
  assert.doesNotMatch(source, />매출 흐름</);
  assert.doesNotMatch(source, />최종 판매</);
});


test("판매가 총매출은 같은 상품주문번호가 중복되어도 원본 행 기준으로 합산한다", () => {
  const rows = [
    orderHeaders,
    order("dup", "배송중", "2026-06-04"),
    order("dup", "상품 준비중", "2026-06-04"),
  ];
  const salesRows = parseSalesRows(rows, "line");
  assert.equal(salesRows.length, 2);
  assert.equal(salesRows.reduce((total, row) => total + row.sales, 0), 40000);
});

test("매출 화면은 salesRows를 우선 사용한다", () => {
  const source = fs.readFileSync(
    new URL("../app/dashboard/page.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /const salesRows = data\.salesRows \|\| data\.orders/);
  assert.match(source, /const orders = salesRows\.filter\(inPeriod\)/);
});
