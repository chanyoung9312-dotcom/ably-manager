'use client';
import{useState}from'react';
import * as XLSX from'xlsx';

const pick=(row,...keys)=>{for(const k of keys){if(row[k]!==undefined&&row[k]!==null&&String(row[k]).trim()!=='')return String(row[k]).trim()}return''};
const phone=v=>String(v||'').replace(/[^0-9]/g,'').replace(/^(01\d)(\d{3,4})(\d{4})$/,'$1-$2-$3');

export default function Page(){
 const[rows,setRows]=useState([]),[fileName,setFileName]=useState(''),[notice,setNotice]=useState('');
 const[template,setTemplate]=useState('{고객명}님 안녕하세요 :) 주문해주신 {상품명} 상품은 해외 거래처에서 입고 후 출고되는 상품으로, 평일 기준 약 7~14일 정도 소요될 수 있습니다. 최대한 빠르게 준비해서 보내드리겠습니다. 기다려주셔서 감사합니다 ♥');
 async function importExcel(e){
  const file=e.target.files?.[0]; if(!file)return;
  try{const data=await file.arrayBuffer();const wb=XLSX.read(data,{type:'array'});const ws=wb.Sheets[wb.SheetNames[0]];const raw=XLSX.utils.sheet_to_json(ws,{defval:''});
   const parsed=raw.filter(r=>pick(r,'상품주문번호','주문번호','상품명')).map((r,i)=>({id:pick(r,'상품주문번호')||`${pick(r,'주문번호')}-${i}`,orderNo:pick(r,'주문번호'),productOrderNo:pick(r,'상품주문번호'),name:pick(r,'수취인명','주문자명'),customer:pick(r,'주문자명','수취인명'),phone:phone(pick(r,'수취인 연락처','연락처')),product:pick(r,'상품명'),option:pick(r,'옵션 정보'),qty:pick(r,'수량')||'1',status:pick(r,'주문상태'),copied:false}));
   setRows(parsed);setFileName(file.name);setNotice(`${parsed.length}건을 불러왔습니다.`);
  }catch(err){setNotice('엑셀을 읽지 못했습니다. 에이블리 발주 관리 엑셀인지 확인해주세요.');}
 }
 function message(r){return template.replaceAll('{고객명}',r.name||r.customer||'고객').replaceAll('{주문자명}',r.customer||'고객').replaceAll('{상품명}',r.product||'주문 상품').replaceAll('{옵션}',r.option||'').replaceAll('{수량}',r.qty||'1');}
 async function copy(r){await navigator.clipboard.writeText(message(r));setRows(v=>v.map(x=>x.id===r.id?{...x,copied:true}:x));}
 return <main className="wrap"><h1>Ably 문자 도우미</h1><p className="sub">에이블리 발주 관리 엑셀을 올리면 고객별 문자 문구를 자동으로 만들어줘요.</p>
 <section className="card"><h2>1. 엑셀 올리기</h2><input type="file" accept=".xlsx,.xls" onChange={importExcel}/>{fileName&&<p className="sub">{fileName} · {notice}</p>}</section>
 <section className="card"><h2>2. 문자 양식</h2><p className="sub">{'{고객명} {상품명} {옵션} {수량}'}을 사용할 수 있어요.</p><textarea value={template} onChange={e=>setTemplate(e.target.value)} style={{width:'100%',minHeight:130,padding:12,border:'1px solid #ddd',borderRadius:10,font:'inherit'}}/></section>
 <div className="row"><h2>문자 보내기</h2><b>{rows.length}건</b></div>
 {rows.length===0?<div className="card">엑셀을 올리면 여기에 고객별 문자가 표시됩니다.</div>:rows.map(r=><article className="card" key={r.id}><div className="row"><div><b>{r.name||r.customer}</b> <span className="sub">{r.phone}</span></div><span>{r.copied?'복사 완료':'대기'}</span></div><p><b>{r.product}</b>{r.option?` · ${r.option}`:''} · {r.qty}개</p><div className="msg">{message(r)}</div><div className="actions"><button onClick={()=>copy(r)}>{r.copied?'다시 복사':'문자 복사'}</button>{r.phone&&<button onClick={()=>navigator.clipboard.writeText(r.phone)}>번호 복사</button>}</div></article>)}</main>
}