"use client";
import { useEffect, useState } from "react";

const decisionLabel = (row) =>
  row.decision === "사입 검토"
    ? "사입 검토"
    : row.decision === "추가 사입 중단"
      ? "추가 주문 중단"
      : "조금 더 보기";

const easyCheck = (text = "") => {
  if (text.includes("오류 해소")) return "데이터 오류 확인";
  if (text.includes("실제 등록일") || text === "등록일 확인") return "상품 등록일 확인";
  if (text.includes("최근 30일 주문 수집 범위")) return "최근 30일 주문 집계 확인";
  if (text.includes("옵션별 현재 재고")) return "옵션별 재고 확인";
  if (text.includes("진행 중 취소·반품")) return "취소/반품 진행 상태 확인";
  if (text.includes("공급기간·입고예정·예약재고")) return "입고 일정과 입고 수량 확인";
  if (text.includes("중복 MD 상품번호")) return "중복 상품번호 확인";
  if (text.includes("상품번호 연결")) return "상품번호 연결";
  return text.replaceAll("클레임", "취소/반품").replaceAll("MD ", "").replaceAll("유효 주문", "주문");
};

function checksFor(row) {
  const checks = (row.missing || []).map(easyCheck).filter(Boolean);
  if ((row.claims || []).length) checks.push("취소/반품 내역 확인");
  return [...new Set(checks)];
}

function statusText(row) {
  if (row.decision === "사입 검토") {
    if (row.quantities?.recommended > 0)
      return `반복 판매가 확인됐어요. 추천 ${row.quantities.recommended}개를 기준으로 소량 사입을 검토할 단계입니다.`;
    return "반복 판매가 확인돼 소량 사입을 검토할 단계입니다.";
  }
  if (row.decision === "추가 사입 중단")
    return "현재 재고와 입고 예정분을 먼저 확인하고 추가 주문은 멈추는 상태입니다.";
  if ((row.q30 || 0) === 0)
    return "최근 30일 판매가 없어 아직 사입할 단계가 아닙니다.";
  if ((row.days30 || 0) <= 1)
    return "판매는 있었지만 한 날짜에 몰려 있어 반복 판매인지 더 확인해야 합니다.";
  return "판매 반응은 있지만 사입 결정 전에 며칠 더 흐름을 확인해야 합니다.";
}

function nextAction(row) {
  const checks = checksFor(row);
  if (checks.length) return checks.slice(0, 2).join(" · ");
  if (row.decision === "사입 검토" && row.quantities?.recommended > 0)
    return `추천 ${row.quantities.recommended}개 기준으로 공급처 재고와 납기 확인`;
  if (row.decision === "사입 검토") return "소량 사입 여부 결정";
  if (row.decision === "추가 사입 중단") return "보유·입고 재고를 먼저 소진";
  if ((row.days30 || 0) <= 1) return "다른 날짜에도 주문이 이어지는지 확인";
  return "7일 뒤 판매 흐름 다시 확인";
}

function ProductRow({ row }) {
  const checks = checksFor(row);
  return (
    <article className="md-analysis-card">
      <div className="md-analysis-card-head">
        <div>
          <small>{row.productNo ? `상품번호 ${row.productNo}` : "상품번호 확인 필요"}</small>
          <h3>{row.name || "상품명 확인 필요"}</h3>
        </div>
        <span className={`md-analysis-badge ${row.decision === "사입 검토" ? "buy" : row.decision === "추가 사입 중단" ? "stop" : "watch"}`}>
          {decisionLabel(row)}
        </span>
      </div>

      <div className="md-analysis-metrics">
        <div><span>최근 7일 판매</span><b>{row.q7 || 0}개</b></div>
        <div><span>최근 30일 판매</span><b>{row.q30 || 0}개</b></div>
        <div><span>판매된 날짜</span><b>{row.days30 || 0}일</b></div>
        <div><span>현재 재고</span><b>{row.stock === null ? "확인 필요" : `${row.stock}개`}</b></div>
      </div>

      <div className="md-analysis-status">
        <b>현재 상태</b>
        <p>{statusText(row)}</p>
      </div>

      <div className="md-analysis-action">
        <span>지금 할 일</span>
        <b>{nextAction(row)}</b>
      </div>

      <details>
        <summary>상세 보기</summary>
        <div className="md-analysis-detail-grid">
          <p><span>전체 주문</span><b>{row.total || 0}개</b></p>
          <p><span>최근 14일 판매</span><b>{row.q14 || 0}개</b></p>
          <p><span>최근 30일 취소/반품</span><b>{row.cancels || 0}개</b></p>
          <p><span>최근 판매일</span><b>{row.last || "확인 필요"}</b></p>
        </div>
        {row.quantities && (
          <div className="md-analysis-quantity">
            <b>사입 참고 수량</b>
            <span>적게 {row.quantities.conservative}개</span>
            <span>기준 {row.quantities.recommended}개</span>
            <span>넉넉히 {row.quantities.aggressive}개</span>
          </div>
        )}
        {checks.length > 0 && (
          <div className="md-analysis-checks">
            <b>확인할 항목</b>
            <ul>{checks.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
      </details>
    </article>
  );
}

function Group({ title, description, rows }) {
  return (
    <section className="md-analysis-section">
      <div className="md-analysis-section-head">
        <div><h2>{title}</h2><p>{description}</p></div>
        <b>{rows.length}개</b>
      </div>
      {rows.length ? rows.map((row) => <ProductRow key={row.key} row={row} />) : <p className="md-analysis-empty">해당 상품이 없습니다.</p>}
    </section>
  );
}

export default function AnalysisPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/oars-analysis", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error || "분석 데이터를 불러오지 못했습니다.");
      setReport(data.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading && !report)
    return <main className="md-analysis-page"><p>MD 분석 데이터를 불러오고 있습니다.</p></main>;
  if (!report)
    return <main className="md-analysis-page"><p role="alert">{error || "데이터를 불러오지 못했습니다."}</p><button onClick={load}>새로고침</button></main>;

  const rows = report.rows || [];
  const buy = rows.filter((row) => row.decision === "사입 검토");
  const watch = rows.filter((row) => row.decision === "관찰");
  const stop = rows.filter((row) => row.decision === "추가 사입 중단");
  const needsCheck = rows.filter((row) => checksFor(row).length > 0);

  return (
    <main className="md-analysis-page">
      <header className="md-analysis-head">
        <div>
          <small>사입 판단을 한눈에 정리</small>
          <h1>MD 분석</h1>
          <p>결론부터 보고, 필요한 상품만 상세 내용을 확인할 수 있게 정리했습니다.</p>
        </div>
        <button onClick={load} disabled={loading}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      {error && <p role="alert">{error} · 마지막으로 불러온 데이터를 보여주고 있습니다.</p>}

      <section className="md-analysis-summary" aria-label="MD 분석 요약">
        <div><span>사입 검토</span><b>{buy.length}개</b><small>소량 사입을 검토할 상품</small></div>
        <div><span>조금 더 보기</span><b>{watch.length}개</b><small>판매 흐름을 더 볼 상품</small></div>
        <div><span>추가 주문 중단</span><b>{stop.length}개</b><small>재고를 먼저 확인할 상품</small></div>
        <div><span>데이터 확인</span><b>{needsCheck.length}개</b><small>판단 전 확인이 필요한 상품</small></div>
      </section>

      <div className="md-analysis-links">
        <a href="/product-reaction">상품 반응 자세히 보기 →</a>
        <a href="/products">재고 현황 보기 →</a>
      </div>

      <Group title="사입 검토" description="반복 판매가 확인돼 실제 사입 여부를 결정할 상품입니다." rows={buy} />
      <Group title="조금 더 보기" description="판매는 있었지만 반복 수요인지 조금 더 확인할 상품입니다." rows={watch} />
      <Group title="추가 주문 중단" description="현재 재고나 입고분을 먼저 확인해야 하는 상품입니다." rows={stop} />

      {report.warnings?.length > 0 && (
        <details className="md-analysis-warning">
          <summary>전체 데이터 확인 필요 {report.warnings.length}건</summary>
          <p>상품 하나가 아니라 전체 분석에 영향을 줄 수 있는 내용만 모았습니다.</p>
          {report.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
        </details>
      )}

      <style jsx global>{`
        .md-analysis-page{max-width:1080px;margin:auto;padding:26px 18px 70px;color:inherit}.md-analysis-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}.md-analysis-head small,.md-analysis-head p{color:#aeb5b8}.md-analysis-head h1{font-size:34px;margin:5px 0}.md-analysis-head p{margin:0;max-width:720px}.md-analysis-head button{padding:11px 16px;border-radius:12px}.md-analysis-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0 12px}.md-analysis-summary>div{border:1px solid #343a3d;border-radius:16px;padding:17px;background:#191d1f;display:flex;flex-direction:column;gap:5px}.md-analysis-summary span{font-weight:800}.md-analysis-summary b{font-size:25px}.md-analysis-summary small{color:#aeb5b8;line-height:1.45}.md-analysis-links{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 18px}.md-analysis-links a{padding:10px 13px;border:1px solid #343a3d;border-radius:11px;background:#202628;color:inherit;text-decoration:none;font-weight:800}.md-analysis-section{border:1px solid #343a3d;border-radius:18px;background:#191d1f;padding:18px;margin:14px 0}.md-analysis-section-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-bottom:1px solid #303638;padding:2px 2px 14px}.md-analysis-section-head h2{margin:0 0 4px;font-size:21px}.md-analysis-section-head p{margin:0;color:#aeb5b8}.md-analysis-section-head>b{white-space:nowrap}.md-analysis-card{padding:20px 2px;border-bottom:1px solid #303638}.md-analysis-card:last-child{border-bottom:0}.md-analysis-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.md-analysis-card-head small{color:#929b9f}.md-analysis-card-head h3{margin:5px 0 0;font-size:18px;line-height:1.45}.md-analysis-badge{border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;white-space:nowrap}.md-analysis-badge.buy{background:#294936}.md-analysis-badge.watch{background:#4a4025}.md-analysis-badge.stop{background:#493032}.md-analysis-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:16px 0}.md-analysis-metrics>div{background:#22282a;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:3px}.md-analysis-metrics span{color:#aeb5b8;font-size:12px}.md-analysis-metrics b{font-size:19px}.md-analysis-status{background:#202527;border-radius:13px;padding:14px 15px}.md-analysis-status p{margin:6px 0 0;color:#c2c8ca}.md-analysis-action{margin-top:9px;border:1px solid #303638;background:#171b1c;border-radius:13px;padding:14px 15px;display:flex;gap:12px;align-items:flex-start}.md-analysis-action span{font-size:12px;color:#aeb5b8;min-width:68px;padding-top:2px}.md-analysis-card details{margin-top:12px}.md-analysis-card summary,.md-analysis-warning summary{cursor:pointer;font-weight:800}.md-analysis-detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.md-analysis-detail-grid p{margin:0;background:#22282a;padding:11px;border-radius:10px;display:flex;flex-direction:column;gap:3px}.md-analysis-detail-grid span{font-size:12px;color:#aeb5b8}.md-analysis-quantity{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;padding:12px;border:1px solid #303638;border-radius:11px}.md-analysis-quantity b{width:100%}.md-analysis-quantity span{background:#22282a;border-radius:999px;padding:5px 8px;font-size:12px}.md-analysis-checks{margin-top:10px;color:#c2c8ca}.md-analysis-checks ul{margin:7px 0 0;padding-left:20px}.md-analysis-checks li{margin:4px 0}.md-analysis-warning{border:1px solid #4a4440;border-radius:15px;padding:15px;margin-top:14px;color:#bfc5c7}.md-analysis-warning p{font-size:13px;line-height:1.55}.md-analysis-empty{color:#aeb5b8;margin:16px 2px 2px}@media(max-width:720px){.md-analysis-page{padding:20px 12px 60px}.md-analysis-head h1{font-size:28px}.md-analysis-summary{grid-template-columns:repeat(2,1fr)}.md-analysis-metrics{grid-template-columns:repeat(2,1fr)}.md-analysis-detail-grid{grid-template-columns:repeat(2,1fr)}.md-analysis-card-head{flex-direction:column}.md-analysis-action{flex-direction:column;gap:5px}}
      `}</style>
    </main>
  );
}
