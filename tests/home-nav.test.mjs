import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const nav = fs.readFileSync(new URL("../app/TodayHomeNav.js", import.meta.url), "utf8");
const layout = fs.readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");

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
