"use client";
import { useEffect, useMemo, useState } from "react";

const decisionLabel = (row) =>
  row.decision === "사입 검토"
    ? "사입 검토"
    : row.decision === "추가 사입 중단"
      ? "추가 주문 중단"
      : "조금 더 보기";

const speedLabel = (speed = "") => {
  if (speed.includes("가속")) return "최근 판매 증가";
  if (speed.includes("둔화")) return "최근 판매 감소";
  if (speed.includes("유지")) return "판매 흐름 유지";
  return "판매 추세 확인 중";
};

const easyCheck = (text = "") => {
  if (text.includes("오류 해소")) return "데이터 오류 확인";
  if (text.includes("실제 등록일") || text === "등록일 확인")
    return "상품 등록일 확인";
  if (text.includes("최근 30일 주문 수집 범위"))
    return "최근 30일 주문 집계 확인";
  if (text.includes("옵션별 현재 재고")) return "옵션별 재고 확인";
  if (text.includes("진행 중 취소·반품")) return "취소/반품 진행 상태 확인";
  if (text.includes("공급기간·입고예정·예약재고"))
    return "입고 일정과 입고 수량 확인";
  if (text.includes("중복 MD 상품번호")) return "중복 상품번호 확인";
  if (text.includes("상품번호 연결")) return "상품번호 연결";
  return text
    .replaceAll("클레임", "취소/반품")
    .replaceAll("MD ", "")
    .replaceAll("유효 주문", "주문");
};

function checksFor(row) {
  const checks = (row.missing || []).map(easyCheck).filter(Boolean);
  if (row.q30 > 0 && (row.days30 || 0) < 3)
    checks.push("다른 날짜에도 주문이 들어오는지 확인");
  if ((row.claims || []).length > 0)
    checks.push("취소/반품 내역 확인");
  return [...new Set(checks)];
}

function summaryFor(row) {
  if (row.decision === "사입 검토")
    return "반복 판매가 확인돼 소량 사입을 검토할 수 있어요.";
  if (row.decision === "추가 사입 중단")
    return "현재 재고와 입고분을 먼저 확인하고 추가 주문은 멈추는 상태예요.";
  if ((row.q30 || 0) === 0)
    return "최근 30일 판매가 없어 아직 사입할 단계가 아니에요.";
  if ((row.days30 || 0) <= 1)
    return "판매는 있었지만 한 날짜에 몰려 있어 반복 판매인지 더 봐야 해요.";
  if ((row.q7 || 0) >= 2)
    return "최근 판매가 이어지고 있어 며칠 더 흐름을 확인해요.";
  return "판매 반응은 있지만 사입 결정 전 조금 더 확인이 필요해요.";
}

function ProductCard({ row }) {
  const checks = checksFor(row);
  const visibleChecks = checks.slice(0, 3);
  return (
    <article className="product-card">
      <div className="card-head">
        <div>
          <small>{row.productNo ? `상품번호 ${row.productNo}` : "상품번호 확인 필요"}</small>
          <h3>{row.name || "상품명 확인 필요"}</h3>
        </div>
        <div className="badges">
          <span className={`decision ${row.decision === "사입 검토" ? "buy" : row.decision === "추가 사입 중단" ? "stop" : "watch"}`}>
            {decisionLabel(row)}
          </span>
          <span className="trend">{speedLabel(row.speed)}</span>
        </div>
      </div>

      <div className="metrics" aria-label="핵심 판매 수치">
        <div><span>최근 7일</span><b>{row.q7 || 0}개</b><small>판매</small></div>
        <div><span>최근 30일</span><b>{row.q30 || 0}개</b><small>판매</small></div>
        <div><span>전체 주문</span><b>{row.total || 0}개</b><small>누적</small></div>
        <div><span>현재 재고</span><b>{row.stock === null ? "확인 필요" : `${row.stock}개`}</b><small>옵션 합계</small></div>
      </div>

      <div className="status-box">
        <b>현재 상태</b>
        <p>{summaryFor(row)}</p>
      </div>

      <div className="todo-box">
        <b>지금 할 일</b>
        {visibleChecks.length ? (
          <ul>
            {visibleChecks.map((item) => <li key={item}>{item}</li>)}
            {checks.length > visibleChecks.length && <li>추가 확인 {checks.length - visibleChecks.length}개</li>}
          </ul>
        ) : (
          <p>지금 바로 확인할 항목은 없어요. 판매 흐름만 계속 보면 됩니다.</p>
        )}
      </div>

      <details>
        <summary>상세 보기</summary>
        <div className="detail-grid">
          <p><span>최근 14일 판매</span><b>{row.q14 || 0}개</b></p>
          <p><span>판매가 발생한 날</span><b>{row.days30 || 0}일</b></p>
          <p><span>최근 30일 취소/반품</span><b>{row.cancels || 0}개</b></p>
          <p><span>최근 판매일</span><b>{row.last || "확인 필요"}</b></p>
        </div>
        {checks.length > 0 && (
          <div className="all-checks">
            <b>확인할 항목 전체</b>
            <ul>{checks.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>
        )}
      </details>
    </article>
  );
}

export default function Reactions() {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/oars-analysis", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw Error(data.error);
      setReport(data.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const rows = report?.rows || [];
  const counts = {
    buy: rows.filter((row) => row.decision === "사입 검토").length,
    watch: rows.filter((row) => row.decision === "관찰").length,
    stock: rows.filter((row) => row.stock === null).length,
    claims: rows.filter((row) => (row.claims || []).length > 0).length,
  };

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => {
      if (filter === "buy") return row.decision === "사입 검토";
      if (filter === "watch") return row.decision === "관찰";
      if (filter === "stop") return row.decision === "추가 사입 중단";
      return true;
    });
    return [...filtered].sort((a, b) => {
      const priority = (row) => row.decision === "사입 검토" ? 0 : row.decision === "관찰" ? 1 : 2;
      return priority(a) - priority(b) || (b.q7 || 0) - (a.q7 || 0) || (b.q30 || 0) - (a.q30 || 0);
    });
  }, [rows, filter]);

  return (
    <main className="reaction-page">
      <header className="page-head">
        <div>
          <small>상품 상태를 쉽게 확인하는 화면</small>
          <h1>상품 반응</h1>
          <p>어떤 상품을 더 볼지, 사입을 검토할지, 무엇을 확인해야 하는지 바로 보여줍니다.</p>
        </div>
        <button onClick={load} disabled={loading}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      {error && <p role="alert">{error} · 마지막으로 불러온 데이터를 보여주고 있습니다.</p>}

      <section className="summary-grid" aria-label="상품 반응 요약">
        <div><span>사입 검토</span><b>{counts.buy}개</b><small>조건이 맞는 상품</small></div>
        <div><span>조금 더 보기</span><b>{counts.watch}개</b><small>추가 판매 확인</small></div>
        <div><span>재고 확인</span><b>{counts.stock}개</b><small>재고 정보 필요</small></div>
        <div><span>취소/반품</span><b>{counts.claims}개</b><small>내역 확인 필요</small></div>
      </section>

      <nav className="filters" aria-label="상품 상태 필터">
        {[
          ["all", "전체"],
          ["buy", "사입 검토"],
          ["watch", "조금 더 보기"],
          ["stop", "추가 주문 중단"],
        ].map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </nav>

      <section className="product-list">
        <div className="list-head"><h2>{filter === "all" ? "전체 상품" : filter === "buy" ? "사입 검토 상품" : filter === "watch" ? "조금 더 볼 상품" : "추가 주문 중단 상품"}</h2><span>{visibleRows.length}개</span></div>
        {visibleRows.length ? visibleRows.map((row) => <ProductCard key={row.key} row={row} />) : <p className="empty">해당 상품이 없습니다.</p>}
      </section>

      {report?.warnings?.length > 0 && (
        <details className="data-warning"><summary>데이터 확인 필요 {report.warnings.length}건</summary><p>상품 판단에 영향을 줄 수 있는 데이터 문제를 모아둔 곳입니다.</p></details>
      )}

      <style jsx global>{`
        .reaction-page{max-width:1080px;margin:auto;padding:26px 18px 70px;color:inherit}.reaction-page .page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}.reaction-page .page-head small,.reaction-page .page-head p{color:#aeb5b8}.reaction-page .page-head h1{font-size:34px;margin:5px 0}.reaction-page .page-head p{margin:0;max-width:720px}.reaction-page .page-head button{padding:11px 16px;border-radius:12px}.reaction-page .summary-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0 14px}.reaction-page .summary-grid div{border:1px solid #343a3d;border-radius:16px;padding:17px;background:#191d1f;display:flex;flex-direction:column;gap:5px}.reaction-page .summary-grid span{font-weight:800}.reaction-page .summary-grid b{font-size:25px}.reaction-page .summary-grid small{color:#aeb5b8}.reaction-page .filters{display:flex;gap:8px;overflow-x:auto;padding:3px 0 12px}.reaction-page .filters button{white-space:nowrap;background:#22282a;border:1px solid #343a3d;color:inherit}.reaction-page .filters button.active{background:#f3f4f6;color:#16191b;border-color:#f3f4f6}.reaction-page .product-list{border:1px solid #343a3d;border-radius:18px;background:#191d1f;padding:18px}.reaction-page .list-head{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 14px;border-bottom:1px solid #303638}.reaction-page .list-head h2{margin:0;font-size:21px}.reaction-page .list-head span{font-weight:800}.reaction-page .product-card{padding:20px 2px;border-bottom:1px solid #303638}.reaction-page .product-card:last-child{border-bottom:0}.reaction-page .card-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.reaction-page .card-head small{color:#929b9f}.reaction-page .card-head h3{margin:5px 0 0;font-size:18px;line-height:1.45}.reaction-page .badges{display:flex;gap:7px;flex-wrap:wrap;justify-content:flex-end}.reaction-page .badges span{border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;white-space:nowrap}.reaction-page .decision.buy{background:#294936}.reaction-page .decision.watch{background:#4a4025}.reaction-page .decision.stop{background:#493032}.reaction-page .trend{background:#252b2d;color:#c5cbce}.reaction-page .metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:16px 0}.reaction-page .metrics>div{background:#22282a;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:3px}.reaction-page .metrics span,.reaction-page .metrics small{color:#aeb5b8;font-size:12px}.reaction-page .metrics b{font-size:19px}.reaction-page .status-box,.reaction-page .todo-box{border-radius:13px;padding:14px 15px;margin-top:9px}.reaction-page .status-box{background:#202527}.reaction-page .todo-box{background:#171b1c;border:1px solid #303638}.reaction-page .status-box p,.reaction-page .todo-box p{margin:6px 0 0;color:#c2c8ca}.reaction-page .todo-box ul,.reaction-page .all-checks ul{margin:8px 0 0;padding-left:20px}.reaction-page .todo-box li,.reaction-page .all-checks li{margin:4px 0;line-height:1.5}.reaction-page .product-card details{margin-top:12px}.reaction-page .product-card summary,.reaction-page .data-warning summary{cursor:pointer;font-weight:800}.reaction-page .detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.reaction-page .detail-grid p{margin:0;padding:11px;border-radius:11px;background:#22282a;display:flex;flex-direction:column;gap:3px}.reaction-page .detail-grid span{font-size:12px;color:#aeb5b8}.reaction-page .all-checks{margin-top:12px;padding:12px;border-radius:11px;background:#202527}.reaction-page .data-warning{margin-top:14px;border:1px solid #343a3d;border-radius:14px;padding:14px 16px;color:#aeb5b8}.reaction-page .empty{color:#aeb5b8;padding:16px 2px;margin:0}@media(max-width:760px){.reaction-page .summary-grid{grid-template-columns:1fr 1fr}.reaction-page .metrics{grid-template-columns:1fr 1fr}.reaction-page .card-head{flex-direction:column}.reaction-page .badges{justify-content:flex-start}.reaction-page .detail-grid{grid-template-columns:1fr 1fr}.reaction-page .page-head h1{font-size:28px}.reaction-page .product-list{padding:15px}}@media(max-width:440px){.reaction-page .summary-grid{grid-template-columns:1fr 1fr}.reaction-page .summary-grid div{padding:14px}.reaction-page .metrics>div{padding:10px}.reaction-page .metrics b{font-size:17px}.reaction-page .detail-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
