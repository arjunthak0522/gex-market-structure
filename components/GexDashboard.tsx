'use client';

import {useEffect,useMemo,useState} from 'react';

type Node={strike:number;callGex:number;putGex:number;netGex:number;absoluteGex:number};
type Summary={netGex:number;regime:'POSITIVE'|'NEGATIVE';kingNode:number|null;callWall:number|null;putWall:number|null;nearestNodes:Node[]};
type Payload={connected:boolean;authRequired?:boolean;symbol:'SPY'|'QQQ';spot?:number;contractCount?:number;nodes?:Node[];summary?:Summary;asOf?:string;error?:string};

const money=(v:number)=>{const a=Math.abs(v);if(a>=1e9)return `${v<0?'-':''}$${(a/1e9).toFixed(2)}B`;if(a>=1e6)return `${v<0?'-':''}$${(a/1e6).toFixed(1)}M`;return `${v<0?'-':''}$${Math.round(a).toLocaleString()}`};
const price=(v:number|null|undefined)=>v==null?'--':v.toFixed(2);

export default function GexDashboard(){
 const [symbol,setSymbol]=useState<'SPY'|'QQQ'>('SPY');
 const [data,setData]=useState<Payload|null>(null);
 const [loading,setLoading]=useState(true);
 const [view,setView]=useState<'ALL'|'NEAR'>('NEAR');
 async function load(next=symbol){setLoading(true);try{const r=await fetch(`/api/gex?symbol=${next}`,{cache:'no-store'});const j=await r.json();setData(j)}catch{setData({connected:false,symbol:next,error:'Unable to reach the market-data service'})}finally{setLoading(false)}}
 useEffect(()=>{load(symbol);const t=setInterval(()=>load(symbol),60000);return()=>clearInterval(t)},[symbol]);
 const nodes=data?.nodes??[];
 const visible=useMemo(()=>{if(!data?.spot)return[];const sorted=[...nodes].sort((a,b)=>Math.abs(a.strike-data.spot!)-Math.abs(b.strike-data.spot!));return (view==='NEAR'?sorted.slice(0,15):nodes).sort((a,b)=>b.strike-a.strike)},[nodes,data?.spot,view]);
 const maxAbs=Math.max(1,...visible.map(n=>n.absoluteGex));
 const positive=data?.summary?.regime==='POSITIVE';
 const explanation=positive?'More stable and mean-reverting. Large nodes are more likely to slow or pin price unless decisively broken.':'More momentum-friendly and unstable. Breaks of major nodes have a higher chance of accelerating.';
 const king=data?.summary?.kingNode;
 return <main className="shell">
   <header className="topbar"><div><div className="brand">GEX STRUCTURE</div><div className="subbrand">Live SPY + QQQ options positioning</div></div><div className={`liveDot ${data?.connected?'on':''}`}><span/> {data?.connected?'SCHWAB LIVE':'DATA OFFLINE'}</div></header>
   <section className="tickerRow">
    <div className="segmented">{(['SPY','QQQ'] as const).map(s=><button key={s} onClick={()=>setSymbol(s)} className={symbol===s?'active':''}>{s}</button>)}</div>
    <button className="refresh" onClick={()=>load()} disabled={loading}>{loading?'Refreshing…':'Refresh'}</button>
   </section>
   {!data?.connected&&!loading?<section className="offline card"><div className="eyebrow">LIVE DATA REQUIRED</div><h1>{symbol} market structure is not available yet.</h1><p>{data?.error??'Connect the Schwab Trader API to load real option-chain data.'}</p>{data?.authRequired?<a className="connectButton" href="/api/auth/schwab/start">Connect Schwab</a>:null}<div className="notice">No demo GEX values are being substituted. This dashboard only displays calculated levels from the live Schwab chain.</div></section>:null}
   {data?.connected&&data.summary&&data.spot!=null?<>
    <section className="heroGrid">
      <div className="priceCard card"><div className="eyebrow">{symbol} NOW</div><div className="spot">${price(data.spot)}</div><div className="meta">{data.contractCount?.toLocaleString()} option contracts analyzed</div></div>
      <div className={`regimeCard card ${positive?'positive':'negative'}`}><div className="eyebrow">GAMMA ENVIRONMENT</div><div className="regimeTitle"><span className="statusOrb"/>{positive?'POSITIVE GAMMA':'NEGATIVE GAMMA'}</div><p>{explanation}</p></div>
    </section>
    <section className="kingCard card"><div><div className="eyebrow">MOST IMPORTANT LEVEL</div><h2>♛ King Node <strong>${price(king)}</strong></h2><p>Largest absolute gamma concentration in the current chain. Treat it as a reaction zone, not a guaranteed support or resistance price.</p></div><div className="distance">{king!=null?<><span>{king>=data.spot?'ABOVE PRICE':'BELOW PRICE'}</span><strong>{Math.abs((king/data.spot-1)*100).toFixed(2)}%</strong></>:null}</div></section>
    <section className="levelGrid">
      <Level title="Call Wall" value={data.summary.callWall} note="Largest call-gamma concentration" />
      <Level title="Put Wall" value={data.summary.putWall} note="Largest put-gamma concentration" />
      <Level title="Net GEX" text={money(data.summary.netGex)} note={positive?'Stabilizing bias':'Amplifying bias'} />
    </section>
    <section className="map card">
      <div className="sectionHead"><div><div className="eyebrow">GAMMA MAP</div><h2>Where options pressure is concentrated</h2></div><div className="segmented small"><button onClick={()=>setView('NEAR')} className={view==='NEAR'?'active':''}>Near price</button><button onClick={()=>setView('ALL')} className={view==='ALL'?'active':''}>All strikes</button></div></div>
      <div className="legend"><span className="posKey"/> Positive GEX <span className="negKey"/> Negative GEX <span className="priceKey"/> Current price</div>
      <div className="heatmap">{visible.map(n=>{const width=Math.max(2,n.absoluteGex/maxAbs*100);const isKing=n.strike===king;const near=Math.abs(n.strike-data.spot!)<0.5;return <div className={`heatRow ${isKing?'king':''}`} key={n.strike}><div className="strike">{isKing?<span className="crown">♛</span>:null}${n.strike}</div><div className="barTrack"><div className={`bar ${n.netGex>=0?'pos':'neg'}`} style={{width:`${width}%`}}/><span className="barValue">{money(n.netGex)}</span>{near?<span className="spotMarker">NOW ${price(data.spot)}</span>:null}</div></div>})}</div>
    </section>
    <section className="readCard card"><div className="eyebrow">READ IT IN 10 SECONDS</div><h2>{positive?'Expect more chop until a major level breaks.':'Respect momentum and watch for acceleration through nodes.'}</h2><div className="readGrid"><div><span>1</span><p><strong>King Node ${price(king)}</strong><br/>The strongest gamma area on the map.</p></div><div><span>2</span><p><strong>Call Wall ${price(data.summary.callWall)}</strong><br/>Key upside reaction area.</p></div><div><span>3</span><p><strong>Put Wall ${price(data.summary.putWall)}</strong><br/>Key downside reaction area.</p></div></div></section>
    <footer>Calculated from Schwab option-chain gamma and open interest. Dealer positioning is estimated, so levels are decision context, not guaranteed price targets. Updated {data.asOf?new Date(data.asOf).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}):'--'}.</footer>
   </>:loading?<div className="loading">Loading live {symbol} structure…</div>:null}
 </main>
}

function Level({title,value,text,note}:{title:string;value?:number|null;text?:string;note:string}){return <div className="level card"><div className="eyebrow">{title}</div><strong>{text??`$${price(value)}`}</strong><span>{note}</span></div>}
