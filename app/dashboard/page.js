'use client';
import {useEffect,useState} from 'react';
const won=v=>`${Math.round(v||0).toLocaleString('ko-KR')}원`;
export default function Dashboard(){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);setError('');try{const r=await fetch('/api/dashboard-data',{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'불러오기 실패');setData(d)}catch(e){setError(e.message)}finally{setLoading(false)}}
 useEffect(()=>{load()},[]);
 const orders=data?.orders||[],cancels=data?.cancels||[];
 const before=cancels.filter(x=>x.type==='before'),after=cancels.filter(x=>x.type==='after'),returns=cancels.filter(x=>x.type==='return');
 const gross=orders.reduce((s,x)=>s+(x.paid||0),0),deduct=cancels.reduce((s,x)=>s+(x.paid||0),0),net=Math.max(0,gross-deduct);
 return <main style={{maxWidth:1100,margin:'auto',padding:'28px 18px 70px',fontFamily:'sans-serif'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}><div><a href="/" style={{color:'#777',textDecoration:'none'}}>← Ably Manager</a><h1 style={{margin:'10px 0 5px'}}>매출 대시보드</h1><p style={{color:'#777',margin:0}}>Google 주문시트를 자동으로 읽어 집계합니다.</p></div><button onClick={load} disabled={loading} style={{background:'#171717',color:'#fff',border:0,borderRadius:12,padding:'13px 18px',fontWeight:700}}>{loading?'불러오는 중...':'새로고침'}</button></div>
  {error&&<div style={{marginTop:20,padding:16,background:'#fff1f1',borderRadius:12,color:'#a33'}}>연결 오류: {error}</div>}
  {!data?<section style={{marginTop:22,padding:36,border:'1px solid #e8e8e8',borderRadius:18,textAlign:'center'}}>{loading?'주문시트를 읽고 있습니다.':'데이터를 불러오지 못했습니다.'}</section>:<>
   <section style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:12,marginTop:22}}>
    {[['총 주문매출',won(gross),`${orders.length}건`],['최종 실매출',won(net),`취소·반품 제외`],['총 취소·반품',won(deduct),`${cancels.length}건`],['발주 후 취소',won(after.reduce((s,x)=>s+(x.paid||0),0)),`${after.length}건 · 재고 위험`]].map(([a,b,c])=><div key={a} style={{border:'1px solid #e8e8e8',borderRadius:16,padding:18}}><span style={{color:'#777',fontSize:13}}>{a}</span><strong style={{display:'block',fontSize:23,margin:'8px 0'}}>{b}</strong><small style={{color:'#888'}}>{c}</small></div>)}
   </section>
   <section style={{marginTop:14,border:'1px solid #e8e8e8',borderRadius:18,padding:20}}><h2 style={{marginTop:0}}>취소·반품 구조</h2><p>발주 전 취소 <b>{before.length}건 · {won(before.reduce((s,x)=>s+(x.paid||0),0))}</b></p><p>발주 후 취소 <b>{after.length}건 · {won(after.reduce((s,x)=>s+(x.paid||0),0))}</b></p><p>배송 후 반품 <b>{returns.length}건 · {won(returns.reduce((s,x)=>s+(x.paid||0),0))}</b></p></section>
   <section style={{marginTop:14,border:'1px solid #e8e8e8',borderRadius:18,padding:20}}><h2 style={{marginTop:0}}>연결 상태</h2><p style={{marginBottom:0}}>Google 주문시트에서 주문 {orders.length}건, 취소·반품 {cancels.length}건을 자동으로 읽었습니다.</p></section>
  </>}
 </main>;
}
