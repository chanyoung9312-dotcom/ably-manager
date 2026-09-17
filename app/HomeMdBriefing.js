"use client";
import { useEffect, useState } from "react";
const won=(n)=>`${Math.round(n||0).toLocaleString("ko-KR")}원`;

function Card({p}){
  const label=p.decision==="사입 검토"?"사입 검토":p.decision==="추가 사입 중단"?"추가 주문 중단":"조금 더 보기";
  const tone=p.decision==="사입 검토"?"buy":p.decision==="추가 사입 중단"?"stop":"watch";
  const seven=p.windows?.find(w=>w.days===7)?.current||{};
  const demand=seven.qty??0, sold=seven.net??0, cancelled=Math.max(0,demand-sold);
  const stock=p.stock===null?"확인 필요":`${p.stock}개`;
  const currentDecision=p.buy||p.reason||"조금 더 지켜봅니다.";
  const nextAction=p.observe||"추가 주문 흐름을 확인한 뒤 다시 판단합니다.";

  return <article className="op-card">
    <div className="op-card-head">
      <div className="product-title"><small>상품</small><h3>{p.name||"상품명 확인 필요"}</h3></div>
      <span className={`decision-badge ${tone}`}>{label}</span>
    </div>

    <div className="metric-grid" aria-label="상품 핵심 수치">
      <div><span>주문 반응</span><b>{demand}<small>개</small></b></div>
      <div><span>실제 판매</span><b>{sold}<small>개</small></b></div>
      <div><span>현재 재고</span><b className={p.stock===null?"needs-check":""}>{stock}</b></div>
    </div>

    {cancelled>0&&<p className="claim-note">취소·반품 {cancelled}개 포함</p>}

    <div className="decision-box">
      <span>현재 판단</span>
      <strong>{currentDecision}</strong>
    </div>

    <div className="next-box">
      <span>다음 확인</span>
      <b>{nextAction}</b>
    </div>

    <details className="why">
      <summary>판단 근거 자세히 보기</summary>
      <div className="why-body">
        <p><span>7 / 14 / 30일 실제 판매</span><b>{p.windows?.map(w=>`${w.current.net}개`).join(" / ")}</b></p>
        <p><span>7 / 14 / 30일 주문 반응</span><b>{p.windows?.map(w=>`${w.current.qty}개`).join(" / ")}</b></p>
        <p><span>최근 30일 취소·반품</span><b>{p.cancels}개</b></p>
        <p><span>판매가 발생한 날</span><b>{p.activeDays??0}일</b></p>
        {p.quantities&&<p><span>사입 참고 수량</span><b>{p.quantities.conservative} / {p.quantities.recommended} / {p.quantities.aggressive}개</b></p>}
        {p.missing?.length>0&&<p className="full"><span>판단 전에 확인할 것</span><b>{p.missing.join(" · ")}</b></p>}
      </div>
    </details>
  </article>;
}

export default function HomeMdBriefing(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const r=await fetch("/api/oars-analysis",{cache:"no-store"}),j=await r.json();if(!r.ok)throw Error(j.error||"분석 실패");setReport(j.report)}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading&&!report)return <div className="md-report"><p>오늘 운영 데이터를 정리하고 있습니다.</p></div>;
  if(!report)return <div className="md-report"><p role="alert">{error||"데이터를 불러오지 못했습니다."}</p><button onClick={load} disabled={loading}>{loading?"확인 중":"새로고침"}</button></div>;
  const rows=report.rows||[], buy=rows.filter(p=>p.decision==="사입 검토"), watch=rows.filter(p=>p.decision==="관찰"), stop=rows.filter(p=>p.decision==="추가 사입 중단"), seven=report.trends?.find(t=>t.days===7)?.current||{};
  const priority=[...buy,...watch].slice(0,3);
  return <div className="md-report operator-home">
    <header className="op-head"><div><small>오늘의 OARS</small><h1>오늘 할 일</h1><p>지금 확인하고 결정할 것만 먼저 보여줍니다.</p></div><button onClick={load} disabled={loading}>{loading?"확인 중":"새로고침"}</button></header>
    {error&&<p role="alert">{error}</p>}
    <section className="quick-grid">
      <a href="/?tool=sms"><span>주문·고객응대</span><b>새 주문 확인 →</b></a>
      <a href="/?tool=post"><span>오늘 보낼 상품</span><b>출고 준비 →</b></a>
      <a href="/dashboard"><span>최근 7일 주문 금액</span><b>{won(seven.sales)} →</b></a>
    </section>

    <section className="op-section">
      <div className="section-title"><div><small>우선 확인</small><h2>오늘 확인할 상품</h2></div><span>{priority.length}개</span></div>
      <div className="priority-list">
        {priority.length?priority.map(p=><Card key={p.key} p={p}/>):<p className="empty">오늘 바로 판단할 상품은 없습니다.</p>}
      </div>
      {rows.length>priority.length&&<details className="all-products"><summary>나머지 상품 {rows.length-priority.length}개 보기</summary><div className="other-list">{rows.filter(p=>!priority.includes(p)).map(p=><Card key={p.key} p={p}/>)}</div></details>}
    </section>

    <section className="op-section compact"><div className="section-title"><div><small>한눈에 보기</small><h2>상품 판단 현황</h2></div></div><div className="status-grid"><div><b>{buy.length}</b><span>사입 검토</span></div><div><b>{watch.length}</b><span>조금 더 보기</span></div><div><b>{stop.length}</b><span>추가 주문 중단</span></div></div></section>
    {report.warnings?.length>0&&<details className="data-check"><summary>⚠ 확인이 필요한 데이터 {report.warnings.length}건</summary><p>상품 판단에 영향을 줄 수 있는 데이터만 모아둔 곳입니다.</p>{report.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    <style jsx>{`
      .operator-home{max-width:980px}.op-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:10px 0 24px}.op-head h1{font-size:34px;margin:5px 0}.op-head p{margin:0;color:#aeb5b8}.op-head button{padding:11px 16px;border-radius:12px}.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}.quick-grid a{display:flex;flex-direction:column;gap:8px;padding:18px;border:1px solid #343a3d;border-radius:16px;text-decoration:none;color:inherit;background:#1b2022}.quick-grid span{font-size:13px;color:#9ea6aa}.quick-grid b{font-size:17px}.op-section,.data-check{border:1px solid #343a3d;border-radius:18px;padding:20px;margin:14px 0;background:#191d1f}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #303638;padding-bottom:14px;margin-bottom:16px}.section-title h2{margin:3px 0;font-size:22px}.section-title small{color:#929b9f}.section-title>span{font-weight:800}.priority-list,.other-list{display:grid;gap:14px}.op-card{padding:18px;border:1px solid #343a3d;border-radius:16px;background:#15191a}.op-card-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.product-title small{color:#7f898d;font-size:11px}.product-title h3{margin:4px 0 0;font-size:17px;line-height:1.45}.decision-badge{white-space:nowrap;font-size:12px;font-weight:900;padding:7px 10px;border-radius:999px;background:#303638}.decision-badge.buy{background:#4b3621;color:#ffd59a}.decision-badge.watch{background:#342d43;color:#dccdff}.decision-badge.stop{background:#48292d;color:#ffbec4}.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin:16px 0 10px}.metric-grid>div{padding:13px 14px;border-radius:12px;background:#22282a;display:flex;flex-direction:column;gap:5px}.metric-grid span{font-size:12px;color:#9fa8ac}.metric-grid b{font-size:23px;line-height:1.1}.metric-grid b small{font-size:12px;margin-left:2px;color:#c8ced0}.metric-grid .needs-check{font-size:17px;color:#f0c98a}.claim-note{margin:0 0 10px;color:#cf9fa5;font-size:12px}.decision-box,.next-box{display:grid;grid-template-columns:90px 1fr;align-items:start;gap:12px;padding:13px 14px;border-radius:12px;margin-top:9px}.decision-box{background:#202724;border:1px solid #314039}.next-box{background:#1d2224;border:1px solid #303638}.decision-box span,.next-box span{font-size:12px;font-weight:800;color:#9da6a9;padding-top:2px}.decision-box strong{font-size:17px;line-height:1.45}.next-box b{font-size:14px;line-height:1.55}.why{margin-top:12px}.why summary,.all-products summary,.data-check summary{cursor:pointer;font-weight:800}.why summary{font-size:13px;color:#aeb5b8}.why-body{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.why-body p{display:flex;justify-content:space-between;gap:12px;margin:0;padding:10px 11px;border-radius:10px;background:#1d2224}.why-body p.full{grid-column:1/-1;align-items:flex-start}.why-body span{font-size:12px;color:#939ca0}.why-body b{font-size:12px;text-align:right}.all-products{margin-top:16px;border-top:1px solid #303638;padding-top:15px}.all-products>summary{color:#aeb5b8}.other-list{margin-top:14px}.status-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.status-grid div{padding:14px;border-radius:13px;background:#22282a;display:flex;flex-direction:column;gap:4px}.status-grid b{font-size:24px}.status-grid span{font-size:13px;color:#aeb5b8}.data-check{font-size:13px;color:#aeb5b8}.data-check summary{color:inherit}.empty{color:#aeb5b8}@media(max-width:720px){.quick-grid{grid-template-columns:1fr}.op-head h1{font-size:28px}.op-card-head{flex-direction:column}.metric-grid{grid-template-columns:repeat(3,1fr)}.decision-box,.next-box{grid-template-columns:1fr;gap:4px}.why-body{grid-template-columns:1fr}.why-body p.full{grid-column:auto}.status-grid{grid-template-columns:repeat(3,1fr)}.op-section{padding:16px}}@media(max-width:480px){.metric-grid{grid-template-columns:1fr 1fr}.metric-grid>div:last-child{grid-column:1/-1}.status-grid{grid-template-columns:1fr 1fr 1fr}}
    `}</style>
  </div>;
}
