"use client";
import { useEffect, useMemo, useState } from "react";

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
  return text.replaceAll("클레임", "취소/반품").replaceAll("MD ", "");
};

function nextAction(row) {
  const first = (row.missing || []).map(easyCheck).find(Boolean);
  if (first) return first;
  if (row.decision === "사입 검토") return "사입 수량 검토";
  if (row.decision === "추가 사입 중단") return "현재 재고 먼저 소진";
  if ((row.q30 || 0) > 0 && (row.days30 || 0) < 3) return "다른 날짜 주문 더 확인";
  return "판매 흐름 계속 확인";
}

export default function Products() {
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  const rows = useMemo(() => {
    const filtered = (report?.rows || []).filter((row) =>
      `${row.name} ${row.productNo}`.toLowerCase().includes(query.toLowerCase()),
    );
    return [...filtered].sort((a, b) =>
      sort === "orders"
        ? (b.total || 0) - (a.total || 0)
        : sort === "stock"
          ? (b.stock ?? -1) - (a.stock ?? -1)
          : (b.q7 || 0) - (a.q7 || 0) || (b.q30 || 0) - (a.q30 || 0),
    );
  }, [report, query, sort]);

  const totalProducts = report?.rows?.length || 0;
  const soldRecently = (report?.rows || []).filter((row) => (row.q30 || 0) > 0).length;
  const stockUnknown = (report?.rows || []).filter((row) => row.stock === null).length;

  return (
    <main className="products-page">
      <header className="page-head">
        <div>
          <small>상품별 판매 · 재고 · 현재 상태</small>
          <h1>상품별 판매 현황</h1>
          <p>긴 표 대신 필요한 숫자와 다음 행동만 먼저 보여줍니다.</p>
        </div>
        <button disabled={loading} onClick={load}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      {error && <p role="alert">{error} · 마지막으로 불러온 데이터를 보여주고 있습니다.</p>}

      <section className="top-stats">
        <div><span>전체 상품</span><b>{totalProducts}개</b></div>
        <div><span>최근 30일 판매 있음</span><b>{soldRecently}개</b></div>
        <div><span>재고 확인 필요</span><b>{stockUnknown}개</b></div>
      </section>

      <section className="toolbar">
        <label>
          <span>상품 검색</span>
          <input aria-label="상품 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품명 또는 상품번호" />
        </label>
        <label>
          <span>정렬</span>
          <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="recent">최근 판매 많은 순</option>
            <option value="orders">전체 주문 많은 순</option>
            <option value="stock">재고 많은 순</option>
          </select>
        </label>
      </section>

      <section className="product-list">
        <div className="list-head"><h2>상품 목록</h2><span>{rows.length}개</span></div>
        {rows.length ? rows.map((row) => {
          const checks = (row.missing || []).map(easyCheck).filter(Boolean);
          return (
            <article className="product-row" key={row.key}>
              <div className="product-title">
                <div>
                  <small>{row.productNo ? `상품번호 ${row.productNo}` : "상품번호 확인 필요"}</small>
                  <h3>{row.name}</h3>
                </div>
                <span className={`status ${row.decision === "사입 검토" ? "buy" : row.decision === "추가 사입 중단" ? "stop" : "watch"}`}>{decisionLabel(row)}</span>
              </div>

              <div className="metrics">
                <div><span>최근 7일</span><b>{row.q7 || 0}개</b><small>판매</small></div>
                <div><span>최근 30일</span><b>{row.q30 || 0}개</b><small>판매</small></div>
                <div><span>전체 주문</span><b>{row.total || 0}개</b><small>누적</small></div>
                <div><span>현재 재고</span><b>{row.stock === null ? "확인 필요" : `${row.stock}개`}</b><small>옵션 합계</small></div>
              </div>

              <div className="next-action"><span>다음 할 일</span><b>{nextAction(row)}</b></div>

              <details>
                <summary>상세 보기</summary>
                <div className="detail-grid">
                  <p><span>최근 14일 판매</span><b>{row.q14 || 0}개</b></p>
                  <p><span>전체 실제 판매</span><b>{row.netTotal || 0}개</b></p>
                  <p><span>판매가 발생한 날</span><b>{row.days30 || 0}일</b></p>
                  <p><span>최근 30일 취소/반품</span><b>{row.cancels || 0}개</b></p>
                </div>
                {(row.options || []).length > 0 && (
                  <div className="detail-block">
                    <b>옵션별 재고</b>
                    <div className="option-list">{row.options.map((option, i) => <span key={i}>{option.color || "색상 미확인"} · {option.size || "사이즈 미확인"} · {option.qty === null ? "재고 확인 필요" : `${option.qty}개`}{option.invalid ? " · 점검 필요" : ""}</span>)}</div>
                  </div>
                )}
                {checks.length > 0 && (
                  <div className="detail-block">
                    <b>확인할 항목</b>
                    <ul>{[...new Set(checks)].map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                )}
              </details>
            </article>
          );
        }) : <p className="empty">검색 결과가 없습니다.</p>}
      </section>

      <style jsx>{`
        .products-page{max-width:1080px;margin:auto;padding:26px 18px 70px;color:inherit}.page-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}.page-head small,.page-head p{color:#aeb5b8}.page-head h1{font-size:34px;margin:5px 0}.page-head p{margin:0}.page-head button{padding:11px 16px;border-radius:12px}.top-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:24px 0 14px}.top-stats div{border:1px solid #343a3d;border-radius:15px;padding:16px;background:#191d1f;display:flex;flex-direction:column;gap:4px}.top-stats span{color:#aeb5b8;font-size:13px}.top-stats b{font-size:24px}.toolbar{display:grid;grid-template-columns:1fr 220px;gap:10px;margin-bottom:14px}.toolbar label{display:flex;flex-direction:column;gap:6px}.toolbar label>span{font-size:12px;color:#aeb5b8}.toolbar input,.toolbar select{width:100%;min-height:46px;padding:0 13px;border-radius:11px;border:1px solid #3a4043;background:#191d1f;color:inherit}.product-list{border:1px solid #343a3d;border-radius:18px;background:#191d1f;padding:18px}.list-head{display:flex;justify-content:space-between;align-items:center;padding:2px 2px 14px;border-bottom:1px solid #303638}.list-head h2{margin:0;font-size:21px}.list-head span{font-weight:800}.product-row{padding:20px 2px;border-bottom:1px solid #303638}.product-row:last-child{border-bottom:0}.product-title{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.product-title small{color:#929b9f}.product-title h3{margin:5px 0 0;font-size:18px;line-height:1.45}.status{border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;white-space:nowrap}.status.buy{background:#294936}.status.watch{background:#4a4025}.status.stop{background:#493032}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:15px 0}.metrics>div{background:#22282a;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:3px}.metrics span,.metrics small{color:#aeb5b8;font-size:12px}.metrics b{font-size:19px}.next-action{display:flex;justify-content:space-between;gap:12px;padding:13px 14px;border:1px solid #303638;border-radius:12px;background:#171b1c}.next-action span{color:#aeb5b8}.product-row details{margin-top:12px}.product-row summary{cursor:pointer;font-weight:800}.detail-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}.detail-grid p{margin:0;padding:11px;border-radius:11px;background:#22282a;display:flex;flex-direction:column;gap:3px}.detail-grid span{font-size:12px;color:#aeb5b8}.detail-block{margin-top:12px;padding:13px;border-radius:11px;background:#202527}.detail-block ul{margin:8px 0 0;padding-left:20px}.option-list{display:flex;flex-wrap:wrap;gap:7px;margin-top:9px}.option-list span{background:#272d2f;border-radius:9px;padding:7px 9px;font-size:13px}.empty{color:#aeb5b8;padding:16px 2px;margin:0}@media(max-width:760px){.top-stats{grid-template-columns:1fr 1fr}.toolbar{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.product-title{flex-direction:column}.detail-grid{grid-template-columns:1fr 1fr}.page-head h1{font-size:28px}.product-list{padding:15px}}@media(max-width:440px){.top-stats{grid-template-columns:1fr}.detail-grid{grid-template-columns:1fr}.next-action{flex-direction:column;gap:4px}}
      `}</style>
    </main>
  );
}
