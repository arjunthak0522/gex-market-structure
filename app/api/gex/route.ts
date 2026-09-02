import {NextRequest,NextResponse} from 'next/server';
import {aggregateByStrike,summarizeGex} from '../../../lib/gex';
import {getSchwabChain,normalizeSchwabChain} from '../../../lib/schwab';
import {accessTokenNeedsRefresh,decryptSession,encryptSession,refreshAuthorizationExpired,refreshSchwabSession,SCHWAB_SESSION_COOKIE,sessionCookieOptions,schwabConfigReady,type SchwabSession} from '../../../lib/schwabAuth';

export const dynamic='force-dynamic';

function authRequired(symbol:string,message:string){return NextResponse.json({connected:false,authRequired:true,symbol,error:message},{status:401})}

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')??'SPY').toUpperCase();
  if(symbol!=='SPY'&&symbol!=='QQQ')return NextResponse.json({error:'Only SPY and QQQ are supported in V1'},{status:400});
  if(!schwabConfigReady())return NextResponse.json({connected:false,authRequired:false,symbol,error:'Schwab OAuth is not configured on this preview'},{status:503});

  let session=decryptSession(req.cookies.get(SCHWAB_SESSION_COOKIE)?.value);
  if(!session)return authRequired(symbol,'Connect Schwab to load the live option chain');
  if(refreshAuthorizationExpired(session)){
    const response=authRequired(symbol,'Schwab authorization needs to be renewed');
    response.cookies.delete(SCHWAB_SESSION_COOKIE);
    return response;
  }

  let sessionChanged=false;
  try{
    if(accessTokenNeedsRefresh(session)){
      session=await refreshSchwabSession(session);
      sessionChanged=true;
    }
    const raw=await getSchwabChain(symbol as 'SPY'|'QQQ',session.accessToken);
    const {spot,contracts}=normalizeSchwabChain(raw);
    if(!Number.isFinite(spot)||spot<=0)throw new Error('Schwab option chain did not include a valid underlying price');
    if(!contracts.length)throw new Error('Schwab option chain returned no usable contracts');
    const nodes=aggregateByStrike(contracts,spot);
    const response=NextResponse.json({connected:true,authRequired:false,symbol,spot,contractCount:contracts.length,nodes,summary:summarizeGex(nodes,spot),asOf:new Date().toISOString()});
    if(sessionChanged)response.cookies.set(SCHWAB_SESSION_COOKIE,encryptSession(session as SchwabSession),sessionCookieOptions);
    return response;
  }catch(error){
    const message=error instanceof Error?error.message:'Unknown Schwab error';
    if(/401|token/i.test(message)){
      const response=authRequired(symbol,'Schwab authorization needs to be renewed');
      response.cookies.delete(SCHWAB_SESSION_COOKIE);
      return response;
    }
    return NextResponse.json({connected:false,authRequired:false,symbol,error:message},{status:502});
  }
}
