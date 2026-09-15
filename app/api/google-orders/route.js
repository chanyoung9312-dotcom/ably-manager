import {GoogleAuth} from 'google-auth-library';

const SHEET_ID='1tL1u65uuALC6Xky0CbUbPkSX7pZd_twl2Wpy0AYg8eU';
const clean=v=>String(v??'').trim();
const phone=v=>clean(v).replace(/[^0-9]/g,'').replace(/^(01\d)(\d{3,4})(\d{4})$/,'$1-$2-$3');
function splitAddress(v){const s=clean(v).replace(/\s+/g,' ');const m=s.match(/^(.+?(?:로|길)\s*\d+(?:-\d+)?)(?:,?\s+(.*))?$/);if(m)return[m[1],m[2]||'.'];return[s,'.'];}

export async function GET(){
 try{
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw)return Response.json({error:'Google 서비스 계정 환경변수가 없습니다.'},{status:500});
  const credentials=JSON.parse(raw);
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets']});
  const client=await auth.getClient();
  const token=await client.getAccessToken();
  const range=encodeURIComponent("'에이블리 주문'!A1:AI1000");
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`,{headers:{Authorization:`Bearer ${token.token||token}`},cache:'no-store'});
  if(!res.ok)throw new Error(`Google Sheets ${res.status}`);
  const data=await res.json();
  const values=data.values||[];const rows=[],seen=new Set();
  for(let i=1;i<values.length;i++){
   const r=values[i];if(clean(r[7])!=='우체국 배송')continue;
   if(clean(r[31]).includes('취소'))continue;
   const orderNo=clean(r[10]||r[4]),name=clean(r[26]),mobile=phone(r[27]),zip=clean(r[28]),full=clean(r[29]),memo=clean(r[30]);
   if(!name||!full)continue;const key=[orderNo,name,mobile,zip,full].join('|');if(seen.has(key))continue;seen.add(key);
   const[address,detail]=splitAddress(full);rows.push({id:key,orderNo,name,phone:mobile,zip,address,detail,memo,rowNumber:i+1});
  }
  return Response.json({rows,count:rows.length,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error(e);return Response.json({error:'Google 주문시트를 불러오지 못했습니다.'},{status:500});}
}
