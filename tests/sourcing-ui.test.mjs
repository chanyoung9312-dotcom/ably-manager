import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { diagnoseSourcingSignals } from "../lib/sourcing-signals.mjs";
import { assessSourcingReadiness } from "../lib/sourcing-readiness.mjs";
import {
  buildSourcingView,
  SOURCING_FLAG_COPY,
  SOURCING_STATE_COPY,
} from "../lib/sourcing-view.mjs";

const fixture = JSON.parse(
  fs.readFileSync(new URL("./fixtures/sourcing-signals-input.json", import.meta.url), "utf8"),
);
const diagnostics = diagnoseSourcingSignals(fixture);
const view = buildSourcingView(diagnostics);
const card = (id) => {
  const found = view.cards.find((item) => item.id === id);
  assert.ok(found, id);
  return found;
};

test("state and flag enums are translated into neutral Korean observation copy", () => {
  assert.equal(SOURCING_STATE_COPY.exploration_signal.label, "탐색 신호");
  assert.match(SOURCING_STATE_COPY.exploration_signal.description, /반복성과 최근 흐름, 집중도/);
  assert.equal(SOURCING_STATE_COPY.concentration_dependent.label, "특정 상품 의존");
  assert.equal(SOURCING_STATE_COPY.insufficient_data.label, "판단 자료 부족");
  assert.equal(SOURCING_FLAG_COPY.cooling_observed, "최근 반응 둔화 관측");
  assert.equal(SOURCING_FLAG_COPY.shared_evidence, "다른 속성과 동일 상품 근거 공유");
});

test("summary uses the total product population, never the overlapping group count", () => {
  assert.deepEqual(
    [view.summary.products, view.summary.linkedProducts, view.summary.reactingProducts],
    [271, 261, 37],
  );
  assert.equal(view.summary.rawGroupCount, 141);
  assert.ok(view.summary.visibleGroupCount < view.summary.rawGroupCount);
});

test("shorts are shown as exploration with broad reaction and mixed recent evidence", () => {
  const g = card("baseType:숏·하프팬츠");
  assert.equal(g.stateLabel, "탐색 신호");
  assert.equal(g.metrics.all.L, 27);
  assert.equal(g.metrics.all.A, 8);
  assert.equal(g.concentration.top1.share, 4 / 14);
  assert.match(g.recentSentence, /지표가 엇갈립니다/);
  assert.match(g.narrative, /27개 연결 상품 중 8개/);
});

test("long dress is shown as concentrated and explains the TOP2 dependence", () => {
  const g = card("secondaryCategory:롱원피스");
  assert.equal(g.stateLabel, "특정 상품 의존");
  assert.equal(g.metrics.all.L, 19);
  assert.equal(g.metrics.all.A, 4);
  assert.equal(g.concentration.top2.share, 176 / 178);
  assert.match(g.narrative, /상위 2개 상품이 전체 주문의 98\.9%/);
  assert.ok(g.visibleFlags.some((flag) => flag.label === "최근 반응 둔화 관측"));
});

test("wide preserves both concentration and mixed recent observations", () => {
  const g = card("attribute:widthShape:와이드");
  assert.equal(g.stateLabel, "특정 상품 의존");
  assert.equal(g.metrics.all.A, 8);
  assert.ok(g.visibleFlags.some((flag) => flag.label === "최근 지표 혼재"));
  assert.equal(g.concentration.top2.remaining.DE, 0);
});

test("A-line remains exploration and same-day repetition is not upgraded", () => {
  const g = card("attribute:silhouette:A라인");
  assert.equal(g.stateLabel, "탐색 신호");
  assert.equal(g.metrics.all.D, 0);
  assert.ok(g.visibleFlags.some((flag) => flag.label === "동일 날짜 중심 반응"));
});

test("zero-order knit is data-insufficient rather than failure", () => {
  const g = card("attribute:materialExpression:니트");
  assert.equal(g.stateLabel, "판단 자료 부족");
  assert.equal(g.metrics.all.A, 0);
  assert.match(g.narrative, /반응 부족으로 단정할 수 없습니다/);
  assert.ok(g.visibleFlags.some((flag) => flag.label === "노출 데이터 없음"));
});

test("equivalent member sets collapse into one representative card with aliases", () => {
  assert.ok(!view.cards.some((item) => item.id === "combination:원피스 ∩ 롱"));
  const long = card("secondaryCategory:롱원피스");
  assert.ok(long.aliases.includes("원피스 ∩ 롱"));
  assert.ok(long.filterBuckets.includes("item"));
  assert.ok(long.filterBuckets.includes("combination"));
});

test("shared hit products are exposed as related evidence, not independent wins", () => {
  const stripe = card("attribute:pattern:스트라이프");
  assert.ok(stripe.sharedGroupLabels.length > 0);
  assert.ok(stripe.visibleFlags.some((flag) => flag.label === "다른 속성과 동일 상품 근거 공유"));
});

test("a seven-day zero flag alone does not generate decline copy", () => {
  const synthetic = buildSourcingView({
    validationStatus: "observed_provisional",
    groups: [{
      id: "baseType:테스트",
      level: "baseType",
      label: "테스트",
      memberKeys: ["a", "b"],
      primaryState: "exploration_signal",
      validationStatus: "observed_provisional",
      flags: ["no_recent7_observed"],
      issues: [],
      dataFitness: {},
      sharedEvidence: [],
      periods: {
        all: { R: 2, L: 2, U: 0, A: 2, O: 0, D: 0, DN: 0, DE: 0, top: { 1: { share: 0.5 }, 2: { share: 1 }, 3: { share: 1 } } },
        d30: { A: 2, Q: 2, N: 2, E: 2 },
        p30: { A: 2, Q: 2, N: 2, E: 2 },
        d14: { A: 2, Q: 2, N: 2, E: 2 },
        p14: { A: 2, Q: 2, N: 2, E: 2 },
        d7: { A: 0, Q: 0, N: 0, E: 0 },
        p7: { A: 2, Q: 2, N: 2, E: 2 },
      },
      comparisons: {
        d30: { A:{previous:2,current:2}, Q:{previous:2,current:2}, N:{previous:2,current:2}, E:{previous:2,current:2} },
        d14: { A:{previous:2,current:2}, Q:{previous:2,current:2}, N:{previous:2,current:2}, E:{previous:2,current:2} },
        d7: { A:{previous:2,current:0}, Q:{previous:2,current:0}, N:{previous:2,current:0}, E:{previous:2,current:0} },
      },
    }],
    sharedEvidence: [],
  });
  assert.equal(synthetic.cards[0].recentSentence, "최근 30일에는 2개 상품에서 주문 반응이 관측됐습니다.");
});

test("unknown metrics remain 확인 필요 rather than silently becoming zero", () => {
  const synthetic = buildSourcingView({
    validationStatus: "observed_provisional",
    groups: [{
      id: "baseType:불명",
      level: "baseType",
      label: "불명",
      memberKeys: ["a"],
      primaryState: "insufficient_data",
      validationStatus: "blocked",
      flags: [],
      issues: [],
      dataFitness: {},
      sharedEvidence: [],
      periods: {
        all: { R: 1, L: 1, U: 0, A: null, O: null, D: null, DN: null, DE: null, top: { 1: { share: null }, 2: { share: null }, 3: { share: null } } },
        d30: { A: null }, p30: { A: null }, d14: { A: null }, p14: { A: null }, d7: { A: null }, p7: { A: null },
      },
      comparisons: {},
    }],
    sharedEvidence: [],
  });
  assert.equal(synthetic.cards[0].keyFacts[0].value, "확인 필요");
  assert.equal(synthetic.cards[0].keyFacts[1].value, "확인 필요");
});

test("readiness metadata is translated without activating strong or weak sourcing states", () => {
  const enriched = structuredClone(diagnostics);
  enriched.sourceMeta = {
    readiness: assessSourcingReadiness({
      asOf: "2026-09-19",
      coverageStart: "2026-04-15",
      coverageThrough: "2026-09-19",
      periods: fixture.snapshot.periods,
      products: fixture.products,
      issues: [],
    }),
    coverageVerified: true,
    exposureAvailable: false,
    testDurationAvailable: false,
  };
  const enrichedView = buildSourcingView(enriched);
  assert.equal(enrichedView.readiness.requirements.find((item) => item.key === "coverage").statusLabel, "확인됨");
  assert.equal(enrichedView.readiness.requirements.find((item) => item.key === "exposure").statusLabel, "미확인");
  assert.equal(enrichedView.readiness.activationReady, false);
  assert.equal(enrichedView.summary.coverageVerified, true);
});

test("the UI fetches live diagnostics and avoids recommendation ranking language", () => {
  const page = fs.readFileSync(new URL("../app/sourcing/page.js", import.meta.url), "utf8");
  const route = fs.readFileSync(new URL("../app/api/sourcing-signals/route.js", import.meta.url), "utf8");
  const candidateView = fs.readFileSync(new URL("../lib/sourcing-candidate-view.mjs", import.meta.url), "utf8");
  assert.match(page, /fetch\("\/api\/sourcing-signals"/);
  assert.match(route, /loadDashboard\(\)/);
  assert.match(route, /buildLiveSourcingDiagnostics/);
  assert.match(route, /buildSourcingView/);
  assert.match(route, /buildSourcingCandidates/);
  assert.match(route, /buildSourcingCandidateView/);
  assert.match(route, /buildSourcingCandidateEvidence/);
  assert.match(route, /products: dashboard\.mdProducts/);
  assert.doesNotMatch(route, /fixtures\/sourcing-signals/);
  assert.doesNotMatch(page, /추천순|비추천|BEST/);
  assert.equal(view.notice, "추천 점수나 자동 소싱 결정이 아닌 관측 데이터입니다.");
  assert.match(page, /report\.notice/);
  assert.match(page, /주문 수집 완전성·노출수·테스트 기간/);
  assert.match(page, /판정 준비 상태/);
  assert.match(page, /소싱 검토 분류/);
  assert.match(candidateView, /소싱 검토 후보/);
  assert.match(candidateView, /히트 구조 참고/);
  assert.match(candidateView, /추가 관찰/);
  assert.match(candidateView, /데이터 보류/);
  assert.match(page, /현재 판매 가능 여부/);
  assert.doesNotMatch(page, /사입 판단용 수량|사입 판단용 반복 상품/);
  assert.match(page, /판단 반영 수량/);
  assert.match(page, /판단 반영 반복 상품/);
});

test("the screen exposes details, shared evidence, filters, and mobile one-column cards", () => {
  const page = fs.readFileSync(new URL("../app/sourcing/page.js", import.meta.url), "utf8");
  assert.match(page, />자세히 보기</);
  assert.match(page, />근거 상품 공유</);
  assert.match(page, /최근 활성 상품 수/);
  assert.match(page, /filterBuckets/);
  assert.doesNotMatch(page, /stateOrder/);
  assert.match(page, /@media\(max-width:760px\)/);
  assert.match(page, /\.card-grid\{grid-template-columns:1fr\}/);
  assert.match(page, /INITIAL_VISIBLE = 18/);
  assert.match(page, /candidate-grid/);
  assert.match(page, /품목 안의 조합 관측/);
  assert.match(page, /근거 상품 보기/);
  assert.match(page, /상품번호/);
  assert.match(page, /판단 반영/);
});

test("global navigation exposes the sourcing diagnostics page", () => {
  const nav = fs.readFileSync(new URL("../app/TodayHomeNav.js", import.meta.url), "utf8");
  assert.match(nav, /\["소싱 진단", "\/sourcing"\]/);
});
