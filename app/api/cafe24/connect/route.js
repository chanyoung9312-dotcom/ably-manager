import crypto from 'crypto';
import {NextResponse} from 'next/server';
import {cafe24AuthorizeUrl,ensureCafe24Config,CAFE24_STATE_COOKIE,stateCookieOptions} from '../../../../lib/cafe24';

export async function GET(){
  try{
    ensureCafe24Config();
    const state=crypto.randomBytes(24).toString('hex');
    const res=NextResponse.redirect(cafe24AuthorizeUrl(state));
    res.cookies.set(CAFE24_STATE_COOKIE,state,stateCookieOptions);
    return res;
  }catch(e){
    return NextResponse.json({error:e.message||'카페24 연결 준비에 실패했습니다.'},{status:500});
  }
}
