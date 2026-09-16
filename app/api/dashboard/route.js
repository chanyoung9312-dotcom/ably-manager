import {GoogleAuth} from 'google-auth-library';

const SHEET_ID='1tL1u65uuALC6Xky0CbUbPkSX7pZd_twl2Wpy0AYg8eU';
const clean=v=>String(v??'').trim();
const num=v=>{const n=Number(clean(v).replace(/,/g,''));return Number.isFinite(n)?n:0};

async function getValues(sheet,range){
  const raw=process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw new Error('Google 서비스 계정 환경변수가 없습니다.');
  const credentials=JSON.parse(raw);
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const client=await auth.getClient();
  const token=await client.getAccessToken();
  const target=encodeURIComponent(`'${sheet}'!${range}`);
  const res=await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${target}`,{headers:{Authorization:`Bearer ${token.token||token}`},cache:'no-store'});
  if(!res.ok)throw new Error(`Google Sheets ${res.status}`);
  return (await res.json()).values||[];
}

function orderFromRow(r){
  return {paymentDate:clean(r[8]),productOrderNo:clean(r[9]),orderNo:clean(r[10]||r[4]),productNo:clean(r[11]),productName:clean(r[12]),salePrice:num(r[13]),option:clean(r[15]),qty:num(r[16])||1,payment:num(r[19]),status:clean(r[31]),procurement:clean(r[0]),shipping:clean(r[7])};
}
function cancelFromRow(r){
  const returnFields=[r[0],r[1],r[2],r[3],r[4],r[5]].map(clean);
  const hasReturn=returnFields.some(v=>v&&v!=='-');
  const procurement=clean(r[6]);
  const ordered=procurement&&procurement!=='-'&&procurement!=='취소';
  return {returnRequest:clean(r[0]),returnReason:clean(r[1]),returnCost:num(r[2]),pickupRequest:clean(r[3]),returnReceived:clean(r[4]),returnProcessed:clean(r[5]),procurement,productOrderNo:clean(r[17]),orderNo:clean(r[18]||r[10]),productNo:clean(r[19]),productName:clean(r[20]),salePrice:num(r[21]),option:clean(r[23]),qty:num(r[24])||1,payment:num(r[27]),paymentDate:clean(r[16]),status:clean(r[39]),type:hasReturn?'return':ordered?'post_cancel':'pre_cancel'};
}

export async function GET(){
  try{
    const [orderValues,cancelValues]=await Promise.all([getValues('에이블리 주문','A1:AS5000'),getValues('취소 반품','A1:BA5000')]);
    const orders=orderValues.slice(1).filter(r=>clean(r[9])||clean(r[10])||clean(r[12])).map(orderFromRow);
    const cancels=cancelValues.slice(1).filter(r=>clean(r[17])||clean(r[18])||clean(r[20])).map(cancelFromRow);
    return Response.json({orders,cancels,updatedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store, max-age=0'}});
  }catch(e){console.error(e);return Response.json({error:'대시보드용 Google 주문시트를 불러오지 못했습니다.'},{status:500});}
}
