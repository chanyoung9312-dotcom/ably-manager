"use client";
import { useEffect, useMemo, useState } from "react";

const won = (v) => `${Math.round(v || 0).toLocaleString("ko-KR")}원`;
const month = (d) => String(d || "").slice(0, 7);
const sum = (rows) => rows.reduce((total, row) => total + (row.sales ?? 0), 0);
const qty = (rows) => rows.reduce((total, row) => total + (row.qty || 0), 0);

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState("all");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dashboard-data", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "불러오기 실패");
      setData(result);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const view = useMemo(() => {
    if (!data) return null;

    const months = [
      ...new Set(data.orders.map((item) => month(item.date)).filter(Boolean)),
    ].sort().reverse();
    const inPeriod = (item) =>
      selected === "all" || month(item.date) === selected;

    const orders = data.orders.filter(inPeriod);
    // 취소·반품 현황은 취소 반품 시트에 기록된 전체 건을 보여준다.
    // 실매출 차감은 기존 원칙대로 완료가 확인된 건(data.cancels)만 반영한다.
    const claims = (data.claims || []).filter(inPeriod);
    const confirmed = (data.cancels || []).filter(inPeriod);
    const before = claims.filter((item) => item.type === "before");
    const after = claims.filter((item) => item.type === "after");
    const returns = claims.filter((item) => item.type === "return");
    const unknown = claims.filter((item) => item.type === "unknown");

    const gross = sum(orders);
    const deducted = sum(confirmed);
    const orderQty = qty(orders);
    const finalQty = Math.max(0, orderQty - qty(confirmed));

    const rows = months.map((m) => {
      const monthOrders = data.orders.filter((item) => month(item.date) === m);
      const monthClaims = (data.claims || []).filter((item) => month(item.date) === m);
      const monthConfirmed = (data.cancels || []).filter(
        (item) => month(item.date) === m,
      );
      const monthBefore = monthClaims.filter((item) => item.type === "before");
      const monthAfter = monthClaims.filter((item) => item.type === "after");
      const monthReturns = monthClaims.filter((item) => item.type === "return");
      const monthUnknown = monthClaims.filter((item) => item.type === "unknown");
      const monthGross = sum(monthOrders);

      return {
        month: m,
        orderQty: qty(monthOrders),
        gross: monthGross,
        beforeQty: qty(monthBefore),
        before: sum(monthBefore),
        afterQty: qty(monthAfter),
        after: sum(monthAfter),
        returnQty: qty(monthReturns),
        returns: sum(monthReturns),
        unknownQty: qty(monthUnknown),
        net: monthGross - sum(monthConfirmed),
        finalQty: Math.max(0, qty(monthOrders) - qty(monthConfirmed)),
      };
    });

    return {
      months,
      before,
      after,
      returns,
      unknown,
      gross,
      net: gross - deducted,
      orderQty,
      finalQty,
      rows,
    };
  }, [data, selected]);

  return (
    <main className="sales-wrap">
      <header>
        <div>
          <small>주문 · 취소 · 반품 · 실매출</small>
          <h1>매출 현황</h1>
          <p>주문부터 취소, 반품, 실제 남은 매출까지 한눈에 확인합니다.</p>
        </div>
        <button onClick={load} disabled={loading}>
          {loading ? "불러오는 중" : "새로고침"}
        </button>
      </header>

      {error && <p role="alert">{error}</p>}

      {view && (
        <>
          <section className="filter">
            <label htmlFor="sales-period">기간</label>
            <select
              id="sales-period"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="all">전체 기간</option>
              {view.months.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </section>

          <section className="summary" aria-label="매출 요약">
            <article>
              <span>총 주문</span>
              <b>{view.orderQty}건</b>
              <small>{won(view.gross)}</small>
            </article>
            <article>
              <span>발주 전 취소</span>
              <b>{qty(view.before)}건</b>
              <small>{won(sum(view.before))}</small>
            </article>
            <article>
              <span>발주 후 취소</span>
              <b>{qty(view.after)}건</b>
              <small>{won(sum(view.after))}</small>
            </article>
            <article>
              <span>반품</span>
              <b>{qty(view.returns)}건</b>
              <small>{won(sum(view.returns))}</small>
            </article>
          </section>

          <section className="net">
            <div>
              <span>실매출</span>
              <small>취소·반품 완료건 반영</small>
            </div>
            <b>{won(view.net)}</b>
            <strong>{view.finalQty}건 판매</strong>
          </section>

          <section className="table-card">
            <div className="title">
              <h2>월별 매출 현황</h2>
              <span>취소·반품은 시트에 기록된 건을 기준으로 표시합니다.</span>
            </div>
            <div className="scroll">
              <table>
                <thead>
                  <tr>
                    <th>월</th>
                    <th>주문</th>
                    <th>총 주문금액</th>
                    <th>발주 전 취소</th>
                    <th>발주 후 취소</th>
                    <th>반품</th>
                    <th>실매출</th>
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.month}</td>
                      <td>{row.orderQty}건</td>
                      <td>{won(row.gross)}</td>
                      <td>
                        {row.beforeQty}건 / {won(row.before)}
                      </td>
                      <td>
                        {row.afterQty}건 / {won(row.after)}
                      </td>
                      <td>
                        {row.returnQty}건 / {won(row.returns)}
                      </td>
                      <td>
                        <b>{won(row.net)}</b>
                        <small>{row.finalQty}건 판매</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {view.unknown.length > 0 && (
            <section className="notice">
              <b>취소 구분 확인 필요 {qty(view.unknown)}건</b>
              <span>
                취소는 기록되어 있지만 발주 전·후 구분이 없는 주문입니다.
              </span>
            </section>
          )}

          {data?.warnings?.length > 0 && (
            <details className="debug">
              <summary>⚠ 데이터 확인 필요 {data.warnings.length}건</summary>
              {data.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </details>
          )}
        </>
      )}

      <style jsx>{`
        .sales-wrap{max-width:1180px;margin:auto;padding:28px 18px 70px}
        header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap}
        header h1{font-size:34px;margin:5px 0}
        header p{margin:0;color:#aeb5b8}
        header small{color:#aeb5b8;font-weight:700}
        button,select{font:inherit;padding:11px 14px;border-radius:11px}
        .filter{display:flex;justify-content:space-between;align-items:center;margin:24px 0 12px;padding:14px 16px;border:1px solid #343a3d;border-radius:14px;background:#191d1f}
        .filter label{font-weight:800}
        .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
        .summary article,.net,.table-card,.notice,.debug{border:1px solid #343a3d;border-radius:16px;background:#191d1f}
        .summary article{padding:18px;display:flex;flex-direction:column;gap:7px;min-height:116px}
        .summary span,.summary small,.net small,.title span,.notice span{color:#aeb5b8}
        .summary b{font-size:26px;line-height:1.15}
        .summary small{font-size:14px}
        .net{margin-top:12px;padding:20px;display:grid;grid-template-columns:1fr auto auto;align-items:center;gap:22px}
        .net div{display:flex;flex-direction:column;gap:4px}
        .net span{font-size:16px;font-weight:800}
        .net>b{font-size:32px}
        .net strong{font-size:17px;white-space:nowrap}
        .table-card{margin-top:14px;padding:18px}
        .title{display:flex;justify-content:space-between;align-items:center;gap:12px}
        .title h2{margin:0 0 12px}
        .scroll{overflow-x:auto}
        table{width:100%;border-collapse:collapse;min-width:940px}
        th,td{padding:13px 8px;border-bottom:1px solid #303638;text-align:right;font-size:14px}
        th:first-child,td:first-child{text-align:left}
        td:last-child b,td:last-child small{display:block}
        td:last-child small{margin-top:3px;color:#aeb5b8}
        .notice,.debug{margin-top:14px;padding:16px}
        .notice{display:flex;gap:12px;justify-content:space-between}
        .debug{font-size:13px;color:#aeb5b8}
        .debug summary{cursor:pointer;font-weight:800}
        @media(max-width:900px){.summary{grid-template-columns:1fr 1fr}.net{grid-template-columns:1fr auto}.net strong{grid-column:1/-1}}
        @media(max-width:620px){.summary{grid-template-columns:1fr 1fr}.summary article{min-height:104px;padding:15px}.summary b{font-size:22px}.net{grid-template-columns:1fr;gap:7px}.net>b{font-size:29px}.title,.notice{align-items:flex-start;flex-direction:column}header h1{font-size:28px}.filter{margin-top:20px}}
      `}</style>
    </main>
  );
}
