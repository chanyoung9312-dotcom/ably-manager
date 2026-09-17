"use client";
import { useEffect, useState } from "react";
export default function Reactions() {
  const [report, setReport] = useState(null),
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
  const rows = report?.rows || [],
    groups = [
      ["🔥 최근 판매 가속", rows.filter((r) => r.speed.includes("가속"))],
      ["👀 초기 반응", rows.filter((r) => r.stage === "초기 반응")],
      [
        "➡️ 반복 유효 주문",
        rows.filter((r) =>
          ["판매 가능성 있음", "지속 판매 확인"].includes(r.stage),
        ),
      ],
      ["📉 판매 둔화", rows.filter((r) => r.speed.includes("둔화"))],
      [
        "⚠️ 공급기간 대비 재고 확인",
        rows.filter((r) => r.stockDays !== null && r.stockDays < 7),
      ],
      ["📦 취소·반품 확인", rows.filter((r) => r.claims.length)],
      ["❓ 데이터 부족", rows.filter((r) => r.missing.length)],
    ];
  return (
    <main className="md-report">
      <a href="/">← OARS Manager</a>
      <div className="row">
        <h1>상품 반응</h1>
        <button onClick={load} disabled={loading}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </div>
      {error && (
        <p role="alert">{error} · 표시 데이터는 마지막 성공 조회 기준입니다.</p>
      )}
      <p>
        모든 수치는 홈 MD와 같은 원장·한국 날짜 기준입니다. 최근 일평균 7일분
        미만의 재고는 확인 대상으로 표시하며 공급기간 미확인 상태에서 품절을
        단정하지 않습니다.
      </p>
      {groups.map(([title, items]) => (
        <section className="md-section" key={title}>
          <h2>
            {title} · {items.length}개
          </h2>
          {items.map((r) => (
            <article className="md-product" key={r.key}>
              <b>{r.name}</b>
              <p>{r.reason}</p>
              <small>
                {r.decision} · 재고{" "}
                {r.stock === null ? "미확인" : `${r.stock}개`} ·{" "}
                {r.missing.join(" / ")}
              </small>
            </article>
          ))}
          {!items.length && <p>해당 상품 없음</p>}
        </section>
      ))}
    </main>
  );
}
