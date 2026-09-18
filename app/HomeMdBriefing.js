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
    <div className="priority-facts">
      <div className="priority-fact"><span>최근 7일</span><strong>{p.q7||0}개</strong></div>
      <div className="priority-fact"><span>최근 30일</span><strong>{p.q30||0}개</strong></div>
      <div className="priority-fact last-order"><span>마지막 주문</span><strong>{p.last||"확인 필요"}</strong></div>
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

    <section className="work-flow work-flow-cards" aria-label="오늘 업무 순서">
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
      .op-head{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;margin-bottom:22px}
      .op-head small{color:#8f9a9e;font-weight:800}.op-head h1{margin:5px 0 7px;font-size:32px}.op-head p{margin:0;color:#aeb5b8}
      .work-flow-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-bottom:22px}
      .work-card{display:grid;grid-template-columns:44px 1fr 24px;align-items:center;gap:14px;min-height:132px;padding:18px;border:1px solid #343c40;border-radius:16px;background:#191d1f;color:#f3f4f6;text-decoration:none}
      .work-no{display:grid;place-items:center;width:42px;height:42px;border-radius:12px;background:#272e31;color:#dce3e6;font-size:13px;font-weight:900}
      .work-card small{display:block;color:#9ca6aa;font-size:12px;font-weight:800;margin-bottom:5px}.work-card b{display:block;color:#f8fafc;font-size:18px;line-height:1.35}.work-card p{margin:8px 0 0;color:#aeb5b8;font-size:13px;line-height:1.5}.work-card>strong{font-size:20px;color:#899499}
      @media(max-width:720px){.op-head{align-items:flex-start;margin-bottom:18px}.op-head h1{font-size:29px}.op-head p{font-size:14px;line-height:1.55;max-width:260px}.op-head button{padding:9px 11px;min-height:40px;font-size:13px}.work-flow-cards{grid-template-columns:1fr;gap:10px;margin-bottom:18px}.work-card{grid-template-columns:38px 1fr 20px;gap:12px;min-height:0;padding:15px 14px;border-radius:14px}.work-no{width:36px;height:36px;border-radius:10px;font-size:12px}.work-card b{font-size:17px}.work-card p{font-size:13px;margin-top:5px}}
    `}</style>

  </div>;
}
