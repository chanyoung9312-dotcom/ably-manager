"use client";

import { useEffect, useMemo, useState } from "react";

const INITIAL_VISIBLE = 18;

const percent = (value) =>
  typeof value === "number" && Number.isFinite(value)
    ? `${(value * 100).toFixed(1)}%`
    : "확인 필요";

const value = (number, suffix = "개") =>
  typeof number === "number" && Number.isFinite(number)
    ? `${number}${suffix}`
    : "확인 필요";

const stateClass = (state) =>
  state === "exploration_signal"
    ? "explore"
    : state === "concentration_dependent"
      ? "concentrated"
      : "insufficient";

function CompareRow({ label, previous, current }) {
  return (
    <div className="compare-row">
      <span>{label}</span>
      <b>{previous ?? "?"} → {current ?? "?"}</b>
    </div>
  );
}

function PeriodBlock({ title, current, previous }) {
  return (
    <div className="period-block">
      <b>{title}</b>
      <CompareRow label="반응 상품" previous={previous?.A} current={current?.A} />
      <CompareRow label="주문 반응" previous={previous?.Q} current={current?.Q} />
      <CompareRow label="순판매" previous={previous?.N} current={current?.N} />
      <CompareRow label="판단 반영 수량" previous={previous?.E} current={current?.E} />
    </div>
  );
}

function DataState({ fitness = {}, issueCount = 0 }) {
  const rows = [
    ["주문 수집 범위", fitness.coverageVerified ? "확인됨" : "미확인"],
    ["노출 데이터", fitness.exposureKnown ? "확인됨" : "없음"],
    ["테스트 기간", fitness.testDurationKnown ? "확인됨" : "미확인"],
    ["판매 가능 기간", fitness.availabilityKnown ? "확인됨" : "미확인"],
    ["분류 상태", fitness.taxonomyPartial ? "일부 확인 필요" : "사용 필드 확인"],
  ];
  return (
    <div className="data-state">
      {rows.map(([label, text]) => (
        <p key={label}><span>{label}</span><b>{text}</b></p>
      ))}
      {issueCount > 0 && <p><span>관련 데이터 확인</span><b>{issueCount}건</b></p>}
    </div>
  );
}

function ReadinessPanel({ readiness }) {
  if (!readiness) return null;
  const registration = readiness.registrationDates || {};
  const seasonEnds = readiness.seasonEnds || {};
  const upstream = readiness.upstreamIssues || {};
  return (
    <details className="readiness-panel">
      <summary>
        <span>판정 준비 상태</span>
        <small>데이터가 어디까지 확인됐는지 보기</small>
      </summary>
      <div className="readiness-body">
        <p className="readiness-intro">
          강한 근거·약한 반응을 확정하기 전에 필요한 운영 데이터 상태입니다. 확인되지 않은 항목은 현재 진단을 실패나 낮은 상품성으로 바꾸지 않습니다.
        </p>
        <div className="readiness-grid">
          {readiness.requirements.map((item) => (
            <div className="readiness-item" key={item.key}>
              <div><b>{item.label}</b><span className={item.ready ? "ready" : ""}>{item.statusLabel}</span></div>
              <p>{item.detail}</p>
            </div>
          ))}
        </div>
        <div className="readiness-meta">
          <p>
            <span>상품 등록일</span>
            <b>{registration.valid ?? 0}/{registration.total ?? 0}개 확인</b>
            {(registration.future || registration.invalid) ? <small>미래·형식 이상 {Number(registration.future || 0) + Number(registration.invalid || 0)}개</small> : null}
          </p>
          <p>
            <span>판매 종료일</span>
            <b>{seasonEnds.valid ?? 0}/{seasonEnds.total ?? 0}개 입력 확인</b>
            <small>현재 판매 가능 여부와 동일하게 보지 않음</small>
          </p>
          <p>
            <span>상류 데이터 확인</span>
            <b>{upstream.total ?? 0}건</b>
            <small>원장 {upstream.ledger ?? 0} · 상품 {upstream.product ?? 0}</small>
          </p>
        </div>
        {readiness.note && <p className="readiness-note">{readiness.note}</p>}
      </div>
    </details>
  );
}

const candidateLaneClass = (lane) =>
  lane === "review_candidate"
    ? "review"
    : lane === "hit_reference"
      ? "reference"
      : lane === "emerging_watch"
        ? "watch"
        : "hold";

function CandidateFacts({ facts = {} }) {
  return (
    <div className="candidate-facts">
      <p><span>반응 상품</span><b>{value(facts.reactingProducts)} / {value(facts.linkedProducts)}</b></p>
      <p><span>다른 날짜 반복</span><b>{value(facts.repeatedDateProducts)}</b></p>
      <p><span>최근 30일 활성</span><b>{value(facts.recent30ActiveProducts)}</b></p>
      <p><span>TOP2 주문 비중</span><b>{percent(facts.top2Share)}</b></p>
    </div>
  );
}

function CandidateHints({ hints = [] }) {
  if (hints.length === 0) return null;
  return (
    <details className="candidate-hints">
      <summary>품목 안의 조합 관측 · {hints.length}개</summary>
      <div className="hint-list">
        {hints.map((hint) => (
          <div className="hint-row" key={hint.groupId}>
            <div>
              <b>{hint.label}</b>
              <p>{hint.stateDescription}</p>
            </div>
            <div className="hint-meta">
              <span>{hint.stateLabel}</span>
              <small>반응 {value(hint.facts.reactingProducts)} · 반복 {value(hint.facts.repeatedDateProducts)} · 최근30일 {value(hint.facts.recent30ActiveProducts)}</small>
              {hint.sharedEvidence && <small>근거 상품 공유</small>}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function CandidateCard({ card }) {
  return (
    <article className="candidate-card">
      <div className="candidate-card-head">
        <div>
          <small>{card.confidenceLabel}</small>
          <h3>{card.label}</h3>
        </div>
        <span className={`candidate-badge ${candidateLaneClass(card.lane)}`}>{card.laneLabel}</span>
      </div>

      <p className="candidate-description">{card.laneDescription}</p>
      <CandidateFacts facts={card.facts} />

      <div className="candidate-reason">
        <b>관측 근거</b>
        <p>{card.narrative}</p>
      </div>

      {(card.flags.length > 0 || card.sharedEvidence) && (
        <div className="candidate-flags">
          {card.flags.slice(0, 4).map((flag) => <span key={flag.key}>{flag.label}</span>)}
          {card.sharedEvidence && <span>근거 상품 공유</span>}
        </div>
      )}

      {card.aliases.length > 0 && <p className="candidate-alias">동일 상품 집합: {card.aliases.join(" · ")}</p>}
      <CandidateHints hints={card.attributeHints} />
    </article>
  );
}

function CandidateBoard({ candidateReport }) {
  if (!candidateReport) return null;
  return (
    <section className="candidate-board" aria-labelledby="candidate-board-title">
      <div className="candidate-board-head">
        <div>
          <small>품목 단위 관측 분류</small>
          <h2 id="candidate-board-title">소싱 검토 분류</h2>
          <p>{candidateReport.notice}</p>
        </div>
        <span>{candidateReport.confidenceLabel}</span>
      </div>

      <div className="candidate-counts" aria-label="소싱 검토 분류 건수">
        {candidateReport.lanes.map((lane) => (
          <div key={lane.key}>
            <span>{lane.label}</span>
            <b>{lane.count}개</b>
          </div>
        ))}
      </div>

      {candidateReport.lanes.map((lane) => {
        const content = (
          <>
            <div className="candidate-lane-head">
              <div>
                <h3>{lane.label}</h3>
                <p>{lane.description}</p>
              </div>
              <span>{lane.count}개</span>
            </div>
            {lane.items.length > 0 ? (
              <div className="candidate-grid">
                {lane.items.map((card) => <CandidateCard key={card.id} card={card} />)}
              </div>
            ) : (
              <p className="candidate-empty">현재 이 분류에 해당하는 품목이 없습니다.</p>
            )}
          </>
        );

        if (lane.key === "data_hold") {
          return (
            <details className="candidate-lane candidate-lane-collapsed" key={lane.key}>
              <summary>{lane.label} · {lane.count}개 보기</summary>
              <div className="candidate-lane-body">{content}</div>
            </details>
          );
        }

        return <section className="candidate-lane" key={lane.key}>{content}</section>;
      })}
    </section>
  );
}

function SourcingCard({ card }) {
  const all = card.metrics.all || {};
  return (
    <article className="sourcing-card">
      <div className="card-head">
        <div>
          <small>{card.typeLabel}</small>
          <h2>{card.label}</h2>
        </div>
        <span className={`state-badge ${stateClass(card.primaryState)}`}>{card.stateLabel}</span>
      </div>

      <p className="state-description">{card.stateDescription}</p>

      <div className="key-facts" aria-label="핵심 근거">
        {card.keyFacts.map((fact) => (
          <div key={fact.label}><span>{fact.label}</span><b>{fact.value}</b></div>
        ))}
      </div>

      <div className="narrative">
        <b>왜 이렇게 보이나요?</b>
        <p>{card.narrative}</p>
      </div>

      <p className="recent-line">{card.recentSentence}</p>

      <div className="flag-row">
        <span className="validation">{card.validationLabel}</span>
        {card.visibleFlags.map((flag) => <span key={flag.key}>{flag.label}</span>)}
      </div>

      {card.aliases.length > 0 && (
        <p className="alias-line">동일 상품 집합: {card.aliases.join(" · ")}</p>
      )}
      {card.sharedGroupLabels.length > 0 && (
        <p className="shared-line"><b>근거 상품 공유</b> · {card.sharedGroupLabels.join(" · ")}</p>
      )}

      <details>
        <summary>자세히 보기</summary>
        <div className="detail-sections">
          <section>
            <h3>확산성</h3>
            <div className="detail-grid">
              <p><span>연결 가능 상품</span><b>{value(all.L)}</b></p>
              <p><span>반응 상품</span><b>{value(all.A)}</b></p>
              <p><span>반응률</span><b>{all.L > 0 && typeof all.A === "number" ? percent(all.A / all.L) : "확인 필요"}</b></p>
            </div>
          </section>

          <section>
            <h3>반복성</h3>
            <div className="detail-grid">
              <p><span>주문번호 반복 상품</span><b>{value(all.O)}</b></p>
              <p><span>다른 날짜 반복 상품</span><b>{value(all.D)}</b></p>
              <p><span>순판매 반복 상품</span><b>{value(all.DN)}</b></p>
              <p><span>판단 반영 반복 상품</span><b>{value(all.DE)}</b></p>
            </div>
          </section>

          <section>
            <h3>최근성</h3>
            <div className="period-grid">
              <PeriodBlock title="최근 30일" current={card.metrics.d30} previous={card.metrics.p30} />
              <PeriodBlock title="최근 14일" current={card.metrics.d14} previous={card.metrics.p14} />
              <PeriodBlock title="최근 7일" current={card.metrics.d7} previous={card.metrics.p7} />
            </div>
          </section>

          <section>
            <h3>집중도</h3>
            <div className="detail-grid">
              {[1, 2, 3].map((k) => {
                const top = card.concentration[`top${k}`];
                return (
                  <p key={k}>
                    <span>TOP{k} 주문 비중</span>
                    <b>{percent(top?.share)}</b>
                    <small>제외 후 반복 {value(top?.remaining?.DE)}</small>
                  </p>
                );
              })}
            </div>
          </section>

          <section>
            <h3>데이터 상태</h3>
            <DataState fitness={card.dataFitness} issueCount={card.issueCount} />
            {card.allFlags.length > card.visibleFlags.length && (
              <div className="all-flags">
                {card.allFlags.map((flag) => <span key={flag.key}>{flag.label}</span>)}
              </div>
            )}
          </section>
        </div>
      </details>
    </article>
  );
}

export default function SourcingPage() {
  const [report, setReport] = useState(null);
  const [candidateReport, setCandidateReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [state, setState] = useState("all");
  const [sort, setSort] = useState("recent");
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/sourcing-signals", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "소싱 진단 데이터를 불러오지 못했습니다.");
      setReport(data.report);
      setCandidateReport(data.candidateReport || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);
  useEffect(() => { setVisible(INITIAL_VISIBLE); }, [category, state, sort]);

  const cards = useMemo(() => {
    const source = [...(report?.cards || [])].filter((card) =>
      (category === "all" || (card.filterBuckets || [card.filterBucket]).includes(category))
      && (state === "all" || card.primaryState === state),
    );
    source.sort((a, b) => {
      if (sort === "reaction") return b.sort.reactionProducts - a.sort.reactionProducts || a.label.localeCompare(b.label, "ko");
      if (sort === "size") return b.sort.linkedProducts - a.sort.linkedProducts || a.label.localeCompare(b.label, "ko");
      if (sort === "name") return a.label.localeCompare(b.label, "ko");
      return b.sort.recent30Active - a.sort.recent30Active
        || b.sort.reactionProducts - a.sort.reactionProducts
        || b.sort.linkedProducts - a.sort.linkedProducts
        || a.label.localeCompare(b.label, "ko");
    });
    return source;
  }, [report, category, state, sort]);

  if (loading && !report) return <main className="sourcing-page"><p>소싱 진단 데이터를 불러오고 있습니다.</p></main>;
  if (!report) return <main className="sourcing-page"><p role="alert">{error || "데이터를 불러오지 못했습니다."}</p><button onClick={load}>새로고침</button></main>;

  const summary = report.summary || {};
  const shown = cards.slice(0, visible);

  return (
    <main className="sourcing-page">
      <header className="sourcing-head">
        <div>
          <small>상품군별 주문 반응을 읽는 화면</small>
          <h1>소싱 반응 진단</h1>
          <p>등록 상품과 실제 주문 반응을 비교해 어떤 상품군에서 반응이 반복됐는지 확인합니다.</p>
          <p className="notice">{report.notice}</p>
        </div>
        <button onClick={load} disabled={loading}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      {error && <p role="alert">{error} · 마지막으로 불러온 데이터를 보여주고 있습니다.</p>}

      <section className="summary-grid" aria-label="소싱 진단 요약">
        <div><span>분석 상품</span><b>{value(summary.products)}</b></div>
        <div><span>주문 연결 상품</span><b>{value(summary.linkedProducts)}</b></div>
        <div><span>주문 반응 상품</span><b>{value(summary.reactingProducts)}</b></div>
        <div><span>최근 30일 활성 상품</span><b>{value(summary.recent30ActiveProducts)}</b></div>
      </section>

      <div className="observation-line">
        <b>{summary.validationLabel}</b>
        <span>동일 상품 집합은 대표 카드 하나로 묶어 표시합니다. 원 분석 그룹 {summary.rawGroupCount ?? "?"}개 → 화면 카드 {summary.visibleGroupCount ?? "?"}개</span>
      </div>

      {(!summary.coverageVerified || !summary.exposureAvailable || !summary.testDurationAvailable) && (
        <div className="data-caution" role="note">
          주문 수집 완전성·노출수·테스트 기간이 모두 확인된 상태가 아닙니다. 최근 증감과 주문 0건은 관측값으로만 보고, 실패나 낮은 상품성으로 단정하지 않습니다.
        </div>
      )}

      <ReadinessPanel readiness={report.readiness} />

      <CandidateBoard candidateReport={candidateReport} />

      <section className="diagnostic-section-head">
        <div>
          <small>전체 관측 그룹</small>
          <h2>세부 진단 보기</h2>
          <p>품목·속성·조합의 전체 관측값을 필터로 확인합니다.</p>
        </div>
      </section>

      <section className="controls" aria-label="소싱 진단 필터">
        <div className="filter-row">
          {report.filters.map((item) => (
            <button key={item.key} className={category === item.key ? "active" : ""} onClick={() => setCategory(item.key)}>{item.label}</button>
          ))}
        </div>
        <div className="select-row">
          <label>상태
            <select value={state} onChange={(e) => setState(e.target.value)}>
              {report.states.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
          </label>
          <label>정렬
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="recent">최근 활성 상품 수</option>
              <option value="reaction">반응 상품 수</option>
              <option value="size">등록·연결 상품 수</option>
              <option value="name">이름</option>
            </select>
          </label>
          <span>{cards.length}개 그룹</span>
        </div>
      </section>

      <section className="card-grid">
        {shown.map((card) => <SourcingCard key={card.id} card={card} />)}
      </section>

      {cards.length === 0 && <p className="empty">조건에 맞는 그룹이 없습니다.</p>}
      {visible < cards.length && (
        <button className="more" onClick={() => setVisible((count) => count + INITIAL_VISIBLE)}>
          더 보기 · {cards.length - visible}개 남음
        </button>
      )}

      <style jsx global>{`
        .sourcing-page{max-width:1180px;margin:auto;padding:28px 18px 72px;color:inherit}
        .sourcing-head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;flex-wrap:wrap}
        .sourcing-head small,.sourcing-head p{color:#aeb5b8}.sourcing-head h1{font-size:34px;margin:5px 0}.sourcing-head p{max-width:760px;margin:0}
        .sourcing-head .notice{margin-top:7px;color:#d3d8da;font-size:13px}.sourcing-head>button,.more{padding:11px 16px;border-radius:12px}
        .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:24px 0 10px}.summary-grid>div{padding:15px;border:1px solid #343a3d;border-radius:15px;background:#191d1f;display:flex;flex-direction:column;gap:4px}.summary-grid span{font-size:12px;color:#aeb5b8}.summary-grid b{font-size:23px}
        .observation-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:11px 13px;border-radius:12px;background:#202527;color:#c8ced0;font-size:13px}.observation-line b{color:#f3f4f6}.data-caution{margin-top:8px;padding:11px 13px;border:1px solid #4a4435;border-radius:12px;background:#262319;color:#d7d0bb;font-size:12px;line-height:1.55}
        .readiness-panel{margin:10px 0 18px;border:1px solid #343a3d;border-radius:15px;background:#191d1f;padding:0 14px}.readiness-panel summary{cursor:pointer;padding:13px 0;display:flex;align-items:center;gap:9px;font-weight:800}.readiness-panel summary small{color:#9da6aa;font-weight:500}.readiness-body{border-top:1px solid #303638;padding:13px 0 15px}.readiness-intro,.readiness-note{font-size:12px;line-height:1.6;color:#b8c0c3;margin:0 0 11px}.readiness-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.readiness-item{background:#22282a;border-radius:11px;padding:11px}.readiness-item>div{display:flex;justify-content:space-between;gap:8px;align-items:center}.readiness-item b{font-size:13px}.readiness-item span{font-size:11px;color:#c7ced0}.readiness-item span.ready{font-weight:800}.readiness-item p{margin:6px 0 0;color:#aeb5b8;font-size:11px;line-height:1.55}.readiness-meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:8px}.readiness-meta p{margin:0;background:#202527;border-radius:11px;padding:10px;display:flex;flex-direction:column;gap:3px}.readiness-meta span,.readiness-meta small{font-size:11px;color:#aeb5b8}.readiness-meta b{font-size:13px}.readiness-note{margin:10px 0 0}
        .candidate-board{margin:20px 0 28px;padding:18px;border:1px solid #3a4245;border-radius:18px;background:#15191b}.candidate-board-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.candidate-board-head small,.candidate-board-head p{color:#aeb5b8}.candidate-board-head h2{font-size:24px;margin:4px 0 5px}.candidate-board-head p{margin:0;max-width:760px;font-size:13px;line-height:1.55}.candidate-board-head>span{white-space:nowrap;padding:6px 9px;border:1px solid #465156;border-radius:999px;font-size:11px;color:#d4d9db}.candidate-counts{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:15px 0}.candidate-counts>div{display:flex;justify-content:space-between;gap:8px;align-items:center;background:#202527;border-radius:11px;padding:10px 11px}.candidate-counts span{font-size:11px;color:#aeb5b8}.candidate-counts b{font-size:14px}.candidate-lane{margin-top:16px}.candidate-lane+.candidate-lane{padding-top:16px;border-top:1px solid #303638}.candidate-lane-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:9px}.candidate-lane-head h3{margin:0;font-size:16px}.candidate-lane-head p{margin:4px 0 0;color:#aeb5b8;font-size:12px;line-height:1.5}.candidate-lane-head>span{font-size:12px;color:#aeb5b8}.candidate-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.candidate-card{border:1px solid #343a3d;border-radius:15px;background:#1b2022;padding:14px;min-width:0}.candidate-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.candidate-card-head small{color:#929b9f;font-size:11px}.candidate-card-head h3{font-size:18px;margin:4px 0 0}.candidate-badge{padding:5px 8px;border-radius:999px;font-size:11px;font-weight:800;white-space:nowrap}.candidate-badge.review{background:#294936}.candidate-badge.reference{background:#4a4025}.candidate-badge.watch{background:#293744}.candidate-badge.hold{background:#353a3c}.candidate-description{margin:9px 0;color:#b6bec1;font-size:12px;line-height:1.5}.candidate-facts{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.candidate-facts p{margin:0;background:#22282a;border-radius:9px;padding:9px;display:flex;flex-direction:column;gap:3px}.candidate-facts span{font-size:10px;color:#aeb5b8}.candidate-facts b{font-size:13px}.candidate-reason{margin-top:9px;padding:10px;border-radius:10px;background:#202527}.candidate-reason>b{font-size:11px}.candidate-reason p{margin:4px 0 0;color:#c6ccce;font-size:12px;line-height:1.55}.candidate-flags{display:flex;flex-wrap:wrap;gap:5px;margin-top:9px}.candidate-flags span{font-size:10px;color:#c8ced0;background:#272d2f;border-radius:7px;padding:4px 6px}.candidate-alias{margin:8px 0 0;font-size:11px;color:#aeb5b8}.candidate-hints{margin-top:10px;border-top:1px solid #303638;padding-top:9px}.candidate-hints summary{cursor:pointer;font-size:11px;font-weight:800}.hint-list{margin-top:7px;display:grid;gap:6px}.hint-row{display:flex;justify-content:space-between;gap:10px;background:#22282a;border-radius:9px;padding:9px}.hint-row b{font-size:12px}.hint-row p{margin:3px 0 0;color:#aeb5b8;font-size:10px;line-height:1.45}.hint-meta{display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:125px}.hint-meta span{font-size:10px;font-weight:800}.hint-meta small{font-size:9px;color:#aeb5b8;text-align:right}.candidate-empty{margin:0;color:#929b9f;font-size:12px}.candidate-lane-collapsed>summary{cursor:pointer;font-weight:800;padding:5px 0}.candidate-lane-body{margin-top:10px}.diagnostic-section-head{margin:28px 0 8px}.diagnostic-section-head small,.diagnostic-section-head p{color:#aeb5b8}.diagnostic-section-head h2{margin:3px 0;font-size:22px}.diagnostic-section-head p{margin:0;font-size:12px}
        .controls{margin:18px 0;padding:14px;border:1px solid #343a3d;border-radius:15px;background:#191d1f}.filter-row{display:flex;gap:7px;overflow-x:auto;scrollbar-width:none;padding-bottom:10px}.filter-row::-webkit-scrollbar{display:none}.filter-row button{white-space:nowrap;border:1px solid #343c40;background:#1a1f21;color:inherit;border-radius:10px;padding:8px 11px}.filter-row button.active{background:#313a3e;border-color:#8b9aa0}.select-row{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.select-row label{display:flex;align-items:center;gap:7px;color:#aeb5b8;font-size:13px}.select-row select{background:#202628;color:inherit;border:1px solid #3b4447;border-radius:9px;padding:7px 9px}.select-row>span{margin-left:auto;color:#aeb5b8;font-size:13px}
        .card-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.sourcing-card{border:1px solid #343a3d;border-radius:17px;background:#191d1f;padding:17px;min-width:0}.card-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.card-head small{color:#929b9f}.card-head h2{font-size:20px;margin:4px 0 0}.state-badge{border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;white-space:nowrap}.state-badge.explore{background:#294936}.state-badge.concentrated{background:#4a4025}.state-badge.insufficient{background:#353a3c}.state-description{margin:10px 0;color:#b6bec1;font-size:13px;line-height:1.55}
        .key-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.key-facts>div,.detail-grid>p{background:#22282a;border-radius:11px;padding:10px;margin:0;display:flex;flex-direction:column;gap:3px}.key-facts span,.detail-grid span,.detail-grid small{font-size:11px;color:#aeb5b8}.key-facts b{font-size:17px}.narrative{margin-top:10px;background:#202527;border-radius:12px;padding:12px}.narrative>b{font-size:12px}.narrative p{margin:5px 0 0;color:#c6ccce;font-size:13px;line-height:1.6}.recent-line{margin:9px 0 0;color:#c6ccce;font-size:13px;line-height:1.5}
        .flag-row,.all-flags{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.flag-row span,.all-flags span{padding:5px 7px;border-radius:8px;background:#272d2f;font-size:11px;color:#c8ced0}.flag-row .validation{border:1px solid #465156;background:#1b2022}.alias-line,.shared-line{font-size:12px;color:#aeb5b8;margin:9px 0 0}.shared-line b{color:#d7dcde}
        .sourcing-card details{margin-top:12px;border-top:1px solid #303638;padding-top:11px}.sourcing-card summary{cursor:pointer;font-weight:800;font-size:13px}.detail-sections>section{margin-top:14px}.detail-sections h3{font-size:14px;margin:0 0 7px}.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.detail-grid b{font-size:14px}.period-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.period-block{background:#22282a;border-radius:11px;padding:10px}.period-block>b{font-size:13px}.compare-row{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:11px}.compare-row span{color:#aeb5b8}.compare-row b{text-align:right}.data-state{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}.data-state p{margin:0;background:#22282a;border-radius:10px;padding:9px;display:flex;justify-content:space-between;gap:8px;font-size:11px}.data-state span{color:#aeb5b8}.more{display:block;margin:18px auto 0}.empty{text-align:center;color:#aeb5b8;padding:40px}
        @media(min-width:1120px){.candidate-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.detail-grid{grid-template-columns:repeat(2,1fr)}.period-grid{grid-template-columns:1fr}}
        @media(max-width:760px){.sourcing-page{padding:20px 12px 60px}.sourcing-head h1{font-size:28px}.summary-grid{grid-template-columns:1fr 1fr}.candidate-board{padding:14px}.candidate-board-head{flex-direction:column}.candidate-counts{grid-template-columns:1fr 1fr}.candidate-grid{grid-template-columns:1fr}.candidate-facts{grid-template-columns:1fr 1fr}.hint-row{flex-direction:column}.hint-meta{align-items:flex-start;min-width:0}.hint-meta small{text-align:left}.card-grid{grid-template-columns:1fr}.detail-grid{grid-template-columns:1fr 1fr}.period-grid{grid-template-columns:1fr}.readiness-grid{grid-template-columns:1fr}.readiness-meta{grid-template-columns:1fr}.select-row>span{width:100%;margin-left:0}.key-facts{grid-template-columns:1fr 1fr}.key-facts>div:last-child{grid-column:1/-1}}
        @media(max-width:440px){.summary-grid{grid-template-columns:1fr 1fr}.detail-grid,.data-state{grid-template-columns:1fr}.card-head{flex-direction:column}.state-badge{align-self:flex-start}}
      `}</style>
    </main>
  );
}
