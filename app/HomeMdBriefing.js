"use client";
import { useEffect, useMemo, useState } from "react";

const won=(n)=>`${Math.round(n||0).toLocaleString("ko-KR")}원`;

const labelFor=(p)=>
  p.decision==="사입 검토"
    ?"사입 검토"
    :p.decision==="추가 사입 중단"
      ?"추가 주문 중단"
      :"조금 더 보기";

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
      <span className={`priority-badge ${toneFor(p)}`}>{labelFor(p)}</span>
      <a href="/analysis">상세 →</a>
    </div>
    <h3>{p.name||"상품명 확인 필요"}</h3>
    <div className="priority-facts">
      <span><small>최근 7일</small><b>{p.q7||0}개</b></span>
      <span><small>최근 30일</small><b>{p.q30||0}개</b></span>
      <span><small>마지막 주문</small><b>{p.last||"확인 필요"}</b></span>
    </div>
    <div className="priority-action"><span>지금 할 일</span><b>{actionFor(p)}</b></div>
    <p className="priority-reason">{reasonFor(p)}</p>
  </article>;
}    <style jsx>{`
      .operator-home{max-width:1040px;color:#f3f4f6;font-size:16px}.op-head{display:flex;justify-content:space-between;gap:18px;margin:10px 0 24px}.op-head h1{font-size:36px;margin:5px 0}.op-head small,.op-head p{color:#cbd5e1}.op-head p{margin:0;font-size:15px}.op-head button{padding:11px 16px;border-radius:12px}
      .work-flow{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}.work-card{display:grid;grid-template-columns:42px 1fr auto;gap:14px;padding:18px;border:1px solid #343a3d;border-radius:16px;text-decoration:none;color:inherit;background:#191d1f}.work-no{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:#252b2d;font-size:12px;font-weight:900}.work-card div{display:flex;flex-direction:column;gap:4px}.work-card small{color:#cbd5e1;font-size:13px;font-weight:700}.work-card b{font-size:18px}.work-card p{margin:2px 0 0;color:#cbd5e1;font-size:14px;line-height:1.5}.work-card>strong{font-size:19px;padding-top:8px}
      .today-products{margin-top:8px}.section-title{display:flex;justify-content:space-between;gap:16px;align-items:end;margin:0 0 12px}.section-title small{color:#9ca3af;font-size:13px}.section-title h2{margin:3px 0;font-size:24px}.section-title p{margin:0;color:#9ca3af;font-size:14px}.section-title>a{color:#e5e7eb;text-decoration:none;font-weight:800;white-space:nowrap}
      .priority-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.priority-item{border:1px solid #3b4448;border-radius:16px;background:#181d1f;padding:16px;min-width:0}.priority-item.buy{border-color:#72552f}.priority-item.stop{border-color:#684047}.priority-head{display:flex;justify-content:space-between;align-items:center;gap:8px}.priority-head>a{font-size:12px;color:#cbd5e1;text-decoration:none;padding:6px 8px;border:1px solid #3b4448;border-radius:8px}.priority-item h3{margin:12px 0 14px;font-size:17px;line-height:1.45;min-height:49px}.priority-badge{display:inline-flex;padding:5px 9px;border-radius:999px;font-size:11px;font-weight:900;background:#303638}.priority-badge.buy{background:#4b3621;color:#ffd59a}.priority-badge.watch{background:#342d43;color:#dccdff}.priority-badge.stop{background:#48292d;color:#ffbec4}
      .priority-facts{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}.priority-facts>span{padding:10px;border-radius:10px;background:#22282a}.priority-facts>span:last-child{grid-column:1/-1}.priority-facts small{display:block;color:#9ca3af;font-size:11px;margin-bottom:4px}.priority-facts b{font-size:15px}.priority-action{padding:12px;border-radius:10px;background:#262d30;border:1px solid #4a555a}.priority-action span{display:block;color:#aeb8bc;font-size:11px;font-weight:900;margin-bottom:5px}.priority-action b{font-size:14px;line-height:1.45}.priority-reason{margin:9px 2px 0;color:#9ca3af;font-size:12px;line-height:1.45}.empty{padding:18px;border-radius:12px;background:#202628}.data-alert{display:flex;gap:10px;margin-top:12px;padding:13px 15px;border:1px solid #403a2e;border-radius:13px;background:#211f1a;color:inherit;text-decoration:none}
      @media(max-width:760px){.op-head h1{font-size:30px}.work-flow{grid-template-columns:1fr}.section-title{align-items:flex-start}.section-title p{display:none}.priority-list{display:grid;grid-template-columns:1fr;gap:12px}.priority-item{padding:15px}.priority-item h3{min-height:0;margin:10px 0 12px;font-size:18px}.priority-facts{grid-template-columns:1fr 1fr}.priority-reason{margin-top:8px}.data-alert{flex-wrap:wrap}}
      @media(max-width:440px){.work-card{grid-template-columns:36px 1fr auto;padding:15px;gap:10px}.work-no{width:34px;height:34px}.section-title h2{font-size:22px}.section-title>a{font-size:13px}.priority-action b{font-size:15px}}
    `}</style>nt";
import { useEffect, useMemo, useState } from "react";

const won=(n)=>`${Math.round(n||0).toLocaleString("ko-KR")}원`;

const labelFor=(p)=>
  p.decision==="사입 검토"
    ?"사입 검토"
    :p.decision==="추가 사입 중단"
      ?"추가 주문 중단"
      :"조금 더 보기";

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
      <span className={`priority-badge ${toneFor(p)}`}>{labelFor(p)}</span>
      <a href="/analysis">상세 →</a>
    </div>
    <h3>{p.name||"상품명 확인 필요"}</h3>
    <div className="priority-facts">
      <span><small>최근 7일</small><b>{p.q7||0}개</b></span>
      <span><small>최근 30일</small><b>{p.q30||0}개</b></span>
      <span><small>마지막 주문</small><b>{p.last||"확인 필요"}</b></span>
    </div>
    <div className="priority-action"><span>지금 할 일</span><b>{actionFor(p)}</b></div>
    <p className="priority-reason">{reasonFor(p)}</p>
  </article>;
}
