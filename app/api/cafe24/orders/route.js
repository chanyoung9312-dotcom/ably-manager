import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {openCafe24Session,sealCafe24Session,refreshCafe24Token,requestCafe24Orders,normalizeCafe24Orders,CAFE24_SESSION_COOKIE,sessionCookieOptions} from '../../../../lib/cafe24';

function unauth(message='카페24 연결이 필요합니다.'){
  const res=NextResponse.json({error:message,connectUrl:'/api/cafe24/connect'},{status:401});
  res.cookies.set(CAFE24_SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
  return res;
}

export async function GET(){
  try{
    const store=await cookies(),sealed=store.get(CAFE24_SESSION_COOKIE)?.value;
    let session=openCafe24Session(sealed);
    if(!session?.access_token||!session?.refresh_token)return unauth();

    let result=await requestCafe24Orders(session.access_token),refreshed=false;
    if(result.status===401){
      try{
        session=await refreshCafe24Token(session.refresh_token);
        refreshed=true;
        result=await requestCafe24Orders(session.access_token);
      }catch{return unauth('카페24 연결이 만료되었습니다. 다시 연결해 주세요.')}
    }
    if(!result.ok){
      const msg=result.data?.error?.message||result.data?.error_description||result.data?.error||'카페24 주문을 불러오지 못했습니다.';
      return NextResponse.json({error:typeof msg==='string'?msg:'카페24 주문을 불러오지 못했습니다.'},{status:result.status||500});
    }

    const rows=normalizeCafe24Orders(result.data);
    const res=NextResponse.json({rows,count:rows.length,connected:true});
    if(refreshed)res.cookies.set(CAFE24_SESSION_COOKIE,sealCafe24Session(session),sessionCookieOptions);
    return res;
  }catch(e){
    return NextResponse.json({error:e.message||'카페24 주문 조회에 실패했습니다.'},{status:500});
  }
}
