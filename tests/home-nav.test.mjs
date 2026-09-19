import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const nav = fs.readFileSync(new URL("../app/TodayHomeNav.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
const home = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const registrationPanel = fs.readFileSync(
  new URL("../app/product-registration/Cafe24RegistrationPanel.js", import.meta.url),
  "utf8",
);
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


test("product registration helper keeps desktop folder and ZIP processing local and human-confirmed", () => {
  const page = fs.readFileSync(new URL("../app/product-registration/page.js", import.meta.url), "utf8");
  assert.match(page, /VVIC 상품 이미지 정리 도우미/);
  assert.match(page, /압축 푼 상품 폴더 열기/);
  assert.match(page, /webkitdirectory/);
  assert.match(page, /showDirectoryPicker/);
  assert.match(page, /정리 폴더 저장/);
  assert.match(page, /ZIP 저장/);
  assert.match(page, /이미지 정리는 로컬 처리/);
  assert.match(page, /폴더명은 공급처마다 다를 수 있어 자동 확정하지 않습니다/);
  assert.match(page, /메인·GIF용/);
  assert.match(page, /상세이미지/);
  assert.match(page, /사이즈 참고/);
  assert.match(page, /무시/);
  assert.match(page, /상단 자르기/);
  assert.match(page, /grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(page, /@media\(max-width:850px\)\{\.image-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)\}/);
  assert.match(page, /ChatGPT 분석/);
  assert.match(page, /OARS 등록용 블록/);
  assert.match(page, /Cafe24RegistrationPanel/);
  assert.match(registrationPanel, /ChatGPT 상품정보 붙여넣기/);
  assert.match(registrationPanel, /내용 채우기/);
  assert.match(registrationPanel, /카페24 등록/);
  assert.match(registrationPanel, /진열함 · 판매함/);
  assert.match(registrationPanel, /카페24 권한 다시 연결/);
  assert.match(registrationPanel, /window\.open\("\/api\/cafe24\/connect"/);
  assert.match(registrationPanel, /\/api\/cafe24\/product-image/);
  assert.match(registrationPanel, /\/api\/cafe24\/products/);
  assert.match(page, /buildStoredZip/);
  assert.doesNotMatch(page, /fetch\(/);
});
