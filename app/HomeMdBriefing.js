"use client";
import { useEffect, useMemo, useState } from "react";

const won=(n)=>`${Math.round(n||0).toLocaleString("ko-KR")}원`;

const labelFor=(p)=>
  p.decision==="사입 검토"
    ?"사입 검토"
    :p.decision==="추가 사입 중단"
      ?"추가 주문 중단"
      :"관찰";

const toneFor=(p)=>
  p.decision==="사입 검토"?"buy":p.decision==="추가 사입 중단"?"stop":"watch";

function actionFor(p){
  if(p.decision==="사입 검토") return "공급처 재고·납기를 확인하고 소량 사입 여부 결정";
  if(p.decision==="추가 사입 중단") return "추가 주문은 멈추고 현재 보유·입고 재고부터 확인";
  if(p.stock===null) return "현재 재고를 확인한 뒤 판매 흐름 계속 보기";
  if((p.q7||0)>=2) return "며칠 더 주문이 이어지는지 확인";
  return "최근 주문 흐름을 한 번 더 확인";
}

function reasonFor(p){
  if(p.decision==="사입 검토") return "최근 판매가 여러 번 확인돼 사입 여부를 결정할 단계예요.";
  if(p.decision==="추가 사입 중단") return "추가 구매보다 현재 재고를 먼저 관리해야 해요.";
  if((p.days30||0)<=1) return "판매는 있었지만 한 날짜에 몰려 있어 반복 판매인지 더 봐야 해요.";
  return "판매 반응은 있지만 사입 결정 전 조금 더 확인이 필요해요.";
}

function PriorityItem({p}){
  return <article className={`priority-item ${toneFor(p)}`}>
    <div className="priority-head">
      <strong className={`priority-badge ${toneFor(p)}`}>{labelFor(p)}</strong>
      <a href="/analysis">상세 →</a>
    </div>
    <h3>{p.name||"상품명 확인 필요"}</h3>
    <dl className="priority-facts">
      <div><dt>최근 7일</dt><dd>{p.q7||0}개</dd></div>
      <div><dt>최근 30일</dt><dd>{p.q30||0}개</dd></div>
      <div className="last-order"><dt>마지막 주문</dt><dd>{p.last||"확인 필요"}</dd></div>
    </div>
    <div className="priority-action"><span>지금 할 일</span><b>{actionFor(p)}</b></div>
    <p className="priority-reason">{reasonFor(p)}</p>
  </article>;
}

export default function HomeMdBriefing(){
  const [report,setReport]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState("");
  async function load(){
    setLoading(true);setError("");
    try{
      const r=await fetch("/api/oars-analysis",{cache:"no-store"}),j=await r.json();
      if(!r.ok)throw Error(j.error||"분석 실패");
      setReport(j.report);
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  useEffect(()=>{load()},[]);

  const activeRows=useMemo(
    ()=> (report?.rows||[]).filter((p)=>(p.q30||0)>0),
    [report],
  );

  if(loading&&!report)return <div className="md-report"><p>오늘 운영 데이터를 정리하고 있습니다.</p></div>;
  if(!report)return <div className="md-report"><p role="alert">{error||"데이터를 불러오지 못했습니다."}</p><button onClick={load} disabled={loading}>{loading?"확인 중":"새로고침"}</button></div>;

  const buy=activeRows.filter(p=>p.decision==="사입 검토");
  const watch=activeRows.filter(p=>p.decision==="관찰");
  const stop=activeRows.filter(p=>p.decision==="추가 사입 중단");
  const seven=report.trends?.find(t=>t.days===7)?.current||{};

  const priority=[...activeRows]
    .filter((p)=>p.decision!=="관찰"||(p.q7||0)>0)
    .sort((a,b)=>{
      const rank=(p)=>p.decision==="사입 검토"?0:p.decision==="추가 사입 중단"?1:2;
      return rank(a)-rank(b)||(b.q7||0)-(a.q7||0)||(b.q30||0)-(a.q30||0);
    })
    .slice(0,3);

  const decisionCount=buy.length+watch.length+stop.length;

  return <div className="md-report operator-home">
    <header className="op-head">
      <div><small>오늘의 OARS</small><h1>오늘 할 일</h1><p>주문부터 출고, 사입, 매출까지 오늘 처리할 순서대로 보여줍니다.</p></div>
      <button onClick={load} disabled={loading}>{loading?"확인 중":"새로고침"}</button>
    </header>

    {error&&<p role="alert">{error}</p>}

    <section className="work-flow" aria-label="오늘 업무 순서">
      <a href="/?tool=sms" className="work-card">
        <span className="work-no">01</span>
        <div><small>주문 확인</small><b>신규 주문·고객 안내</b><p>새 주문을 확인하고 필요한 문자를 준비합니다.</p></div>
        <strong>→</strong>
      </a>
      <a href="/?tool=post" className="work-card">
        <span className="work-no">02</span>
        <div><small>출고 준비</small><b>오늘 보낼 주문 정리</b><p>배송할 주문을 모아 우체국 엑셀을 만듭니다.</p></div>
        <strong>→</strong>
      </a>
      <a href="/analysis" className="work-card">
        <span className="work-no">03</span>
        <div><small>사입 확인</small><b>{decisionCount}개 상품 확인</b><p>최근 판매 상품만 보고 사입 여부를 판단합니다.</p></div>
        <strong>→</strong>
      </a>
      <a href="/dashboard" className="work-card">
        <span className="work-no">04</span>
        <div><small>매출 확인</small><b>최근 7일 {won(seven.sales)}</b><p>취소·반품을 반영한 매출 흐름을 확인합니다.</p></div>
        <strong>→</strong>
      </a>
    </section>

    <section className="today-products">
      <div className="section-title">
        <div><small>사입·재고 확인</small><h2>오늘 확인할 상품</h2><p>최근 30일 판매가 있고 지금 확인할 이유가 있는 상품만 최대 3개 보여줍니다.</p></div>
        <a href="/analysis">전체 사입 판단 보기 →</a>
      </div>
      <div className="priority-list">
        {priority.length
          ?priority.map(p=><PriorityItem key={p.key} p={p}/>)
          :<div className="empty"><b>오늘 바로 확인할 상품이 없습니다.</b><span>신규 판매가 들어오면 여기에 우선순위 상품이 표시됩니다.</span></div>}
      </div>
    </section>

    {report.warnings?.length>0&&
      <a className="data-alert" href="/analysis">
        <span>데이터 확인 필요</span>
        <b>{report.warnings.length}건</b>
        <small>사입 판단에 영향을 줄 수 있는 항목 확인 →</small>
      </a>
    }

    <style jsx>{`
      .operator-home{max-width:1040px;color:#f3f4f6;font-size:16px}.op-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;margin:10px 0 24px}.op-head h1{font-size:36px;margin:5px 0}.op-head small{color:#cbd5e1}.op-head p{margin:0;color:#d1d5db;font-size:15px}.op-head button{padding:11px 16px;border-radius:12px}.work-flow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}.work-card{display:grid;grid-template-columns:42px 1fr auto;align-items:start;gap:14px;padding:18px;border:1px solid #343a3d;border-radius:16px;text-decoration:none;color:inherit;background:#191d1f}.work-card:hover{background:#202628}.work-no{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#252b2d;color:#aeb5b8;font-size:12px;font-weight:900}.work-card div{display:flex;flex-direction:column;gap:4px}.work-card small{color:#cbd5e1;font-size:13px;font-weight:700}.work-card b{font-size:18px;color:#f8fafc}.work-card p{margin:2px 0 0;color:#cbd5e1;font-size:14px;line-height:1.55}.work-card>strong{font-size:19px;padding-top:8px}.today-products{border:1px solid #343a3d;border-radius:18px;padding:20px;background:#191d1f}.section-title{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;border-bottom:1px solid #303638;padding-bottom:16px;margin-bottom:14px}.section-title small{color:#cbd5e1;font-size:13px}.section-title h2{margin:3px 0 5px;font-size:24px;color:#f8fafc}.section-title p{margin:0;color:#cbd5e1;font-size:14px}.section-title>a{white-space:nowrap;color:inherit;text-decoration:none;font-size:13px;font-weight:800;padding:8px 0}.priority-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.priority-item{padding:16px;border:1px solid #3b4448;border-radius:16px;background:#15191a;min-width:0}.priority-item.buy{border-color:#72552f}.priority-item.stop{border-color:#684047}.priority-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.priority-head>a{color:#e5e7eb;text-decoration:none;font-size:12px;font-weight:900;padding:7px 9px;border:1px solid #3b4448;border-radius:8px;background:#202628}.priority-item h3{margin:12px 0 14px;font-size:18px;line-height:1.45;color:#f8fafc}.priority-badge{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:11px;font-weight:900;background:#303638}.priority-badge.buy{background:#4b3621;color:#ffd59a}.priority-badge.watch{background:#342d43;color:#dccdff}.priority-badge.stop{background:#48292d;color:#ffbec4}.priority-facts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0 10px}.priority-facts>div{padding:12px;border:1px solid #343c40;border-radius:11px;background:#22282a}.priority-facts dt{font-size:12px;color:#9ca3af;margin:0 0 5px}.priority-facts dd{font-size:17px;font-weight:900;color:#f8fafc;margin:0}.priority-action{display:grid;grid-template-columns:78px 1fr;gap:10px;padding:13px 14px;border:1px solid #59656a;border-radius:10px;background:#242b2e}.priority-reason{margin:9px 2px 0;color:#aeb8bc;font-size:13px;line-height:1.55}.priority-action span{font-size:13px;color:#cbd5e1;font-weight:800}.priority-action b{font-size:15px;line-height:1.55;color:#f8fafc}.empty{display:flex;flex-direction:column;gap:5px;padding:18px;border-radius:12px;background:#202628}.empty span{color:#aeb5b8;font-size:13px}.data-alert{display:grid;grid-template-columns:auto auto 1fr;align-items:center;gap:10px;margin-top:12px;padding:13px 15px;border:1px solid #403a2e;border-radius:13px;background:#211f1a;color:inherit;text-decoration:none}.data-alert span{font-size:12px;color:#c7b98c}.data-alert b{font-size:17px}.data-alert small{color:#9e9781;text-align:right}@media(max-width:760px){.op-head h1{font-size:30px}.work-flow{grid-template-columns:1fr}.priority-list{grid-template-columns:1fr}.section-title{flex-direction:column}.section-title>a{padding:0}.priority-facts{grid-template-columns:1fr 1fr}.priority-facts>div:last-child{grid-column:1/-1}.data-alert{grid-template-columns:auto auto}.data-alert small{grid-column:1/-1;text-align:left}}@media(max-width:440px){.work-card{grid-template-columns:36px 1fr auto;padding:15px;gap:10px}.work-no{width:34px;height:34px}.today-products{padding:15px}.priority-item{padding:16px}.priority-head{margin-bottom:8px}.priority-item h3{margin:8px 0 12px}.priority-action{margin-top:2px}.priority-facts{grid-template-columns:1fr 1fr}.priority-facts>div:last-child{grid-column:1/-1}.priority-action{grid-template-columns:1fr;gap:4px}}
    `}</style>
  </div>;
}
