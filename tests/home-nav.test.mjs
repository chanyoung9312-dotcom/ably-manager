import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const nav = fs.readFileSync(new URL("../app/TodayHomeNav.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
const home = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const featurePages = [
  "../app/products/page.js",
  "../app/product-reaction/page.js",
  "../app/product-match/page.js",
  "../app/analysis/page.js",
  "../app/sourcing/page.js",
  "../app/product-registration/page.js",
].map((path) => fs.readFileSync(new URL(path, import.meta.url), "utf8"));

test("global navigation always exposes a direct home action", () => {
  assert.match(nav, /← 홈/);
  assert.match(nav, /aria-label="홈으로 돌아가기"/);
  assert.match(nav, /onClick=\{\(\) => go\("\/"\)\}/);
});

test("root layout mounts the global navigation on every route", () => {
  assert.match(layout, /import TodayHomeNav from "\.\/TodayHomeNav"/);
  assert.match(layout, /<TodayHomeNav\s*\/?>/);
});

test("mobile layout keeps the home action visible", () => {
  assert.match(nav, /\.oars-home\{[^}]*white-space:nowrap/);
  assert.doesNotMatch(nav, /\.oars-home\{[^}]*display:none/);
});

test("query tool navigation resolves sms, post, and tracking modes", () => {
  assert.match(nav, /\["주문·배송", "\/\?tool=sms"\]/);
  assert.match(nav, /\["우체국 엑셀", "\/\?tool=post"\]/);
  assert.match(nav, /\["송장 매칭", "\/\?tool=tracking"\]/);
  assert.match(nav, /window\.location\.assign\(href\)/);
  assert.match(home, /\["sms", "post", "tracking"\]\.includes\(tool\)/);
  // Root-page duplicate buttons were removed; the global menu owns navigation.
  assert.match(nav, /onClick=\{\(\) => go\(href\)\}/);
  assert.match(home, /setMode\(\["sms", "post", "tracking"\]\.includes\(tool\) \? tool : "home"\)/);
});

test("feature pages rely on the single global home action", () => {
  for (const page of featurePages) {
    assert.doesNotMatch(page, /← OARS Manager/);
  }
});


test("product registration helper keeps VVIC ZIP processing local and human-confirmed", () => {
  const page = fs.readFileSync(new URL("../app/product-registration/page.js", import.meta.url), "utf8");
  assert.match(page, /VVIC ZIP 정리 도우미/);
  assert.match(page, /외부 업로드 없음/);
  assert.match(page, /폴더명은 공급처마다 다를 수 있어 자동 확정하지 않습니다/);
  assert.match(page, /메인·GIF용/);
  assert.match(page, /상세이미지/);
  assert.match(page, /사이즈 참고/);
  assert.match(page, /무시/);
  assert.match(page, /상단 자르기/);
  assert.match(page, /정리 완료 ZIP 저장/);
  assert.match(page, /상품정보 생성 준비/);
  assert.match(page, /ChatGPT에서 상품정보 만들기/);
  assert.match(page, /ChatGPT 결과 붙여넣기/);
  assert.match(page, /카페24 등록용 상품정보/);
  assert.match(page, /buildStoredZip/);
  assert.doesNotMatch(page, /fetch\(/);
});
