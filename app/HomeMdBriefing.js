"use client";
import { useEffect, useState } from "react";
const won=(n)=>`${Math.round(n||0).toLocaleString("ko-KR")}원`;

function Card({p}){
  const label=p.decision==="사입 검토"?"🔥 사입 검토":p.decision==="추가 사입 중단"?"⛔ 추가 사입 중단":"👀 조금 더 보기";
  const seven=p.windows?.find(w=>w.days===7)?.current||{};
  const demand=seven.qty??0, sold=seven.net??0, cancelled=Math.max(0,demand-sold);
  return <article className="op-card">
    <div className="op-card-head"><b>{p.name||"상품명 확인 필요"}</b><span>{label}</span></div>
    <p className="numbers"><strong>주문 반응 {demand}개</strong> · 실제 판매 {sold}개{cancelled>0?` · 취소·반품 ${cancelled}개`:""} · 재고 {p.stock===null?"확인 필요":`${p.stock}개`}</p>
    <p className="decision">{p.buy||p.reason||p.observe}</p>
    {p.observe&&<small>다음 판단: {p.observe}</small>}
    <details><summary>왜 이렇게 판단했는지 보기</summary>
      <p>최근 7/14/30일 실제 판매: {p.windows?.map(w=>`${w.current.net}개`).join(" / ")}</p>
      <p>최근 7/14/30일 주문 반응: {p.windows?.map(w=>`${w.current.qty}개`).join(" / ")}</p>
      <p>최근 30일 취소·반품 {p.cancels}개 · 판매가 발생한 날 {p.activeDays??0}일</p>
      {p.quantities&&<p>사입 참고 수량: 적게 {p.quantities.conservative}개 / 기준 {p.quantities.recommended}개 / 넉넉히 {p.quantities.aggressive}개</p>}
      {p.missing?.length>0&&<p>판단 전에 확인할 것: {p.missing.join(" · ")}</p>}
    </details>
  </article>;
}

export default function HomeMdBriefing(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){setLoading(true);setError("");try{const r=await fetch("/api/oars-analysis",{cache:"no-store"}),j=await r.json();if(!r.ok)throw Error(j.error||"분석 실패");setReport(j.report)}catch(e){setError(e.message)}finally{setLoading(false)}}
  useEffect(()=>{load()},[]);
  if(loading&&!report)return <div className="md-report"><p>오늘 운영 데이터를 정리하고 있습니다.</p></div>;
  if(!report)return <div className="md-report"><p>{error||"데이터를 불러오지 못했습니다."}</p></div>;
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
    <section className="op-section"><div className="section-title"><div><small>우선 확인</small><h2>오늘 확인할 상품</h2></div><span>{priority.length}개</span></div>
      {priority.length?priority.map(p=><Card key={p.key} p={p}/>):<p className="empty">오늘 바로 판단할 상품은 없습니다.</p>}
      {rows.length>priority.length&&<details className="all-products"><summary>다른 상품 {rows.length-priority.length}개 보기</summary>{rows.filter(p=>!priority.includes(p)).map(p=><Card key={p.key} p={p}/>)}</details>}
    </section>
    <section className="op-section compact"><div className="section-title"><div><small>한눈에 보기</small><h2>상품 판단 현황</h2></div></div><div className="status-grid"><div><b>{buy.length}</b><span>사입 검토</span></div><div><b>{watch.length}</b><span>조금 더 보기</span></div><div><b>{stop.length}</b><span>추가 사입 중단</span></div></div></section>
    {report.warnings?.length>0&&<details className="data-check"><summary>⚠ 확인이 필요한 데이터 {report.warnings.length}건</summary><p>상품 판단에 영향을 줄 수 있는 데이터만 모아둔 곳입니다.</p>{report.warnings.map((w,i)=><p key={i}>{w}</p>)}</details>}
    <style jsx>{`
      .operator-home{max-width:980px}.op-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:10px 0 24px}.op-head h1{font-size:34px;margin:5px 0}.op-head p{margin:0;color:#aeb5b8}.op-head button{padding:11px 16px;border-radius:12px}.quick-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:18px}.quick-grid a{display:flex;flex-direction:column;gap:8px;padding:18px;border:1px solid #343a3d;border-radius:16px;text-decoration:none;color:inherit;background:#1b2022}.quick-grid span{font-size:13px;color:#9ea6aa}.quick-grid b{font-size:17px}.op-section,.data-check{border:1px solid #343a3d;border-radius:18px;padding:20px;margin:14px 0;background:#191d1f}.section-title{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #303638;padding-bottom:14px;margin-bottom:4px}.section-title h2{margin:3px 0;font-size:22px}.section-title small{color:#929b9f}.section-title>span{font-weight:800}.op-card{padding:18px 0;border-bottom:1px solid #303638}.op-card:last-child{border-bottom:0}.op-card-head{display:flex;justify-content:space-between;gap:14px}.op-card-head span{white-space:nowrap;font-weight:800}.numbers{margin:10px 0 7px;color:#b7bec1}.decision{font-size:16px;margin:7px 0}.op-card small{color:#9fa7aa}.op-card details{margin-top:12px}.op-card summary,.all-products summary,.data-check summary{cursor:pointer;font-weight:800}.status-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.status-grid div{padding:14px;border-radius:13px;background:#22282a;display:flex;flex-direction:column;gap:4px}.status-grid b{font-size:24px}.status-grid span{font-size:13px;color:#aeb5b8}.data-check{font-size:13px;color:#aeb5b8}.data-check summary{color:inherit}.all-products{margin-top:14px}.empty{color:#aeb5b8}@media(max-width:720px){.quick-grid{grid-template-columns:1fr}.op-head h1{font-size:28px}.op-card-head{flex-direction:column}.status-grid{grid-template-columns:repeat(3,1fr)}.op-section{padding:16px}}
    `}</style>
  </div>;
}
