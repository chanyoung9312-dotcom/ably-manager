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
