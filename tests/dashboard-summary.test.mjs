import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCommerce } from "../lib/commerce.mjs";

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
  // 주문상태가 아직 취소 완료가 아니어도 취소 현황에는 남아야 한다.
  assert.equal(result.cancels.length, 0);
});

test("매출 화면은 전체 취소 현황을 표시하고 확정 건만 실매출에서 차감한다", () => {
  const source = fs.readFileSync(
    new URL("../app/dashboard/page.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /const claims = \(data\.claims \|\| \[\]\)\.filter\(inPeriod\)/);
  assert.match(source, /const confirmed = \(data\.cancels \|\| \[\]\)\.filter\(inPeriod\)/);
  assert.match(source, />기간</);
  assert.match(source, />매출 현황</);
  assert.match(source, />실매출</);
  assert.doesNotMatch(source, />볼 기간</);
  assert.doesNotMatch(source, />매출 흐름</);
  assert.doesNotMatch(source, />최종 판매</);
});
