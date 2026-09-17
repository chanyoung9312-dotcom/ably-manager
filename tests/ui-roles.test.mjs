import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("MD와 재고 화면 역할을 분리하고 취소 유형을 표시한다", async () => {
  const analysis = await readFile(new URL("../app/analysis/page.js", import.meta.url), "utf8");
  const products = await readFile(new URL("../app/products/page.js", import.meta.url), "utf8");
  const nav = await readFile(new URL("../app/TodayHomeNav.js", import.meta.url), "utf8");

  assert.match(analysis, /발주 전 취소/);
  assert.match(analysis, /발주 후 취소/);
  assert.match(analysis, /취소 반품 시트에 기록된 건 기준/);
  assert.match(analysis, /사입 판단/);

  assert.match(products, /재고 현황/);
  assert.match(products, /옵션별 재고 보기/);
  assert.doesNotMatch(products, /사입 검토/);
  assert.doesNotMatch(products, /추가 주문 중단/);

  assert.match(nav, /사입 판단/);
  assert.match(nav, /재고 현황/);
});
