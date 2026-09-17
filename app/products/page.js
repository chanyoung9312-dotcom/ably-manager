"use client";
import { useEffect, useMemo, useState } from "react";

function stockState(row) {
  if (row.stock === null) return { key: "check", label: "재고 확인 필요" };
  if (row.stock === 0) return { key: "out", label: "품절" };
  if (row.stockDays !== null && row.stockDays < 7) return { key: "low", label: "재고 적음" };
  return { key: "ok", label: "재고 있음" };
}

function stockAction(row) {
  if (row.stock === null) return "옵션별 재고 수량 확인";
  if (row.stock === 0) return "재입고 여부 확인";
  if (row.stockDays !== null && row.stockDays < 7) return "재고 소진 전 추가 입고 가능 여부 확인";
  return "현재 재고 유지";
}

export default function Products() {
  const [report, setReport] = useState(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("stock");
  const [filter, setFilter] = useState("all");
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

  const allRows = report?.rows || [];
  const rows = useMemo(() => {
    const filtered = allRows.filter((row) => {
      const matchesQuery = `${row.name} ${row.productNo}`.toLowerCase().includes(query.toLowerCase());
      if (!matchesQuery) return false;
      const state = stockState(row).key;
      if (filter === "all") return true;
      if (filter === "in") return row.stock !== null && row.stock > 0;
      return state === filter;
    });
    return [...filtered].sort((a, b) => {
      if (sort === "sales") return (b.q30 || 0) - (a.q30 || 0);
      if (sort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ko");
      return (b.stock ?? -1) - (a.stock ?? -1);
    });
  }, [allRows, query, sort, filter]);

  const registered = allRows.filter((row) => (row.options || []).length > 0).length;
  const totalStock = allRows.reduce((sum, row) => sum + (row.stock ?? 0), 0);
  const unknown = allRows.filter((row) => row.stock === null).length;
  const low = allRows.filter((row) => row.stock !== null && row.stock > 0 && row.stockDays !== null && row.stockDays < 7).length;

  return (
    <main className="inventory-page">
      <header className="inventory-head">
        <div>
          <small>수량과 옵션만 관리하는 화면</small>
          <h1>재고 현황</h1>
          <p>사입 판단은 빼고, 지금 가진 재고와 옵션별 수량만 빠르게 확인합니다.</p>
        </div>
        <button disabled={loading} onClick={load}>{loading ? "불러오는 중" : "새로고침"}</button>
      </header>

      {error && <p role="alert">{error} · 마지막으로 불러온 데이터를 보여주고 있습니다.</p>}

      <section className="inventory-stats" aria-label="재고 요약">
        <div><span>재고 등록 상품</span><b>{registered}개</b></div>
        <div><span>전체 보유 재고</span><b>{totalStock}개</b></div>
        <div><span>재고 확인 필요</span><b>{unknown}개</b></div>
        <div><span>7일 안에 부족 예상</span><b>{low}개</b></div>
      </section>

      <section className="inventory-toolbar">
        <label className="search-box">
          <span>상품 검색</span>
          <input aria-label="상품 검색" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="상품명 또는 상품번호" />
        </label>
        <label>
          <span>정렬</span>
          <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="stock">재고 많은 순</option>
            <option value="sales">최근 30일 판매 많은 순</option>
            <option value="name">상품명 순</option>
          </select>
        </label>
      </section>

      <nav className="stock-filters" aria-label="재고 상태 필터">
        {[["all", "전체"], ["in", "재고 있음"], ["out", "품절"], ["low", "재고 적음"], ["check", "확인 필요"]].map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </nav>

      <section className="inventory-list">
        <div className="inventory-list-head"><h2>상품 재고</h2></div>
        {rows.length ? rows.map((row) => {
          const state = stockState(row);
          const options = row.options || [];
          return (
            <article className="inventory-row" key={row.key}>
              <div className="inventory-title">
                <div>
                  <small>{row.productNo ? `상품번호 ${row.productNo}` : "상품번호 확인 필요"}</small>
                  <h3>{row.name || "상품명 확인 필요"}</h3>
                </div>
                <span className={`stock-badge ${state.key}`}>{state.label}</span>
              </div>

              <div className="inventory-metrics">
                <div className="stock-main"><span>현재 재고</span><b>{row.stock === null ? "확인 필요" : `${row.stock}개`}</b></div>
                <div><span>옵션</span><b>{options.length}개</b></div>
                <div><span>최근 30일 판매</span><b>{row.q30 || 0}개</b></div>
              </div>

              <div className="inventory-action"><span>재고 확인</span><b>{stockAction(row)}</b></div>

              <details>
                <summary>옵션별 재고 보기</summary>
                {options.length > 0 ? (
                  <div className="option-grid">
                    {options.map((option, i) => (
                      <div className={option.invalid || option.qty === null ? "option-card check" : option.qty === 0 ? "option-card out" : "option-card"} key={`${option.color}-${option.size}-${i}`}>
                        <span>{option.color || "색상 미확인"} · {option.size || "사이즈 미확인"}</span>
                        <b>{option.qty === null ? "확인 필요" : `${option.qty}개`}</b>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="no-options">등록된 옵션 재고가 없습니다.</p>
                )}
              </details>
            </article>
          );
        }) : <p className="empty">조건에 맞는 상품이 없습니다.</p>}
      </section>

      <style jsx>{`
        .inventory-page{max-width:1080px;margin:auto;padding:26px 18px 70px;color:inherit}.inventory-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}.inventory-head small,.inventory-head p{color:#aeb5b8}.inventory-head h1{font-size:34px;margin:5px 0}.inventory-head p{margin:0}.inventory-head button{padding:11px 16px;border-radius:12px}.inventory-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0 14px}.inventory-stats div{border:1px solid #343a3d;border-radius:15px;padding:16px;background:#191d1f;display:flex;flex-direction:column;gap:4px}.inventory-stats span{color:#aeb5b8;font-size:13px}.inventory-stats b{font-size:24px}.inventory-toolbar{display:grid;grid-template-columns:1fr 230px;gap:10px}.inventory-toolbar label{display:flex;flex-direction:column;gap:6px}.inventory-toolbar label>span{font-size:12px;color:#aeb5b8}.inventory-toolbar input,.inventory-toolbar select{width:100%;min-height:46px;padding:0 13px;border-radius:11px;border:1px solid #3a4043;background:#191d1f;color:inherit}.stock-filters{display:flex;gap:8px;overflow-x:auto;padding:12px 0}.stock-filters button{white-space:nowrap;background:#22282a;border:1px solid #343a3d;color:inherit}.stock-filters button.active{background:#f3f4f6;color:#16191b;border-color:#f3f4f6}.inventory-list{border:1px solid #343a3d;border-radius:18px;background:#191d1f;padding:18px}.inventory-list-head{padding:2px 2px 14px;border-bottom:1px solid #303638}.inventory-list-head h2{margin:0;font-size:21px}.inventory-row{padding:20px 2px;border-bottom:1px solid #303638}.inventory-row:last-child{border-bottom:0}.inventory-title{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.inventory-title small{color:#929b9f}.inventory-title h3{margin:5px 0 0;font-size:18px;line-height:1.45}.stock-badge{border-radius:999px;padding:6px 9px;font-size:12px;font-weight:800;white-space:nowrap;background:#294936}.stock-badge.out{background:#493032}.stock-badge.low{background:#4a4025}.stock-badge.check{background:#3a3f42}.inventory-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:15px 0}.inventory-metrics>div{background:#22282a;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:3px}.inventory-metrics .stock-main{background:#252d29}.inventory-metrics span{color:#aeb5b8;font-size:12px}.inventory-metrics b{font-size:19px}.inventory-action{display:flex;justify-content:space-between;gap:12px;padding:13px 14px;border:1px solid #303638;border-radius:12px;background:#171b1c}.inventory-action span{color:#aeb5b8}.inventory-row details{margin-top:12px}.inventory-row summary{cursor:pointer;font-weight:800}.option-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px;margin-top:12px}.option-card{padding:11px 12px;border-radius:11px;background:#22282a;display:flex;justify-content:space-between;gap:10px}.option-card span{font-size:13px;color:#c2c8ca}.option-card.out{background:#37272a}.option-card.check{background:#303437}.no-options,.empty{color:#aeb5b8}.empty{padding:16px 2px;margin:0}@media(max-width:760px){.inventory-stats{grid-template-columns:1fr 1fr}.inventory-toolbar{grid-template-columns:1fr}.inventory-metrics{grid-template-columns:1fr 1fr}.inventory-title{flex-direction:column}.inventory-head h1{font-size:28px}.inventory-list{padding:15px}}@media(max-width:440px){.inventory-stats{grid-template-columns:1fr}.inventory-metrics{grid-template-columns:1fr}.inventory-action{flex-direction:column;gap:4px}.option-grid{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}
