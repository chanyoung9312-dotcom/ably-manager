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

test("홈은 오늘 처리할 업무 순서와 우선 상품만 보여준다", async () => {
  const home = await readFile(new URL("../app/HomeMdBriefing.js", import.meta.url), "utf8");

  assert.match(home, /aria-label="오늘 업무 순서"/);
  assert.match(home, />주문 확인</);
  assert.match(home, />출고 준비</);
  assert.match(home, />사입 확인</);
  assert.match(home, />매출 확인</);
  assert.match(home, /filter\(\(p\)=>\(p\.q30\|\|0\)>0\)/);
  assert.match(home, />최근 주문</);
  assert.match(home, />오늘 할 일</);
  assert.match(home, />전체 사입 판단 보기 →</);
  assert.doesNotMatch(home, /판단 근거 자세히 보기/);
  assert.doesNotMatch(home, /나머지 상품/);
  assert.doesNotMatch(home, /상품 판단 현황/);
});


test("사입 판단은 최근 30일 판매 상품만 보여주고 최근 판매일을 표시한다", async () => {
  const analysis = await readFile(new URL("../app/analysis/page.js", import.meta.url), "utf8");

  assert.match(analysis, /filter\(\(row\) => \(row\.q30 \|\| 0\) > 0\)/);
  assert.match(analysis, />최근 판매일</);
  assert.doesNotMatch(analysis, />판매된 날짜</);
  assert.doesNotMatch(analysis, /<b>\{rows\.length\}개<\/b>/);
});


test("루트 운영 화면은 모바일에서도 다크 카드와 글자 대비를 유지한다", async () => {
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");

  assert.match(css, /body\.oars-root-page\s*\{/);
  assert.match(css, /background:\s*#15191b/);
  assert.match(css, /body\.oars-root-page \.md-report/);
  assert.match(css, /color:\s*#f3f4f6/);
  assert.match(css, /body\.oars-root-page \.card/);
  assert.match(css, /body\.oars-root-page textarea/);
});
