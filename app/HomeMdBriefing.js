"use client";
import { useEffect, useState } from "react";
const won = (n) => `${Math.round(n || 0).toLocaleString("ko-KR")}원`;
function Product({ p }) {
  return (
    <article className="md-product">
      <b>
        {p.grade}급 · {p.name || "상품명 미확인"}
      </b>
      <small>
        {p.productNo || "상품번호 연결 필요"} · {p.stage} · {p.speed}
      </small>
      <p>{p.reason}</p>
      <p>
        <strong>
          {p.decision} · {p.buy}
        </strong>
        <br />
        {p.timing} · {p.observe}
      </p>
      <small>
        재고 {p.stock === null ? "미확인" : `${p.stock}개`} · 등록일{" "}
        {p.registeredAt || "미확인"} · 최근 유효 주문일 {p.last || "없음"} ·
        평균 주문일 간격{" "}
        {p.meanGap === null ? "계산 불가" : `${p.meanGap.toFixed(1)}일`}
      </small>
      <details>
        <summary>7/14/30일 근거와 사입 수량</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>기간</th>
                <th>주문 반응</th>
                <th>순판매</th>
                <th>이전 순판매</th>
                <th>비교</th>
              </tr>
            </thead>
            <tbody>
              {p.windows.map((w) => (
                <tr key={w.days}>
                  <td>{w.days}일</td>
                  <td>{w.current.qty}개</td>
                  <td>{w.current.net}개</td>
                  <td>{w.previous.net}개</td>
                  <td>{w.comparable ? "동일 기간" : "수집 범위 미확인"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          최근 30일 취소·반품 {p.cancels}개 · 주문 하루 집중도{" "}
          {(p.concentration * 100).toFixed(0)}%. 순판매에는 미확정 클레임이 남아
          있으며 사입 판단에서는 제외합니다.
        </p>
        {p.quantities ? (
          <p>
            보수적 {p.quantities.conservative}개 / 추천{" "}
            {p.quantities.recommended}개 / 공격적 {p.quantities.aggressive}개
            <br />
            최근 7·14일 중 낮은 일평균 × (공급기간 + 관찰기간) − (현재재고 +
            입고예정 − 예약재고). 상품 합계 시나리오이며 옵션
            배분·원가·예산·계절성 확인 후 발주하세요.
          </p>
        ) : (
          <p>사입 수량 보류: 수요 지속성과 공급·재고 조건을 먼저 확인합니다.</p>
        )}
        {p.missing.length > 0 && <p>필요한 정보: {p.missing.join(" / ")}</p>}
      </details>
    </article>
  );
}
export default function HomeMdBriefing() {
  const [report, setReport] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/oars-analysis", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw Error(j.error || "분석 실패");
      setReport(j.report);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);
  const group = (title, arr) => (
    <section className="md-section">
      <h2>{title}</h2>
      {arr.length ? (
        arr.slice(0, 5).map((p) => <Product key={p.key} p={p} />)
      ) : (
        <p>현재 근거가 충분한 상품이 없습니다.</p>
      )}
    </section>
  );
  const rows = report?.rows || [],
    buy = rows.filter((p) => p.decision === "사입 검토"),
    watch = rows.filter((p) => p.decision === "관찰"),
    stop = rows.filter((p) => p.decision === "추가 사입 중단"),
    risks = rows.filter((p) => p.claims.length || p.speed.includes("둔화")),
    seven = report?.trends[0];
  return (
    <div className="md-report">
      <header className="row">
        <div>
          <small>OARS DAILY REPORT</small>
          <h1>오늘의 MD 총분석</h1>
          <p>주문 반응과 취소·반품 차감 판매를 나누어 판단합니다.</p>
        </div>
        <button onClick={load} disabled={loading}>
          {loading ? "분석 중" : "새로고침"}
        </button>
      </header>
      {error && (
        <p role="alert">
          {error}
          {report ? " · 아래는 마지막 성공 조회 데이터입니다." : ""}
        </p>
      )}
      {loading && !report && (
        <p role="status">주문·재고·MD 데이터를 읽고 있습니다.</p>
      )}
      {report && (
        <>
          <small>
            한국 날짜 {report.today} · 조회{" "}
            {new Date(report.updatedAt).toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
            })}{" "}
            · 당일은 진행 중입니다.
          </small>
          <details className="md-section" open={report.warnings.length > 0}>
            <summary>
              데이터 점검 {report.warnings.length}건 · 분석 기준
            </summary>
            <p>
              매출은 판매가{" "}
              {report.salesMode === "unit" ? "단가 × 수량" : "행 합계"}{" "}
              기준입니다. 결제액·배송비·정산금과 다를 수 있습니다. 클레임은
              완료·수량이 확인된 건만 원주문 결제일에 차감합니다.
            </p>
            <p>
              재고는 시트 스냅샷입니다. 반품 입고·검수가 확인되지 않으면 재고로
              더하지 않습니다. 노출 정보가 없어 무판매 상품을 D급으로 단정하지
              않습니다.
            </p>
            {report.warnings.map((w, i) => (
              <p key={i}>{w}</p>
            ))}
          </details>
          <section className="md-section">
            <h2>1. 📊 현재 매출 상태</h2>
            <div className="md-kpis">
              <div>
                7일 주문매출<b>{won(seven.current.sales)}</b>
              </div>
              <div>
                7일 잠정 순매출<b>{won(seven.current.netSales)}</b>
              </div>
              <div>
                주문 / 순판매
                <b>
                  {seven.current.qty} / {seven.current.net}개
                </b>
              </div>
              <div>
                고유 주문<b>{seven.current.orderCount}건</b>
              </div>
            </div>
          </section>
          <section className="md-section">
            <h2>2. 📈 이전 기간 대비 변화</h2>
            {report.trends.map((t) => (
              <p key={t.days}>
                최근 {t.days}일 순판매 {t.current.net}개 / 이전 {t.days}일{" "}
                {t.previous.net}개 ·{" "}
                {!t.comparable
                  ? "수집 범위 확인 전 판단 보류"
                  : t.change === null
                    ? "이전 순판매 0개, 증감률 계산 불가"
                    : `${t.change.toFixed(1)}%`}
              </p>
            ))}
          </section>
          {group(
            "3. 🏆 잘 팔리는 상품 TOP",
            rows.filter((p) => p.grade === "S"),
          )}
          {group(
            "4. 🌱 성장 가능 상품",
            rows.filter((p) => p.grade === "A"),
          )}
          {group("5. ⚠️ 점검이 필요한 상품", risks)}
          {group("6. 📦 사입 검토 상품", buy)}
          {group("7. ⏳ 아직 기다려야 할 상품", watch)}
          {group("8. 🛑 추가 사입 비추천 상품", stop)}
          <section className="md-section">
            <h2>9. 🔍 매출 변화 원인</h2>
            <p>
              주문수량과 취소·반품 차감은 확인할 수 있습니다. 노출·클릭·가격
              변경·배송 안내 이력이 없어 매출 변화의 원인을 확정할 수 없습니다.
              취소 사유를 먼저 확인하고, 배송지연 취소를 상품 경쟁력 하락과
              구별하세요.
            </p>
            <h2>10. 🛒 다음 소싱 방향</h2>
            <p>
              반복 유효 주문이 확인된 상품의 실제 사진·옵션·가격을 비교해 인접
              상품을 테스트합니다. 현재 연결된 데이터만으로 핏·소재·디자인
              공통점을 단정하지 않습니다.
            </p>
          </section>
          <section className="md-section">
            <h2>11. 📋 상품별 액션 리스트</h2>
            {rows.slice(0, 10).map((p) => (
              <p key={p.key}>
                <b>{p.name}</b> → {p.decision} ·{" "}
                {p.missing.length ? p.missing.join(", ") : p.observe}
              </p>
            ))}
            {rows.length > 10 && (
              <details>
                <summary>나머지 {rows.length - 10}개 상품 액션 보기</summary>
                {rows.slice(10).map((p) => (
                  <p key={p.key}>
                    <b>{p.name}</b> → {p.decision} ·{" "}
                    {p.missing.length ? p.missing.join(", ") : p.observe}
                  </p>
                ))}
              </details>
            )}
          </section>
          <section className="md-section">
            <h2>12. 🎯 오늘 해야 할 일 TOP 5</h2>
            {[
              ...(report.warnings.length
                ? ["🔴 오늘: 데이터 점검 항목부터 확인"]
                : []),
              ...buy
                .slice(0, 2)
                .map((p) => `🔴 오늘: ${p.name} — ${p.buy} · 공급조건 확인`),
              ...risks
                .slice(0, 1)
                .map(
                  (p) => `🟡 이번 주: ${p.name} — 클레임 사유·잔여재고 확인`,
                ),
              ...watch
                .slice(0, 2)
                .map((p) => `🟢 관찰: ${p.name} — ${p.observe}`),
            ]
              .slice(0, 5)
              .map((a, i) => (
                <p key={i}>{a}</p>
              ))}
          </section>
          <section className="md-section">
            <h2>MD 결론</h2>
            <p>
              {buy.length
                ? `${buy[0].name}부터 사입 조건을 검토하세요. 제시 수량은 시나리오이므로 옵션·원가·공급일정을 확인한 뒤 실행합니다.`
                : "현재는 사입을 확정할 근거가 부족합니다. 무재고 테스트를 유지하고 반복 유효 주문과 재고·공급 조건을 먼저 확인하세요."}{" "}
              다음 소싱은 반복 판매 상품에서 사진과 데이터로 확인되는 특징을
              기준으로 확장합니다.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
