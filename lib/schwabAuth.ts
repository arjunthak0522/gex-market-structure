import {createCipheriv,createDecipheriv,createHash,randomBytes} from 'node:crypto';

const TOKEN_URL='https://api.schwabapi.com/v1/oauth/token';
export const SCHWAB_SESSION_COOKIE='schwab_session';
export const SCHWAB_STATE_COOKIE='schwab_oauth_state';

export type SchwabSession={
  accessToken:string;
  refreshToken:string;
  accessExpiresAt:number;
  refreshIssuedAt:number;
};

type TokenResponse={
  access_token:string;
  refresh_token?:string;
  expires_in?:number;
  token_type?:string;
};

function required(name:'SCHWAB_CLIENT_ID'|'SCHWAB_CLIENT_SECRET'|'SCHWAB_REDIRECT_URI'|'SCHWAB_COOKIE_SECRET'){
  const value=process.env[name];
  if(!value)throw new Error(`${name} is not configured`);
  return value;
}

export function getSchwabConfig(){
  return{
    clientId:required('SCHWAB_CLIENT_ID'),
    clientSecret:required('SCHWAB_CLIENT_SECRET'),
    redirectUri:required('SCHWAB_REDIRECT_URI'),
  };
}

export function schwabConfigReady(){
  return Boolean(process.env.SCHWAB_CLIENT_ID&&process.env.SCHWAB_CLIENT_SECRET&&process.env.SCHWAB_REDIRECT_URI&&process.env.SCHWAB_COOKIE_SECRET);
}

export function createOAuthState(){return randomBytes(24).toString('base64url')}

export function authorizationUrl(state:string){
  const {clientId,redirectUri}=getSchwabConfig();
  const url=new URL('https://api.schwabapi.com/v1/oauth/authorize');
  url.searchParams.set('client_id',clientId);
  url.searchParams.set('redirect_uri',redirectUri);
  url.searchParams.set('state',state);
  return url.toString();
}

function basicAuth(){
  const {clientId,clientSecret}=getSchwabConfig();
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
}

async function tokenRequest(body:URLSearchParams):Promise<TokenResponse>{
  const response=await fetch(TOKEN_URL,{method:'POST',headers:{Authorization:basicAuth(),'Content-Type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  const payload=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(`Schwab token request failed: ${response.status}`);
  if(!payload?.access_token)throw new Error('Schwab token response did not include an access token');
  return payload as TokenResponse;
}

export async function exchangeAuthorizationCode(code:string):Promise<SchwabSession>{
  const {redirectUri}=getSchwabConfig();
  const payload=await tokenRequest(new URLSearchParams({grant_type:'authorization_code',code,redirect_uri:redirectUri}));
  if(!payload.refresh_token)throw new Error('Schwab token response did not include a refresh token');
  const now=Date.now();
  return{accessToken:payload.access_token,refreshToken:payload.refresh_token,accessExpiresAt:now+(payload.expires_in??1800)*1000,refreshIssuedAt:now};
}

export async function refreshSchwabSession(session:SchwabSession):Promise<SchwabSession>{
  const payload=await tokenRequest(new URLSearchParams({grant_type:'refresh_token',refresh_token:session.refreshToken}));
  return{
    accessToken:payload.access_token,
    refreshToken:payload.refresh_token??session.refreshToken,
    accessExpiresAt:Date.now()+(payload.expires_in??1800)*1000,
    refreshIssuedAt:session.refreshIssuedAt,
  };
}

function cookieKey(){return createHash('sha256').update(required('SCHWAB_COOKIE_SECRET')).digest()}

export function encryptSession(session:SchwabSession){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',cookieKey(),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(session),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,encrypted]).toString('base64url');
}

export function decryptSession(value:string|undefined):SchwabSession|null{
  if(!value)return null;
  try{
    const raw=Buffer.from(value,'base64url');
    const iv=raw.subarray(0,12);
    const tag=raw.subarray(12,28);
    const encrypted=raw.subarray(28);
    const decipher=createDecipheriv('aes-256-gcm',cookieKey(),iv);
    decipher.setAuthTag(tag);
    const json=Buffer.concat([decipher.update(encrypted),decipher.final()]).toString('utf8');
    const parsed=JSON.parse(json) as SchwabSession;
    if(!parsed.accessToken||!parsed.refreshToken||!parsed.accessExpiresAt||!parsed.refreshIssuedAt)return null;
    return parsed;
  }catch{return null}
}

export function accessTokenNeedsRefresh(session:SchwabSession){return Date.now()>=session.accessExpiresAt-60_000}
export function refreshAuthorizationExpired(session:SchwabSession){return Date.now()>=session.refreshIssuedAt+7*24*60*60*1000}

export const sessionCookieOptions={httpOnly:true,secure:true,sameSite:'lax' as const,path:'/',maxAge:7*24*60*60};
