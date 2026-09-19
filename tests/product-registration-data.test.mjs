import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCafe24Description,
  makeOptionGroups,
  normalizeProductTags,
  parseRegistrationPaste,
} from "../lib/product-registration-data.mjs";

test("registration paste keeps one-copy workflow readable", () => {
  const parsed = parseRegistrationPaste(`
[OARS 등록용]
상품명: [가을신상] 슬림 골지 니트
판매가: 29900
공급가: 12000
색상: 블랙, 크림 / 브라운
사이즈: FREE
해시태그: #골지니트, 가을니트, 데일리룩
상세페이지 문구:
부드럽게 떨어지는 골지 라인이 포인트예요.
데일리로 가볍게 입기 좋아요.
[OARS 끝]
`);
  assert.equal(parsed.productName, "[가을신상] 슬림 골지 니트");
  assert.equal(parsed.price, "29900");
  assert.equal(parsed.supplyPrice, "12000");
  assert.equal(parsed.colors, "블랙, 크림, 브라운");
  assert.equal(parsed.sizes, "FREE");
  assert.equal(parsed.hashtags, "골지니트, 가을니트, 데일리룩");
  assert.match(parsed.description, /부드럽게 떨어지는/);
  assert.match(parsed.description, /데일리로/);
});

test("option groups are only made for values that exist", () => {
  assert.deepEqual(makeOptionGroups("블랙, 크림", "S,M"), [
    { name: "색상", values: ["블랙", "크림"] },
    { name: "사이즈", values: ["S", "M"] },
  ]);
  assert.deepEqual(makeOptionGroups("", "FREE"), [
    { name: "사이즈", values: ["FREE"] },
  ]);
});

test("Cafe24 description escapes copy but keeps uploaded image paths", () => {
  const html = buildCafe24Description(
    "가볍게 <입는> 데일리웨어",
    ["https://img.test/detail-1.jpg"],
  );
  assert.match(html, /가볍게 &lt;입는&gt; 데일리웨어/);
  assert.match(html, /https:\/\/img\.test\/detail-1\.jpg/);
  assert.doesNotMatch(html, /<입는>/);
});

test("product tags remove hash signs and cap at 100", () => {
  const tags = normalizeProductTags(
    Array.from({ length: 105 }, (_, i) => `#태그${i}`).join(","),
  );
  assert.equal(tags.length, 100);
  assert.equal(tags[0], "태그0");
});
