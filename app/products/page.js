"use client";
import { useEffect, useState } from "react";
export default function Products() {
  const [report, setReport] = useState(null),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("recent"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/oars-analysis", { cache: "no-store" }),
        d = await r.json();
      if (!r.ok) throw Error(d.error);
      setReport(d.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const rows = (report?.rows || [])
    .filter((p) =>
      (p.name + " " + p.productNo).toLowerCase().includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "orders"
        ? b.total - a.total
        : sort === "stock"
          ? (b.stock ?? -1) - (a.stock ?? -1)
          : b.q7 - a.q7,
    );
  return (
    <main className="md-report">
      <div className="row">
        <h1>상품별 판매분석</h1>
        <button disabled={loading} onClick={load}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </div>
      {error && <p role="alert">{error} · 마지막 성공 조회 데이터입니다.</p>}
      <p>
        한국 날짜 {report?.today} · 7/14/30일은 취소·반품 완료 수량을 차감한
        순판매입니다. 진행 중 클레임은 별도 확인합니다.
      </p>
      <div className="actions">
        <input
          aria-label="상품 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="상품명·상품번호"
        />
        <select
          aria-label="정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="recent">최근 판매순</option>
          <option value="orders">전체 주문순</option>
          <option value="stock">재고순</option>
        </select>
      </div>
      <section className="md-section table-scroll">
        <table>
          <thead>
            <tr>
              {[
                "상품번호 / 상품명",
                "주문 반응",
                "순판매 누계",
                "7일",
                "14일",
                "30일",
                "현재재고",
                "옵션",
                "MD 판단",
              ].map((t) => (
                <th key={t}>{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.key}>
                <td>
                  {p.productNo || "미연결"}
                  <br />
                  <b>{p.name}</b>
                </td>
                <td>{p.total}</td>
                <td>{p.netTotal}</td>
                <td>{p.q7}</td>
                <td>{p.q14}</td>
                <td>{p.q30}</td>
                <td>{p.stock ?? "미확인"}</td>
                <td>
                  {p.options.map((o, i) => (
                    <div key={i}>
                      {o.color} · {o.size} {o.qty ?? "미확인"}개
                      {o.invalid ? " (점검 필요)" : ""}
                    </div>
                  ))}
                </td>
                <td>
                  {p.grade}급 · {p.decision}
                  <br />
                  {p.missing.join(" / ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
