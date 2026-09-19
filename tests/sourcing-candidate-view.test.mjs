import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { buildSourcingCandidates } from "../lib/sourcing-candidates.mjs";
import {
  buildSourcingCandidateView,
  CANDIDATE_LANE_COPY,
  CANDIDATE_HINT_COPY,
} from "../lib/sourcing-candidate-view.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);
const candidateResult = buildSourcingCandidates({ diagnostics });
const view = buildSourcingCandidateView(candidateResult);

const lane = (key) => {
  const found = view.lanes.find((item) => item.key === key);
  assert.ok(found, key);
  return found;
};

const card = (key, groupId) => {
  const found = lane(key).items.find((item) => item.groupId === groupId);
  assert.ok(found, key + ":" + groupId);
  return found;
};

test("candidate lane and hint enums map to neutral Korean copy", () => {
  assert.equal(CANDIDATE_LANE_COPY.review_candidate.label, "소싱 검토 후보");
  assert.equal(CANDIDATE_LANE_COPY.hit_reference.label, "히트 구조 참고");
  assert.equal(CANDIDATE_LANE_COPY.emerging_watch.label, "추가 관찰");
  assert.equal(CANDIDATE_LANE_COPY.data_hold.label, "데이터 보류");
  assert.equal(CANDIDATE_HINT_COPY.supported_hint.label, "반복 관측");
  assert.equal(CANDIDATE_HINT_COPY.emerging_hint.label, "초기 관측");
  assert.equal(CANDIDATE_HINT_COPY.concentrated_hint.label, "특정 상품 근거");
});

test("candidate view explicitly states that it is not ranking or purchase instruction", () => {
  assert.match(view.notice, /추천 순위·사입 지시·구매 수량이 아닙니다/);
  assert.deepEqual(view.rules, {
    scoreUsed: false,
    rankingUsed: false,
    automaticAction: false,
  });
});

test("shorts appear in sourcing review candidates with factual evidence", () => {
  const shorts = card("review_candidate", "baseType:숏·하프팬츠");
  assert.equal(shorts.label, "숏·하프팬츠");
  assert.equal(shorts.facts.linkedProducts, 27);
  assert.equal(shorts.facts.reactingProducts, 8);
  assert.equal(shorts.facts.repeatedDateProducts, 2);
  assert.equal(shorts.facts.recent30ActiveProducts, 3);
  assert.equal(shorts.facts.top2Share, 0.5);
  assert.match(shorts.narrative, /소싱 검토 후보 조건을 충족합니다/);
});

test("long dress remains a hit reference and keeps equivalent aliases", () => {
  const longDress = card("hit_reference", "secondaryCategory:롱원피스");
  assert.equal(longDress.facts.top2Share, 176 / 178);
  assert.ok(longDress.aliases.includes("원피스 ∩ 롱"));
  assert.match(longDress.narrative, /품목 전체의 재현 가능한 성과로 일반화하지 않고/);
});

test("data-hold copy does not turn zero observations into product failure", () => {
  const knit = card("data_hold", "baseType:니트");
  assert.equal(knit.facts.reactingProducts, 0);
  assert.match(knit.narrative, /실패나 낮은 상품성으로 판단하지 않습니다/);
});

test("combination hints stay attached to item cards with their own evidence state", () => {
  const shorts = card("review_candidate", "baseType:숏·하프팬츠");
  const denimShorts = shorts.attributeHints.find(
    (hint) => hint.groupId === "combination:숏·하프팬츠 ∩ 데님",
  );
  assert.ok(denimShorts);
  assert.equal(denimShorts.stateLabel, "초기 관측");

  const pants = card("hit_reference", "baseType:팬츠");
  const widePants = pants.attributeHints.find(
    (hint) => hint.groupId === "combination:팬츠 ∩ 와이드",
  );
  assert.ok(widePants);
  assert.equal(widePants.stateLabel, "특정 상품 근거");
});

test("attributes never become independent cards in the candidate board", () => {
  const allCards = view.lanes.flatMap((item) => item.items);
  assert.ok(!allCards.some((item) => item.groupId.startsWith("attribute:")));
  assert.ok(!allCards.some((item) => item.groupId.startsWith("combination:")));
  assert.ok(allCards.every((item) => item.groupId.startsWith("baseType:") || item.groupId.startsWith("secondaryCategory:")));
});

test("lane sorting uses observations only and exposes no numeric rank", () => {
  for (const candidateLane of view.lanes) {
    for (const item of candidateLane.items) {
      assert.equal("rank" in item, false);
      assert.equal("score" in item, false);
    }
  }
  const review = lane("review_candidate").items;
  for (let i = 1; i < review.length; i++) {
    const a = review[i - 1].sort;
    const b = review[i].sort;
    assert.ok(
      a.recent30ActiveProducts > b.recent30ActiveProducts ||
      (a.recent30ActiveProducts === b.recent30ActiveProducts && a.repeatedDateProducts >= b.repeatedDateProducts),
    );
  }
});

test("unknown internal flags are not leaked as raw enums", () => {
  const synthetic = structuredClone(candidateResult);
  synthetic.items[0].cautionFlags = ["not_a_real_ui_flag"];
  const next = buildSourcingCandidateView(synthetic);
  const first = next.lanes.flatMap((item) => item.items).find(
    (item) => item.groupId === synthetic.items[0].groupId,
  );
  assert.deepEqual(first.flags, []);
});
