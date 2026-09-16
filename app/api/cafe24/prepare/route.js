import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {openCafe24Session,sealCafe24Session,refreshCafe24Token,prepareCafe24Order,CAFE24_SESSION_COOKIE,sessionCookieOptions} from '../../../../lib/cafe24';

function unauth(message='카페24 연결이 필요합니다.'){
  const res=NextResponse.json({error:message,connectUrl:'/api/cafe24/connect'},{status:401});
  res.cookies.set(CAFE24_SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  return res;
}
export async function POST(req){
  try{
    const {orderId,orderItemCodes=[]}=await req.json();
    if(!orderId)return NextResponse.json({error:'주문번호가 없습니다.'},{status:400});
    const store=await cookies();let session=openCafe24Session(store.get(CAFE24_SESSION_COOKIE)?.value);
    if(!session?.access_token||!session?.refresh_token)return unauth();
    let result=await prepareCafe24Order(session.access_token,orderId,orderItemCodes),refreshed=false;
    if(result.status===401){try{session=await refreshCafe24Token(session.refresh_token);refreshed=true;result=await prepareCafe24Order(session.access_token,orderId,orderItemCodes);}catch{return unauth('카페24 연결이 만료되었습니다. 다시 연결해 주세요.')}}
    if(!result.ok){const msg=result.data?.error?.message||result.data?.error_description||result.data?.error||'배송준비 처리에 실패했습니다.';return NextResponse.json({error:typeof msg==='string'?msg:'배송준비 처리에 실패했습니다.',detail:result.data},{status:result.status||500});}
    const res=NextResponse.json({ok:true,orderId});if(refreshed)res.cookies.set(CAFE24_SESSION_COOKIE,sealCafe24Session(session),sessionCookieOptions);return res;
  }catch(e){return NextResponse.json({error:e.message||'배송준비 처리에 실패했습니다.'},{status:500});}
}
