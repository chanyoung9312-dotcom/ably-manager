'use client';
import {useEffect,useMemo,useState} from 'react';

const text=v=>String(v??'').trim();
const digits=v=>text(v).replace(/\D/g,'');
const phone=v=>digits(v).replace(/^(01\d)(\d{3,4})(\d{4})$/,'$1-$2-$3');
const TEMPLATE_KEY='ably-manager-sms-template';
const DEFAULT_TEMPLATE=`안녕하세요 {수취인명} 고객님\n\n고객님께서 주문하신 {상품명} 상품은 저희 주문량이 밀려 저희 업체로 공급되는 시간이 지체되어 곧바로 배송이 어려워 안내드립니다. \n\n배송 기간은 영업일 기준으로 3일~7일 정도 소요될 수도 있는 것으로 확인됩니다. 배송현황은 CJ대한통운으로 등록되어있을텐데 실제 배송은 우체국택배로 진행됩니다!\n\n문자 확인 후 답변 해주시면 배송 진행, 혹은 취소 진행으로 도와드리겠습니다\n\n감사합니다!!`;
const PREPARE_CODES=new Set(['N20','prepare']);

function message(template,r){return template.replaceAll('{수취인명}',r.name||'고객').replaceAll('{상품명}',r.product||'주문 상품').replaceAll('{옵션}',r.option||'').replaceAll('{수량}',r.qty||'1');}
function isPrepare(r){return PREPARE_CODES.has(text(r.status));}

export default function SmsCafe24Manager(){
 const[rows,setRows]=useState([]),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false),[preparing,setPreparing]=useState(''),[tab,setTab]=useState('new'),[template,setTemplate]=useState(DEFAULT_TEMPLATE),[draft,setDraft]=useState(DEFAULT_TEMPLATE),[editing,setEditing]=useState(false);
 useEffect(()=>{const saved=localStorage.getItem(TEMPLATE_KEY);if(saved){setTemplate(saved);setDraft(saved);}const c=new URLSearchParams(location.search).get('cafe24');if(c==='connected'){setNotice('카페24 연결 완료. 주문을 불러오는 중...');load();}},[]);
 async function load(){setLoading(true);setNotice('카페24 주문을 확인하는 중...');try{const r=await fetch('/api/cafe24/orders',{cache:'no-store'}),d=await r.json();if(r.status===401&&d.connectUrl){location.href=d.connectUrl;return;}if(!r.ok)throw new Error(d.error||'주문 조회 실패');const p=(d.rows||[]).map(x=>({...x,phone:phone(x.phone)}));setRows(p);setNotice(`신규 주문 ${p.filter(x=>!isPrepare(x)).length}건 · 배송준비 ${p.filter(isPrepare).length}건`);}catch(e){setNotice(`카페24 연결 실패: ${e.message}`);}finally{setLoading(false);}}
 async function prepare(r){if(!r.orderId)return;setPreparing(r.id);setNotice(`${r.name} 주문을 배송준비로 변경하는 중...`);try{const same=rows.filter(x=>x.orderId===r.orderId&&!isPrepare(x));const codes=same.map(x=>x.orderItemCode).filter(Boolean);const res=await fetch('/api/cafe24/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:r.orderId,orderItemCodes:codes})}),d=await res.json();if(res.status===401&&d.connectUrl){location.href=d.connectUrl;return;}if(!res.ok)throw new Error(d.error||'배송준비 처리 실패');setRows(prev=>prev.map(x=>x.orderId===r.orderId?{...x,status:'prepare'}:x));setNotice(`${r.name} 주문을 배송준비로 변경했습니다.`);}catch(e){setNotice(`배송준비 처리 실패: ${e.message}`);}finally{setPreparing('');}}
 async function copy(r){await navigator.clipboard.writeText(message(template,r));setNotice(`${r.name} 고객 문자 내용을 복사했습니다.`);}
 function saveTemplate(){setTemplate(draft);localStorage.setItem(TEMPLATE_KEY,draft);setEditing(false);setNotice('문자 양식을 저장했습니다.');}
 const newRows=useMemo(()=>rows.filter(x=>!isPrepare(x)),[rows]),preparedRows=useMemo(()=>rows.filter(isPrepare),[rows]),shown=tab==='new'?newRows:preparedRows;
 return <>
  <section className="card"><div className="row"><h2>주문 불러오기</h2><b>카페24 연동</b></div><p className="sub">신규 주문을 확인하고 고객 답변 후 배송준비 단계로 넘깁니다.</p><div className="actions"><button onClick={load} disabled={loading}>{loading?'불러오는 중...':'카페24 주문 불러오기'}</button><button onClick={()=>location.href='/api/cafe24/connect'}>카페24 다시 연결</button></div>{notice&&<p>{notice}</p>}</section>
  <section className="card"><div className="row"><h2>문자 양식</h2>{!editing&&<button onClick={()=>{setDraft(template);setEditing(true)}}>수정</button>}</div><textarea value={editing?draft:template} onChange={e=>setDraft(e.target.value)} readOnly={!editing} style={{width:'100%',minHeight:260,padding:12,border:'1px solid #ddd',borderRadius:10,font:'inherit',lineHeight:1.6,opacity:editing?1:.9}}/>{editing&&<div className="actions"><button onClick={saveTemplate}>저장</button><button onClick={()=>setEditing(false)}>취소</button></div>}</section>
  <div className="actions" style={{marginBottom:16}}><button onClick={()=>setTab('new')} disabled={tab==='new'}>신규 주문 {newRows.length}</button><button onClick={()=>setTab('prepare')} disabled={tab==='prepare'}>배송준비 {preparedRows.length}</button></div>
  {shown.length===0?<section className="card"><p className="sub">{tab==='new'?'현재 표시할 신규 주문이 없습니다.':'현재 표시할 배송준비 주문이 없습니다.'}</p></section>:shown.map(r=><article className="card" key={r.id}><div className="row"><b>{r.name} · {r.phone}</b><span>{tab==='new'?'신규 주문':'배송준비'}</span></div>{(r.channel||r.date)&&<p className="sub">{[r.channel,r.date,r.orderId&&`주문 ${r.orderId}`].filter(Boolean).join(' · ')}</p>}<p><b>{r.product}</b>{r.option?` · ${r.option}`:''}{r.qty?` · ${r.qty}개`:''}</p><div className="msg">{message(template,r)}</div><div className="actions"><button onClick={()=>copy(r)}>문자 복사</button>{r.phone&&<button onClick={()=>navigator.clipboard.writeText(r.phone)}>번호 복사</button>}{tab==='new'&&<button onClick={()=>prepare(r)} disabled={preparing===r.id}>{preparing===r.id?'처리 중...':'배송준비'}</button>}</div></article>)}
 </>;
}
