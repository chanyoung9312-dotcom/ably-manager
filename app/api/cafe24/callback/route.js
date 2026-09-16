import {cookies} from 'next/headers';
import {NextResponse} from 'next/server';
import {exchangeCafe24Code,sealCafe24Session,CAFE24_STATE_COOKIE,CAFE24_SESSION_COOKIE,sessionCookieOptions} from '../../../../lib/cafe24';

const HOME='https://ably-manager-app.vercel.app/?tool=sms';

export async function GET(req){
  const url=new URL(req.url),code=url.searchParams.get('code'),state=url.searchParams.get('state');
  const store=await cookies(),savedState=store.get(CAFE24_STATE_COOKIE)?.value;
  if(!code||!state||!savedState||state!==savedState)return NextResponse.redirect(`${HOME}&cafe24=state-error`);
  try{
    const token=await exchangeCafe24Code(code);
    const sealed=sealCafe24Session(token);
    const res=NextResponse.redirect(`${HOME}&cafe24=connected`);
    res.cookies.set(CAFE24_SESSION_COOKIE,sealed,sessionCookieOptions);
    res.cookies.set(CAFE24_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
    return res;
  }catch(e){
    const res=NextResponse.redirect(`${HOME}&cafe24=error`);
    res.cookies.set(CAFE24_STATE_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});
    return res;
  }
}
