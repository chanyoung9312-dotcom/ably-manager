import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductInfoPrompt,
  formatHashtags,
  formatSizeRows,
  parseProductInfoDraft,
} from "../lib/product-registration.mjs";

test("product info prompt keeps the no-paid-API semi-auto workflow explicit", () => {
  const prompt = buildProductInfoPrompt({
    zipName: "sample_정리완료.zip",
    mainCount: 4,
    detailCount: 8,
    hasSizeReference: true,
  });
  assert.match(prompt, /20대 초반~중반 여성/);
  assert.match(prompt, /상품명.*3개/);
  assert.match(prompt, /해시태그.*30개/);
  assert.match(prompt, /둘레.*단면/);
  assert.match(prompt, /sample_정리완료\.zip/);
  assert.match(prompt, /사이즈 참고 이미지: 있음/);
});

test("ChatGPT JSON result is normalized for registration fields", () => {
  const draft = parseProductInfoDraft(`\`\`\`json
{
  "productNames": ["첫번째", "두번째", "세번째", "네번째"],
  "detailText": "복붙 문구",
  "hashtags": ["#원피스", " 데일리룩 "],
  "colors": ["블랙", "아이보리"],
  "sizeRows": [
    {"size":"FREE","values":{"가슴단면":"45","총길이":"82"}}
  ],
  "notes": "소재 확인 필요"
}
\`\`\``);
  assert.deepEqual(draft.productNames, ["첫번째", "두번째", "세번째"]);
  assert.equal(draft.detailText, "복붙 문구");
  assert.deepEqual(draft.hashtags, ["원피스", "데일리룩"]);
  assert.deepEqual(draft.colors, ["블랙", "아이보리"]);
  assert.equal(formatHashtags(draft.hashtags), "원피스, 데일리룩");
  assert.equal(formatSizeRows(draft.sizeRows), "FREE | 가슴단면 45 | 총길이 82");
  assert.equal(draft.notes, "소재 확인 필요");
});

test("invalid pasted content gives a useful error", () => {
  assert.throws(
    () => parseProductInfoDraft("이건 JSON이 아님"),
    /JSON 형식을 읽지 못했습니다/,
  );
});
