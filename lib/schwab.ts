import type {OptionContract} from './gex';

const BASE='https://api.schwabapi.com/marketdata/v1';
const DEFAULT_STRIKE_COUNT=10;
const REQUEST_TIMEOUT_MS=8_000;

type SchwabChainErrorPayload={message?:string;error?:string;errors?:unknown};

export async function getSchwabChain(symbol:'SPY'|'QQQ',accessToken:string){
  const url=new URL(`${BASE}/chains`);
  url.searchParams.set('symbol',symbol);
  url.searchParams.set('contractType','ALL');
  url.searchParams.set('includeUnderlyingQuote','true');
  url.searchParams.set('strategy','SINGLE');
  // Schwab's unrestricted SPY/QQQ chains can be large enough to fail upstream.
  // A bounded near-spot chain has been validated successfully against the API.
  url.searchParams.set('strikeCount',String(DEFAULT_STRIKE_COUNT));

  let response:Response;
  try{
    response=await fetch(url,{
      headers:{Authorization:`Bearer ${accessToken}`,Accept:'application/json'},
      cache:'no-store',
      signal:AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  }catch(error){
    if(error instanceof Error&&error.name==='TimeoutError')throw new Error('Schwab chain request timed out');
    throw error;
  }

  const payload=await response.json().catch(()=>({})) as SchwabChainErrorPayload;
  if(!response.ok){
    const detail=typeof payload?.message==='string'?payload.message:typeof payload?.error==='string'?payload.error:'';
    throw new Error(`Schwab chain request failed: ${response.status}${detail?` - ${detail}`:''}`);
  }
  return payload;
}

export function normalizeSchwabChain(payload:any):{spot:number;contracts:OptionContract[]}{
  const spot=Number(payload?.underlyingPrice??payload?.underlying?.last??payload?.underlying?.mark??0);
  const contracts:OptionContract[]=[];
  const ingest=(map:any,putCall:'CALL'|'PUT')=>{
    for(const exp of Object.values(map??{}) as any[]){
      for(const strikeGroup of Object.values(exp??{}) as any[]){
        for(const c of strikeGroup??[]){
          const strike=Number(c.strikePrice??c.strike);
          const gamma=Number(c.gamma);
          const openInterest=Number(c.openInterest);
          if(Number.isFinite(strike)&&Number.isFinite(gamma)&&Number.isFinite(openInterest))contracts.push({
            strike,
            gamma,
            openInterest,
            putCall,
            expirationDate:c.expirationDate,
            daysToExpiration:c.daysToExpiration,
          });
        }
      }
    }
  };
  ingest(payload?.callExpDateMap,'CALL');
  ingest(payload?.putExpDateMap,'PUT');
  return{spot,contracts};
}
