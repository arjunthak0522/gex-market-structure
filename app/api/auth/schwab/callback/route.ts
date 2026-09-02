import {NextRequest,NextResponse} from 'next/server';
import {encryptSession,exchangeAuthorizationCode,SCHWAB_SESSION_COOKIE,SCHWAB_STATE_COOKIE,sessionCookieOptions} from '../../../../../lib/schwabAuth';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const code=req.nextUrl.searchParams.get('code');
  const state=req.nextUrl.searchParams.get('state');
  const expectedState=req.cookies.get(SCHWAB_STATE_COOKIE)?.value;
  if(!code||!state||!expectedState||state!==expectedState)return NextResponse.redirect(new URL('/?schwab=authorization_failed',req.url));
  try{
    const session=await exchangeAuthorizationCode(code);
    const response=NextResponse.redirect(new URL('/?schwab=connected',req.url));
    response.cookies.set(SCHWAB_SESSION_COOKIE,encryptSession(session),sessionCookieOptions);
    response.cookies.delete(SCHWAB_STATE_COOKIE);
    return response;
  }catch{
    const response=NextResponse.redirect(new URL('/?schwab=token_failed',req.url));
    response.cookies.delete(SCHWAB_STATE_COOKIE);
    return response;
  }
}
