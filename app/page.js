"use client";
import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import SmsCafe24Manager from "./SmsCafe24Manager";
import HomeMdBriefing from "./HomeMdBriefing";
import {
  postalRows,
  parsePostalPaste,
  matchTracking,
} from "../lib/shipping.mjs";
import { seoulDate } from "../lib/dates.mjs";
const text = (v) => String(v ?? "").trim(),
  digits = (v) => text(v).replace(/\D/g, ""),
  phone = (v) => digits(v).replace(/^(01\d)(\d{3,4})(\d{4})$/, "$1-$2-$3");
const POST_HEADERS = [
    "받는 분 이름",
    "받는 분 우편번호",
    "받는 분 주소(도로명주소+건물번호, 읍/면/동까지)",
    "받는분 상세주소(나머지주소\n / 상세주소가 없는 경우 입력 예시 : . , 등)",
    "받는 분 연락처",
    "물품중량(kg)",
    "물품크기(cm)\n크기=가로+세로+높이",
    "분할접수여부",
    "첫번째 중량(kg)",
    "첫번째 크기(cm)",
    "두번째 중량(kg)",
    "두번째 크기(cm)",
    "내용품코드",
    "내용물",
    "배달방식",
    "배송시특이사항",
    "보내는분 이름",
    "보내는분 우편번호",
    "보내는분 주소(도로명주소+건물번호, 읍/면/동까지)",
    "보내는분 상세주소(나머지주소)",
    "보내는분 연락처",
  ],
  FIXED_BEFORE_MEMO = [
    "5",
    "80",
    "N",
    "11",
    "80",
    "11",
    "80",
    "[25]의류/패션잡화",
    "의류",
    "비대면",
  ],
  FIXED_SENDER = [
    "오어즈",
    "48224",
    "부산광역시 수영구 망미번영로74번길 43-4",
    "수정 1층 102호",
    "010-5943-7724",
  ];
function splitAddress(v) {
  const s = text(v).replace(/\s+/g, " "),
    m = s.match(/^(.+?(?:로|길)\s*\d+(?:-\d+)?)(?:\s+(.*))?$/);
  return m ? [m[1], m[2] || "."] : [s, "."];
}
function parsePostSheet(w) {
  const s = w.Sheets["에이블리 주문"] || w.Sheets[w.SheetNames[0]];
  return postalRows(
    XLSX.utils.sheet_to_json(s, { header: 1, defval: "", raw: false }),
  );
}
export default function Page() {
  const [mode, setMode] = useState("home"),
    [postRows, setPostRows] = useState([]),
    [notice, setNotice] = useState(""),
    [googleLoading, setGoogleLoading] = useState(false),
    [paste, setPaste] = useState(""),
    [matches, setMatches] = useState([]),
    [writeNotice, setWriteNotice] = useState(""),
    [ablyWb, setAblyWb] = useState(null),
    [ablyFileName, setAblyFileName] = useState(""),
    [writing, setWriting] = useState(false);
  useEffect(() => {
    const tool = new URLSearchParams(location.search).get("tool");
    setMode(["sms", "post", "tracking"].includes(tool) ? tool : "home");
  }, []);
  async function loadFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setNotice("파일은 10MB 이하로 올려주세요.");
      return;
    }
    try {
      const w = XLSX.read(await f.arrayBuffer(), { type: "array" }),
        p = parsePostSheet(w);
      setPostRows(p);
      setMatches([]);
      setNotice(`우체국 배송 ${p.length}건을 찾았습니다.`);
    } catch {
      setNotice("엑셀을 읽지 못했습니다.");
    }
  }
  async function loadAblyFile(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) {
      setNotice("파일은 10MB 이하로 올려주세요.");
      return;
    }
    try {
      const w = XLSX.read(await f.arrayBuffer(), {
        type: "array",
        cellStyles: true,
      });
      const target =
        w.SheetNames.find((n) => n.includes("배송 중 관리")) ||
        w.SheetNames.find((n) => {
          const a = XLSX.utils.sheet_to_json(w.Sheets[n], {
            header: 1,
            defval: "",
          });
          return (
            a[0]?.includes("상품주문번호") &&
            a[0]?.includes("택배사 코드") &&
            a[0]?.includes("송장번호")
          );
        });
      if (!target) throw new Error();
      setAblyWb(w);
      setAblyFileName(f.name);
      setWriteNotice(`에이블리 배송 중 관리 엑셀을 불러왔습니다: ${f.name}`);
    } catch {
      setAblyWb(null);
      setAblyFileName("");
      setWriteNotice("에이블리 배송 중 관리 엑셀을 읽지 못했습니다.");
    }
  }
  async function loadGoogle() {
    setGoogleLoading(true);
    setNotice("Google 주문시트를 불러오는 중...");
    try {
      const r = await fetch("/api/google-orders", { cache: "no-store" }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setPostRows(d.rows || []);
      setMatches([]);
      setNotice(
        `Google 주문시트에서 우체국 배송 ${(d.rows || []).length}건을 찾았습니다.`,
      );
    } catch (e) {
      setNotice(`연결 실패: ${e.message}`);
      setPostRows([]);
      setMatches([]);
    } finally {
      setGoogleLoading(false);
    }
  }
  function downloadPost() {
    const top = [
        "받는 분 정보",
        "",
        "",
        "",
        "",
        "물품정보(*필수)",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "보내는 분 정보(*선택)",
        "",
        "",
        "",
        "",
      ],
      data = postRows.map((r) => [
        r.name,
        r.zip,
        r.address,
        r.detail || ".",
        r.phone,
        ...FIXED_BEFORE_MEMO,
        r.memo || "",
        ...FIXED_SENDER,
      ]),
      s = XLSX.utils.aoa_to_sheet([top, POST_HEADERS, ...data]);
    s["!merges"] = [
      XLSX.utils.decode_range("A1:E1"),
      XLSX.utils.decode_range("F1:P1"),
      XLSX.utils.decode_range("Q1:U1"),
    ];
    const w = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(w, s, "방문접수소포 파일접수양식");
    XLSX.writeFile(w, `우체국_등록용_${seoulDate()}.xlsx`);
  }
  function runMatch() {
    const p = parsePostalPaste(paste);
    setMatches(matchTracking(p, postRows));
    setWriteNotice(`${p.length}개의 확정 등기번호를 읽었습니다.`);
  }
  async function writeGoogle() {
    if (writing) return;
    const ok = matches
      .filter((x) => x.match)
      .map((x) => ({
        productOrderNo: x.match.productOrderNo,
        snapshot: x.match.snapshot,
        tracking: x.tracking,
      }));
    if (!ok.length) return;
    setWriting(true);
    try {
      const r = await fetch("/api/tracking", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: ok }),
        }),
        d = await r.json();
      if (!r.ok) throw Error(d.error || "기입 실패");
      setWriteNotice(
        `송장 ${d.count}건 저장·재확인 완료 / 기존 동일 송장 ${d.unchanged}건`,
      );
    } catch (e) {
      setWriteNotice(e.message + " 재조회 후 확인하세요.");
    } finally {
      setWriting(false);
    }
  }
  function downloadAbly() {
    if (!ablyWb) {
      setWriteNotice("먼저 에이블리 배송 중 관리 엑셀을 올려주세요.");
      return;
    }
    const ok = matches.filter((x) => x.match);
    if (!ok.length) return;
    const target =
      ablyWb.SheetNames.find((n) => n.includes("배송 중 관리")) ||
      ablyWb.SheetNames.find((n) => {
        const a = XLSX.utils.sheet_to_json(ablyWb.Sheets[n], {
          header: 1,
          defval: "",
        });
        return a[0]?.includes("상품주문번호");
      });
    const ws = ablyWb.Sheets[target],
      a = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: false });
    const h = a[0] || [],
      pi = h.indexOf("상품주문번호"),
      ci = h.indexOf("택배사"),
      cci = h.indexOf("택배사 코드"),
      ti = h.indexOf("송장번호");
    if (pi < 0 || cci < 0 || ti < 0) {
      setWriteNotice("상품주문번호·택배사 코드·송장번호 열을 확인하세요.");
      return;
    }
    for (const x of ok) {
      if (
        a.slice(1).filter((r) => text(r[pi]) === text(x.match.productOrderNo))
          .length !== 1
      ) {
        setWriteNotice(
          "선택한 상품주문번호가 원본에 없거나 중복입니다. 파일을 확인하세요.",
        );
        return;
      }
    }
    let changed = 0;
    const changedRows = new Set();
    for (const x of ok) {
      const m = x.match;
      for (let i = 1; i < a.length; i++) {
        const productMatch =
          pi >= 0 &&
          !!text(m.productOrderNo) &&
          text(a[i][pi]) === text(m.productOrderNo);
        if (productMatch) {
          if (ci >= 0) a[i][ci] = "우체국택배";
          if (cci >= 0) a[i][cci] = 2;
          if (ti >= 0) a[i][ti] = x.tracking;
          changed++;
          changedRows.add(i);
        }
      }
    }
    if (!changed) {
      setWriteNotice(
        "업로드한 에이블리 엑셀에서 매칭되는 상품주문번호를 찾지 못했습니다.",
      );
      return;
    }
    const newWs = { ...ws };
    for (const i of changedRows)
      for (const c of [ci, cci, ti].filter((c) => c >= 0)) {
        const addr = XLSX.utils.encode_cell({ r: i, c });
        if (a[i][c] !== text(ws[addr]?.v)) {
          newWs[addr] = {
            ...(ws[addr] || {}),
            t: typeof a[i][c] === "number" ? "n" : "s",
            v: a[i][c],
          };
          delete newWs[addr].f;
          delete newWs[addr].w;
        }
      }
    for (const k of ["!cols", "!rows", "!merges"]) if (ws[k]) newWs[k] = ws[k];
    ablyWb.Sheets[target] = newWs;
    const base = (ablyFileName || "에이블리_배송 중 관리.xlsx").replace(
      /\.xlsx?$/i,
      "",
    );
    XLSX.writeFile(ablyWb, `${base}_우체국송장수정.xlsx`);
    setWriteNotice(
      `에이블리 원본 엑셀에서 ${changed}건의 택배사·택배사코드·송장번호만 변경했습니다.`,
    );
  }
  return (
    <main className="wrap">
      {mode !== "home" && (
        <>
          <h1>OARS Manager</h1>
          <p className="sub">오어즈 쇼핑몰 운영 관리</p>
        </>
      )}
      <div className="actions" style={{ marginBottom: 18 }}>
        <button onClick={() => (location.href = "/")}>MD 총분석</button>
        <button onClick={() => (location.href = "/product-reaction")}>
          상품 반응
        </button>
        <button onClick={() => (location.href = "/product-match")}>
          상품번호 매칭
        </button>
        <button onClick={() => (location.href = "/dashboard")}>
          매출 대시보드
        </button>
        <button onClick={() => (location.href = "/products")}>
          상품별 판매분석
        </button>
        <button onClick={() => (location.href = "/?tool=sms")}>문자 도우미</button>
        <button onClick={() => (location.href = "/?tool=post")}>우체국 엑셀 만들기</button>
        <button onClick={() => (location.href = "/?tool=tracking")}>송장 매칭</button>
      </div>
      {mode === "home" ? (
        <HomeMdBriefing />
      ) : mode === "sms" ? (
        <SmsCafe24Manager />
      ) : mode === "post" ? (
        <>
          <section className="card">
            <h2>발송 주문 불러오기</h2>
            <button onClick={loadGoogle} disabled={googleLoading}>
              {googleLoading ? "불러오는 중..." : "Google 주문시트 불러오기"}
            </button>
            <p>{notice}</p>
            <input type="file" accept=".xlsx,.xls" onChange={loadFile} />
          </section>
          <div className="row">
            <h2>발송 대상</h2>
            <b>{postRows.length}건</b>
          </div>
          {postRows.length > 0 && (
            <button onClick={downloadPost}>우체국 등록용 엑셀 다운로드</button>
          )}
          {postRows.map((r) => (
            <article className="card" key={r.id}>
              <b>
                {r.name} · {r.phone}
              </b>
              <p>
                {r.zip} · {r.address} {r.detail}
              </p>
              {r.memo && <p>배송 메모: {r.memo}</p>}
            </article>
          ))}
        </>
      ) : (
        <>
          <section className="card">
            <h2>1. Google 주문시트 불러오기</h2>
            <button onClick={loadGoogle} disabled={googleLoading}>
              {googleLoading ? "불러오는 중..." : "우체국 배송 주문 불러오기"}
            </button>
            <p>{notice}</p>
          </section>
          <section className="card">
            <h2>2. 우체국 신청내역 붙여넣기</h2>
            <p className="sub">
              우체국 방문접수소포 신청내역을 그대로 복사해 붙여넣으세요.
            </p>
            <textarea
              value={paste}
              onChange={(e) => {
                setPaste(e.target.value);
                setMatches([]);
              }}
              placeholder="우체국 신청내역을 여기에 붙여넣기"
              style={{ width: "100%", minHeight: 220, padding: 12 }}
            />
            <div className="actions">
              <button onClick={runMatch}>등기번호 자동 매칭</button>
            </div>
          </section>
          <div className="row">
            <h2>매칭 결과</h2>
            <b>
              {matches.filter((x) => x.match).length}/{matches.length}건
            </b>
          </div>
          {matches.map((x) => (
            <article className="card" key={x.id}>
              <div className="row">
                <b>{x.match?.name || "확인 필요"}</b>
                <span>{x.status}</span>
              </div>
              <p>등기번호 {x.tracking}</p>
              {x.match && <p className="sub">주문번호 {x.match.orderNo}</p>}
            </article>
          ))}
          {matches.some((x) => x.match) && (
            <section className="card">
              <h2>3. 에이블리 배송 중 관리 엑셀 올리기</h2>
              <p className="sub">
                에이블리에서 받은 원본 엑셀을 올리면 기존 정보와 발송 처리일은
                그대로 두고 택배사·택배사 코드·송장번호만 변경합니다.
              </p>
              <input type="file" accept=".xlsx,.xls" onChange={loadAblyFile} />
              {ablyFileName && <p>{ablyFileName} 불러오기 완료</p>}
              <h2>4. 처리하기</h2>
              <div className="actions">
                <button onClick={writeGoogle} disabled={writing}>
                  주문시트 송장번호 자동 기입
                </button>
                <button onClick={downloadAbly} disabled={!ablyWb}>
                  에이블리 원본 엑셀 송장 변경 다운로드
                </button>
              </div>
              {writeNotice && <p>{writeNotice}</p>}
            </section>
          )}
        </>
      )}
    </main>
  );
}
