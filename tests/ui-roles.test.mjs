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

test("홈 우선 상품은 숫자와 판단, 다음 확인을 시각적으로 분리한다", async () => {
  const home = await readFile(new URL("../app/HomeMdBriefing.js", import.meta.url), "utf8");

  assert.match(home, /className="metric-grid"/);
  assert.match(home, />주문 반응</);
  assert.match(home, />실제 판매</);
  assert.match(home, />현재 재고</);
  assert.match(home, /className="decision-box"/);
  assert.match(home, />현재 판단</);
  assert.match(home, /className="next-box"/);
  assert.match(home, />다음 확인</);
  assert.match(home, />판단 근거 자세히 보기</);
  assert.doesNotMatch(home, /className="numbers"/);
});


test("사입 판단은 최근 30일 판매 상품만 보여주고 최근 판매일을 표시한다", async () => {
  const analysis = await readFile(new URL("../app/analysis/page.js", import.meta.url), "utf8");

  assert.match(analysis, /filter\(\(row\) => \(row\.q30 \|\| 0\) > 0\)/);
  assert.match(analysis, />최근 판매일</);
  assert.doesNotMatch(analysis, />판매된 날짜</);
  assert.doesNotMatch(analysis, /<b>\{rows\.length\}개<\/b>/);
});
