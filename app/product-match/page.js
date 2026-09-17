"use client";
import { useState } from "react";
import * as XLSX from "xlsx";
const t = (v) => String(v ?? "").trim();
export default function ProductMatch() {
  const [files, setFiles] = useState([]),
    [goods, setGoods] = useState([]),
    [loading, setLoading] = useState(false),
    [result, setResult] = useState(null),
    [error, setError] = useState("");
  async function load(e) {
    const fs = [...(e.target.files || [])];
    setFiles(fs);
    setResult(null);
    setError("");
    try {
      const all = [];
      for (const f of fs) {
        if (f.size > 10 * 1024 * 1024) throw new Error("파일 크기 초과");
        const w = XLSX.read(await f.arrayBuffer(), { type: "array" }),
          s = w.Sheets[w.SheetNames[0]],
          rows = XLSX.utils.sheet_to_json(s, { defval: "", raw: false });
        for (const r of rows)
          all.push({
            productNo: t(r["상품 번호"] || r["상품번호"]),
            name: t(r["상품명"]),
            category: t(r["카테고리"]),
            registeredAt: t(r["상품등록일"]),
          });
      }
      setGoods([
        ...new Map(
          all.filter((x) => x.productNo && x.name).map((x) => [x.productNo, x]),
        ).values(),
      ]);
    } catch {
      setGoods([]);
      setError("상품목록 CSV를 읽지 못했습니다.");
    }
  }
  async function preview() {
    if (!goods.length) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/md-product-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ goods, mode: "preview" }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function write() {
    const approved = (result?.results || [])
      .filter((x) => x.status === "확정")
      .map((x) => ({
        cell: x.cell,
        productNo: x.productNo,
        product: x.product,
      }));
    if (!approved.length) return;
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/md-product-match", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            goods,
            mode: "write",
            approved,
            snapshot: result.snapshot,
          }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  const box = {
    background: "#181a1c",
    border: "1px solid #34383d",
    borderRadius: 18,
    padding: 20,
  };
  const rowStyle = { padding: "12px 0", borderBottom: "1px solid #2b2f33" };
  return (
    <main
      style={{
        maxWidth: 1050,
        margin: "auto",
        padding: "28px 18px 70px",
        fontFamily: "sans-serif",
        color: "#f4f4f5",
      }}
    >
      <a href="/" style={{ color: "#a1a1aa", textDecoration: "none" }}>
        ← OARS Manager
      </a>
      <h1 style={{ marginBottom: 6 }}>상품번호 자동 매칭</h1>
      <p style={{ color: "#a1a1aa", marginTop: 0 }}>
        에이블리 상품목록과 MD 시트를 비교해 ‘상품번호’ 바로 아래 빈칸만
        안전하게 채웁니다. 다른 셀과 기존 상품번호는 수정하지 않습니다.
      </p>
      <section style={{ ...box, marginTop: 20 }}>
        <h2 style={{ marginTop: 0 }}>1. 에이블리 상품목록 CSV 선택</h2>
        <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={load} />
        <p style={{ color: "#a1a1aa" }}>
          여러 파일을 한 번에 선택할 수 있습니다. 옵션 중복은 상품번호 기준으로
          제거합니다.
        </p>
        {files.length > 0 && (
          <div>
            <b>선택 파일 {files.length}개</b> · 고유 상품 {goods.length}개
          </div>
        )}
      </section>
      <section style={{ ...box, marginTop: 14 }}>
        <h2 style={{ marginTop: 0 }}>2. 먼저 매칭 결과 확인</h2>
        <p style={{ color: "#a1a1aa" }}>
          이 단계에서는 시트를 수정하지 않습니다. 확실한 상품명만 ‘확정’, 애매한
          항목은 ‘확인 필요’로 분리합니다.
        </p>
        <button onClick={preview} disabled={loading || !goods.length}>
          {loading ? "확인 중..." : "매칭 미리보기"}
        </button>
        {error && <p style={{ color: "#fb7185" }}>{error}</p>}
      </section>
      {result && (
        <>
          <section style={{ ...box, marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>매칭 결과</h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit,minmax(145px,1fr))",
                gap: 10,
              }}
            >
              {[
                ["MD 상품", result.total],
                ["확정 매칭", result.matched],
                ["기존값 유지", result.existing],
                ["확인 필요", result.needsReview],
              ].map(([a, b]) => (
                <div
                  key={a}
                  style={{
                    background: "#111315",
                    padding: 14,
                    borderRadius: 12,
                  }}
                >
                  <small style={{ color: "#a1a1aa" }}>{a}</small>
                  <div style={{ fontSize: 25, fontWeight: 800, marginTop: 4 }}>
                    {b}개
                  </div>
                </div>
              ))}
            </div>
            {result.mode === "write" && (
              <p style={{ color: "#4ade80", fontWeight: 800 }}>
                MD 시트 상품번호 {result.written}개 입력 완료
              </p>
            )}
          </section>
          <section style={{ ...box, marginTop: 14 }}>
            <h2 style={{ marginTop: 0 }}>확정 매칭 미리보기</h2>
            {result.results
              .filter((x) => x.status === "확정")
              .map((x, i) => (
                <div key={i} style={rowStyle}>
                  <b>{x.product}</b>
                  <div style={{ color: "#a1a1aa", marginTop: 4 }}>
                    → 상품번호 <b style={{ color: "#fff" }}>{x.productNo}</b> ·
                    입력 셀 {x.cell}
                    {x.ablyName && x.ablyName !== x.product
                      ? ` · 에이블리: ${x.ablyName}`
                      : ""}
                  </div>
                </div>
              ))}
            {!result.results.some((x) => x.status === "확정") && (
              <p style={{ color: "#a1a1aa" }}>확정 매칭이 없습니다.</p>
            )}
          </section>
          {result.needsReview > 0 && (
            <section style={{ ...box, marginTop: 14 }}>
              <h2 style={{ marginTop: 0 }}>확인 필요 — 자동 입력 안 함</h2>
              {result.results
                .filter((x) => x.status === "확인 필요")
                .map((x, i) => (
                  <div key={i} style={rowStyle}>
                    <b>{x.product}</b>
                    {x.candidate && (
                      <div style={{ color: "#a1a1aa", marginTop: 4 }}>
                        가장 가까운 상품: {x.candidate}
                        {x.candidateNo ? ` · ${x.candidateNo}` : ""}
                      </div>
                    )}
                  </div>
                ))}
            </section>
          )}
          {result.mode !== "write" && result.matched > 0 && (
            <section style={{ ...box, marginTop: 14, borderColor: "#4ade80" }}>
              <h2 style={{ marginTop: 0 }}>3. 확정 항목만 시트에 입력</h2>
              <p style={{ color: "#a1a1aa" }}>
                ‘상품번호’ 라벨 바로 아래의 빈칸만 수정합니다. 기존 값과 확인
                필요 항목은 건드리지 않습니다.
              </p>
              <button onClick={write} disabled={loading}>
                {loading
                  ? "입력 중..."
                  : `확정 ${result.matched}개 상품번호 입력`}
              </button>
            </section>
          )}
        </>
      )}
    </main>
  );
}
