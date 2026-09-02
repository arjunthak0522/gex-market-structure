import {NextResponse} from 'next/server';
import {authorizationUrl,createOAuthState,SCHWAB_STATE_COOKIE,schwabConfigReady} from '../../../../../lib/schwabAuth';

export const dynamic='force-dynamic';

export async function GET(){
  if(!schwabConfigReady())return NextResponse.json({error:'Schwab OAuth environment variables are not configured'},{status:503});
  try{
    const state=createOAuthState();
    const response=NextResponse.redirect(authorizationUrl(state));
    response.cookies.set(SCHWAB_STATE_COOKIE,state,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:600});
    return response;
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'Unable to start Schwab authorization'},{status:500});
  }
}
