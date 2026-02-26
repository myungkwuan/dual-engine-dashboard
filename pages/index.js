import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";
import Head from "next/head";
import D from "../src/data";

const fP=(v,k)=>k?`₩${Math.round(v).toLocaleString()}`:`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MKT={spy12m:14.2,spy200:"위",kospi12m:8.5,vix:16.8,nh:"양호",ad:"상승",
  sec:[["XLK",18.5],["XLC",15.2],["XLI",12.3],["XLY",11.4],["XLV",9.8],["XLU",8.7],["XLE",7.2],["XLF",6.1],["XLB",5.5],["XLP",4.3],["XLRE",2.1]]};

const mfTd=d=>d.m[1];const mfTs=d=>d.m[0];const mfAl=d=>d.m[2];
const seV=d=>d.e[0];const seSt=d=>d.e[1];const seTt=d=>d.e[2];const seRs=d=>d.e[3];
const vcpMt=d=>d.v[6];const vcpPv=d=>d.v[4];const vcpPx=d=>d.v[5];
const fundGr=d=>d.d[4];const cfS=d=>d.x[0];const cfM=d=>d.x[1];const cfL=d=>d.x[2];

export default function Dashboard(){
  const[stocks,setStocks]=useState(D);
  const[mk,setMk]=useState("all");
  const[sec,setSec]=useState("all");
  const[q,setQ]=useState("");
  const[sc,setSc]=useState("f");
  const[sa,setSa]=useState(false);
  const[view,setView]=useState("dual");
  const[tab,setTab]=useState("main");
  const[rt,setRt]=useState("idle");
  const[prog,setProg]=useState(0);
  const[stats,setStats]=useState({ok:0,fail:0,time:"-",ms:"-"});
  const[autoOn,setAutoOn]=useState(false);
  const[intv,setIntv]=useState(3);
  const[showLog,setShowLog]=useState(false);
  const[logs,setLogs]=useState([{ts:new Date().toLocaleTimeString("ko"),msg:"시스템 로드 완료 (Yahoo Finance)",c:"ok"}]);
  const[flash,setFlash]=useState({});
  const[prev,setPrev]=useState(()=>{const m={};D.forEach(d=>{m[d.t]=d.p});return m});
  const[exp,setExp]=useState(null);
  const[posCal,setPosCal]=useState({acct:100000,risk:1,entry:0,stop:0});
  const[chk,setChk]=useState(Array(9).fill(false));
  const autoRef=useRef(null);
  const busy=useRef(false);

  const log=useCallback((msg,c="if")=>{
    setLogs(p=>[{ts:new Date().toLocaleTimeString("ko"),msg,c},...p].slice(0,80));
  },[]);

  // ============ YAHOO FINANCE FETCH ENGINE ============
  const doFetch=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setRt("fetching");setProg(0);
    const t0=Date.now();
    log("🚀 Yahoo Finance 실시간 조회 시작 ("+stocks.length+"종목)");
    
    const nf={};const np={};
    stocks.forEach(d=>{np[d.t]=d.p});
    
    // Split into batches of 40 for API
    const allTickers=stocks.map(d=>({t:d.t,k:d.k}));
    const batches=[];
    for(let i=0;i<allTickers.length;i+=40){
      batches.push(allTickers.slice(i,i+40));
    }
    
    let totalOk=0,totalFail=0;
    const allUpdates={};
    
    for(let bi=0;bi<batches.length;bi++){
      const batch=batches[bi];
      const preview=batch.slice(0,5).map(t=>t.t).join(",");
      log(`📡 배치 ${bi+1}/${batches.length}: ${preview}... (${batch.length}종목)`);
      
      try{
        const resp=await fetch("/api/quotes",{
          method:"POST",
          headers:{"Content-Type":"application/json"},
          body:JSON.stringify({tickers:batch})
        });
        
        if(!resp.ok)throw new Error("API "+resp.status);
        const result=await resp.json();
        
        if(result.data){
          Object.entries(result.data).forEach(([tk,info])=>{
            allUpdates[tk]={price:info.price,change:info.change_pct};
          });
          totalOk+=result.ok||0;
          log(`✅ ${result.ok}/${batch.length} 종목 수신`,"ok");
        }
      }catch(e){
        totalFail+=batch.length;
        log(`❌ 배치 실패: ${e.message}`,"er");
      }
      
      setProg(Math.round((bi+1)/batches.length*100));
    }
    
    // Apply updates with flash animation
    setStocks(prev=>prev.map(d=>{
      const u=allUpdates[d.t];
      if(u&&u.price){
        if(u.price!==d.p)nf[d.t]=u.price>d.p?"up":"dn";
        return{...d,p:u.price,c:u.change??d.c};
      }
      return d;
    }));
    
    setPrev(np);setFlash(nf);setTimeout(()=>setFlash({}),2000);
    const elapsed=((Date.now()-t0)/1000).toFixed(1);
    setStats({ok:totalOk,fail:totalFail,time:new Date().toLocaleTimeString("ko"),ms:elapsed+"s"});
    setRt(totalFail===0?"live":"error");setProg(100);
    log(`🏁 완료: ${totalOk}성공 ${totalFail}실패 (${elapsed}s)`,"ok");
    busy.current=false;
  },[stocks,log]);

  const toggleAuto=useCallback(()=>{
    if(autoRef.current){clearInterval(autoRef.current);autoRef.current=null;setAutoOn(false);log("⏹ 자동 중지","wr");}
    else{setAutoOn(true);log("▶️ 자동: "+intv+"분","ok");doFetch();autoRef.current=setInterval(doFetch,intv*60000);}
  },[intv,doFetch,log]);
  useEffect(()=>()=>{if(autoRef.current)clearInterval(autoRef.current)},[]);

  // Filter & Sort
  const sectors=useMemo(()=>[...new Set(stocks.map(d=>d.s))].sort(),[stocks]);
  const filtered=useMemo(()=>stocks.filter(d=>{
    if(mk==="us"&&d.k)return false;if(mk==="kr"&&!d.k)return false;
    if(sec!=="all"&&d.s!==sec)return false;
    if(q){const ql=q.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}
    return true;
  }),[stocks,mk,sec,q]);
  const sorted=useMemo(()=>[...filtered].sort((a,b)=>{
    const gv=d=>{switch(sc){case"n":return d.n;case"s":return d.s;case"p":return d.p;case"c":return d.c;case"f":return d.f||0;case"mf":return mfTs(d);case"sepa":return seTt(d);case"cf":return cfM(d)+cfL(d);default:return d.f||0;}};
    const va=gv(a),vb=gv(b);
    if(typeof va==="string")return sa?va.localeCompare(vb):vb.localeCompare(va);
    return sa?(va-vb):(vb-va);
  }),[filtered,sc,sa]);
  const hs=col=>{if(sc===col)setSa(!sa);else{setSc(col);setSa(false);}};

  const upN=filtered.filter(d=>d.c>0).length;
  const dnN=filtered.filter(d=>d.c<0).length;
  const buyR=filtered.filter(d=>seV(d)==="매수준비").length;
  const vcpR=filtered.filter(d=>vcpMt(d)==="성숙").length;

  const calcPos=useMemo(()=>{
    const{acct,risk,entry,stop}=posCal;
    if(!entry||!stop||entry<=stop)return{sh:0,sz:0,ml:0,pc:0};
    const ra=acct*(risk/100);const ps=entry-stop;const sh=Math.floor(ra/ps);
    return{sh,sz:Math.round(sh*entry),ml:Math.round(ra),pc:(sh*entry/acct*100).toFixed(1)};
  },[posCal]);

  // === UI Components ===
  const Dot=({s})=>{const bg=s==="idle"?"#484f58":s==="fetching"?"#d29922":s==="live"?"#3fb950":"#f85149";
    return <div style={{width:15,height:15,borderRadius:"50%",background:bg,boxShadow:s!=="idle"?("0 0 8px "+bg):"none",flexShrink:0}}/>};
  const Badge=({v,g,r})=>{if(v===null||v===undefined)return <span style={{color:"#484f58",fontSize:15}}>-</span>;
    const c=g?v>=g?"#3fb950":v>=(r||0)?"#d29922":"#f85149":"#8b949e";
    return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:39,height:27,padding:"0 6px",borderRadius:3,fontSize:15,fontWeight:600,background:c+"20",color:c}}>{typeof v==="number"&&v%1?v.toFixed(1):v}</span>};
  const Chg=({v})=>{const c=v>0?"#3fb950":v<0?"#f85149":"#484f58";return <span style={{color:c,fontFamily:"monospace",fontSize:17}}>{v>0?"+":""}{v.toFixed(2)}%</span>};
  const Tb=({label,active,onClick})=><button onClick={onClick} style={{padding:"6px 18px",borderRadius:5,fontSize:17,fontWeight:600,cursor:"pointer",border:"1px solid "+(active?"#58a6ff":"#21262d"),background:active?"rgba(88,166,255,.12)":"#0d1117",color:active?"#58a6ff":"#8b949e",whiteSpace:"nowrap"}}>{label}</button>;
  const Chip=({n,label,color})=><div style={{display:"flex",alignItems:"center",gap:3,padding:"3px 12px",borderRadius:5,fontSize:14,fontWeight:600,border:"1px solid "+color,background:color+"20",color:color}}><span style={{fontFamily:"monospace",fontSize:18,fontWeight:700}}>{n}</span>{label}</div>;
  const IR=({l,v,c})=><div style={{display:"flex",justifyContent:"space-between",padding:"3px 0"}}><span style={{color:"#484f58",fontSize:15}}>{l}</span><span style={{fontFamily:"monospace",color:c||"#e6edf3",fontWeight:600,fontSize:15}}>{v||"-"}</span></div>;
  const TH=({children,onClick,a,r,c,w})=><th onClick={onClick} style={{padding:"8px 6px",textAlign:r?"right":c?"center":"left",fontWeight:600,color:a?"#58a6ff":"#484f58",fontSize:14,borderBottom:"2px solid #21262d",whiteSpace:"nowrap",cursor:onClick?"pointer":"default",userSelect:"none",background:"#06080d",width:w,position:"sticky",top:0,zIndex:1}}>{children}</th>;

  const grC=g=>g==="A"?"#3fb950":g==="B"?"#d29922":g==="C"||g==="D"?"#f85149":"#484f58";
  const grT=g=>g==="A"?"⭐⭐⭐":g==="B"?"⭐⭐":g==="C"?"⭐":g==="D"?"❌":"—";
  const vcpC=m=>m==="성숙"?"#3fb950":m==="형성중"?"#d29922":"#f85149";
  const vcpI=m=>m==="성숙"?"🟢":m==="형성중"?"🟡":"🔴";
  const cfLbl=(v)=>v>=3?"강함":v>=2?"보통":"약함";
  const cfClr=(v)=>v>=3?"#3fb950":v>=2?"#d29922":"#f85149";

  // === Detail Panel ===
  const Detail=({d})=>{
    const gr=fundGr(d);const eq1=d.d[0];const eq2=d.d[1];const rq=d.d[2];const roe=d.d[3];
    const acc=eq1>eq2?"가속":"둔화";
    return(
    <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:8,padding:14,margin:"2px 6px 6px"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:23,fontWeight:800}}>{d.n}</span>
        <span style={{fontSize:15,color:"#484f58",fontFamily:"monospace"}}>{d.t}</span>
        <span style={{padding:"3px 10px",borderRadius:8,fontSize:12,background:"rgba(72,79,88,.15)",color:"#484f58"}}>{d.s}</span>
      </div>
      <div style={{background:"#161b22",borderRadius:6,padding:10,marginBottom:8}}>
        <div style={{fontSize:17,fontWeight:700,color:"#58a6ff",marginBottom:6}}>컨플루언스 매트릭스 (3TF x 3Factor)</div>
        <div style={{display:"grid",gridTemplateColumns:"80px 1fr 1fr 1fr",gap:4,fontSize:15}}>
          <div style={{color:"#484f58",fontWeight:600}}>타임프레임</div><div style={{textAlign:"center",color:"#484f58"}}>단기</div><div style={{textAlign:"center",color:"#484f58"}}>중기</div><div style={{textAlign:"center",color:"#484f58"}}>장기</div>
          <div style={{color:"#8b949e"}}>점수</div>
          <div style={{textAlign:"center"}}><Badge v={cfS(d)} g={3} r={2}/></div>
          <div style={{textAlign:"center"}}><Badge v={cfM(d)} g={3} r={2}/></div>
          <div style={{textAlign:"center"}}><Badge v={cfL(d)} g={3} r={2}/></div>
          <div style={{color:"#8b949e"}}>판정</div>
          <div style={{textAlign:"center",color:cfClr(cfS(d)),fontSize:14}}>{cfLbl(cfS(d))}</div>
          <div style={{textAlign:"center",color:cfClr(cfM(d)),fontSize:14}}>{cfLbl(cfM(d))}</div>
          <div style={{textAlign:"center",color:cfClr(cfL(d)),fontSize:14}}>{cfLbl(cfL(d))}</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#39d353",marginBottom:6}}>멀티팩터</div>
          <IR l="종합점수" v={mfTs(d).toFixed(2)} c={mfTs(d)>=2?"#3fb950":"#d29922"}/>
          <IR l="방향" v={mfTd(d)+(mfAl(d)?" ⚡":"")} c={mfTd(d)==="매수"?"#3fb950":"#f85149"}/>
        </div>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#bc8cff",marginBottom:6}}>SEPA</div>
          <IR l="템플릿" v={seTt(d)+"/8"} c={seTt(d)>=8?"#3fb950":"#d29922"}/>
          <IR l="스테이지" v={seSt(d)} c={seSt(d).includes("Stage 2")?"#3fb950":"#d29922"}/>
          <IR l="판정" v={seV(d)} c={seV(d)==="매수준비"?"#3fb950":"#d29922"}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#f778ba",marginBottom:6}}>VCP 패턴</div>
          <IR l="수축" v={"T1:-"+d.v[0]+"% T2:-"+d.v[1]+"%"+(d.v[2]?" T3:-"+d.v[2]+"%":"")} c="#e6edf3"/>
          <IR l="성숙도" v={vcpI(vcpMt(d))+" "+vcpMt(d)} c={vcpC(vcpMt(d))}/>
          <IR l="베이스" v={d.v[3]+"주"} c="#8b949e"/>
          <IR l="피봇" v={fP(vcpPv(d),d.k)} c="#58a6ff"/>
          <IR l="근접도" v={vcpPx(d)+"%"} c={vcpPx(d)<5?"#3fb950":"#d29922"}/>
        </div>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#d29922",marginBottom:6}}>펀더멘탈 가속</div>
          <IR l="EPS Q1" v={eq1?((eq1>0?"+":"")+eq1+"%"):"-"} c={eq1>=20?"#3fb950":"#d29922"}/>
          <IR l="EPS Q2" v={eq2?((eq2>0?"+":"")+eq2+"%"):"-"} c="#8b949e"/>
          <IR l="가속여부" v={eq1&&eq2?acc:"-"} c={acc==="가속"?"#3fb950":"#f85149"}/>
          <IR l="매출" v={rq?((rq>0?"+":"")+rq+"%"):"-"} c="#8b949e"/>
          <IR l="ROE" v={roe?(roe+"%"):"-"} c={roe>=15?"#3fb950":"#8b949e"}/>
          <IR l="등급" v={grT(gr)+" "+gr} c={grC(gr)}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:8}}>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#39d353",marginBottom:6}}>진입 전략</div>
          <IR l="진입가" v={d.q[0]?fP(d.q[0],d.k):"-"} c="#58a6ff"/>
          <IR l="손절가(-7%)" v={d.q[1]?fP(d.q[1],d.k):"-"} c="#f85149"/>
          <IR l="1차목표(+15%)" v={d.q[2]?fP(d.q[2],d.k):"-"} c="#3fb950"/>
          <IR l="2차목표(+30%)" v={d.q[3]?fP(d.q[3],d.k):"-"} c="#3fb950"/>
          <IR l="손익비" v={d.q[4]?d.q[4]+":1":"-"} c={d.q[4]>=2?"#3fb950":"#d29922"}/>
          <IR l="추천비중" v={d.q[5]?d.q[5]+"%":"-"} c="#bc8cff"/>
        </div>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:17,fontWeight:700,color:"#58a6ff",marginBottom:6}}>RS 상대강도</div>
          <IR l="3M 수익률" v={(d.r[0]>0?"+":"")+d.r[0]+"%"} c={d.r[0]>4.2?"#3fb950":"#f85149"}/>
          <IR l="SPY 3M" v="+4.2%" c="#484f58"/>
          <IR l="6M 수익률" v={(d.r[1]>0?"+":"")+d.r[1]+"%"} c={d.r[1]>8.7?"#3fb950":"#f85149"}/>
          <IR l="SPY 6M" v="+8.7%" c="#484f58"/>
          <IR l="섹터순위" v={d.r[2]+"위"} c={d.r[2]<=10?"#3fb950":"#8b949e"}/>
          <IR l="아웃퍼폼" v={d.r[0]>4.2&&d.r[1]>8.7?"통과":"미달"} c={d.r[0]>4.2?"#3fb950":"#f85149"}/>
        </div>
      </div>
    </div>
  )};

  const chkItems=["3타임프레임 분석","3-Factor 점검","컨플루언스 2/3이상","손절/목표 설정","손익비 1.5:1이상","상위TF 비충돌","리스크 범위내","이벤트 확인","감정매매 아닌가"];

  // === RENDER ===
  return(
    <>
    <Head>
      <title>듀얼 엔진 프로 | MF x SEPA</title>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap" rel="stylesheet"/>
    </Head>
    <div style={{background:"#06080d",color:"#e6edf3",minHeight:"100vh",fontFamily:"'Noto Sans KR',system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",borderBottom:"1px solid #21262d",padding:"14px 20px"}}>
        <div style={{maxWidth:1800,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h1 style={{fontSize:24,fontWeight:900,background:"linear-gradient(135deg,#58a6ff,#bc8cff,#f778ba)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>{"⚡ 듀얼 엔진 프로 — MF × SEPA ("+D.length+"종목)"}</h1>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:14,color:"#3fb950",fontFamily:"'JetBrains Mono'",fontWeight:600}}>Yahoo Finance Live</span>
            <span style={{fontSize:14,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{new Date().toISOString().slice(0,10)}</span>
          </div>
        </div>
      </div>

      {/* RT Engine Bar */}
      <div style={{maxWidth:1800,margin:"8px auto",padding:"0 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:"12px 16px",display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}><Dot s={rt}/><span style={{fontSize:17,fontWeight:700}}>{rt==="idle"?"대기":rt==="fetching"?"조회중...":rt==="live"?"✅ 완료":"⚠️ 실패"}</span></div>
          <div style={{flex:1,minWidth:80,maxWidth:250}}><div style={{height:6,background:"#161b22",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#58a6ff,#bc8cff)",borderRadius:3,width:prog+"%",transition:"width .3s"}}/></div></div>
          <div style={{display:"flex",gap:14,fontSize:14,color:"#484f58",fontFamily:"'JetBrains Mono'"}}><span>{"갱신: "}{stats.time}</span><span>{"성공: "}<b style={{color:"#3fb950"}}>{stats.ok}</b>{"/"}{D.length}</span><span>{stats.ms}</span></div>
          <div style={{display:"flex",gap:6,marginLeft:"auto",alignItems:"center"}}>
            <button onClick={doFetch} disabled={rt==="fetching"} style={{padding:"7px 18px",borderRadius:6,border:"1px solid #bc8cff",cursor:rt==="fetching"?"wait":"pointer",background:"linear-gradient(135deg,#1a3a5c,#2d1b69)",color:"#bc8cff",fontSize:17,fontWeight:700}}>{"⚡ 갱신"}</button>
            <button onClick={toggleAuto} style={{padding:"7px 14px",borderRadius:6,fontSize:17,fontWeight:600,cursor:"pointer",border:"1px solid "+(autoOn?"#3fb950":"#21262d"),background:autoOn?"rgba(63,185,80,.12)":"#161b22",color:autoOn?"#3fb950":"#8b949e"}}>{autoOn?"⏹ 중지":"🔄 자동"}</button>
            <input type="number" value={intv} min={1} max={60} onChange={e=>setIntv(+e.target.value||3)} style={{width:44,padding:"5px 6px",borderRadius:4,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:15,fontFamily:"'JetBrains Mono'",textAlign:"center",outline:"none"}}/>
            <span style={{fontSize:14,color:"#484f58"}}>분</span>
            <button onClick={()=>setShowLog(!showLog)} style={{padding:"6px 12px",borderRadius:5,border:"1px solid #21262d",background:"#161b22",color:"#8b949e",cursor:"pointer",fontSize:15}}>{"📋 로그"}</button>
          </div>
        </div>
      </div>

      {/* Log Panel */}
      {showLog && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}><div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:6,padding:"8px 12px",maxHeight:120,overflowY:"auto",fontFamily:"'JetBrains Mono'",fontSize:14}}>{logs.map((l,i)=><div key={i} style={{padding:"2px 0"}}><span style={{color:"#484f58",marginRight:6}}>{l.ts}</span><span style={{color:l.c==="ok"?"#3fb950":l.c==="er"?"#f85149":"#58a6ff"}}>{l.msg}</span></div>)}</div></div>}

      {/* Tab Nav */}
      <div style={{maxWidth:1800,margin:"8px auto",padding:"0 20px"}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {[["main","📊 메인"],["filter","🌐 시장필터"],["calc","🧮 포지션"],["check","✅ 체크리스트"]].map(([k,l])=>
            <Tb key={k} label={l} active={tab===k} onClick={()=>setTab(k)}/>
          )}
        </div>
      </div>

      {/* Market Filter Tab */}
      {tab==="filter" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:16}}>
          <div style={{fontSize:20,fontWeight:800,color:"#58a6ff",marginBottom:10}}>듀얼 모멘텀 시장 필터</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <div style={{background:"#161b22",borderRadius:8,padding:12}}>
              <div style={{fontSize:15,color:"#484f58",marginBottom:4}}>절대 모멘텀</div>
              <div style={{fontSize:17}}>{"SPY 12M: "}<b style={{color:"#3fb950"}}>{"+"+MKT.spy12m+"%"}</b>{" ✅ PASS"}</div>
              <div style={{fontSize:17}}>{"KOSPI 12M: "}<b style={{color:"#3fb950"}}>{"+"+MKT.kospi12m+"%"}</b>{" ✅ PASS"}</div>
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:12}}>
              <div style={{fontSize:15,color:"#484f58",marginBottom:4}}>시장 건강도</div>
              <div style={{fontSize:15}}>{"200일선: "}<b style={{color:"#3fb950"}}>{MKT.spy200}</b></div>
              <div style={{fontSize:15}}>{"신고가/신저가: "}<b style={{color:"#3fb950"}}>{MKT.nh}</b></div>
              <div style={{fontSize:15}}>{"A/D 라인: "}<b style={{color:"#3fb950"}}>{MKT.ad}</b></div>
              <div style={{fontSize:15}}>{"VIX: "}<b style={{color:"#3fb950"}}>{MKT.vix}</b></div>
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:12,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:36,fontWeight:900,color:"#3fb950"}}>{"🟢"}</div>
              <div style={{fontSize:21,fontWeight:800,color:"#3fb950"}}>공격 모드</div>
              <div style={{fontSize:14,color:"#484f58",marginTop:4}}>정상매매. 비중100%</div>
            </div>
          </div>
          <div style={{marginTop:10}}>
            <div style={{fontSize:15,color:"#484f58",marginBottom:4}}>상대 모멘텀 섹터 순위</div>
            <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
              {MKT.sec.map(([s,v],i)=>
                <span key={s} style={{padding:"3px 10px",borderRadius:10,fontSize:14,background:i<3?"rgba(63,185,80,.12)":"#161b22",border:"1px solid "+(i<3?"#3fb950":"#21262d"),color:i<3?"#3fb950":"#8b949e"}}>{s+" "+(v>0?"+":"")+v+"%"}</span>
              )}
            </div>
          </div>
        </div>
      </div>}

      {/* Position Calculator Tab */}
      {tab==="calc" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:16}}>
          <div style={{fontSize:20,fontWeight:800,color:"#bc8cff",marginBottom:10}}>포지션 사이징 계산기</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[["계좌($)","acct"],["리스크(%)","risk"],["진입가","entry"],["손절가","stop"]].map(([l,k])=>
              <div key={k}><div style={{fontSize:14,color:"#484f58",marginBottom:2}}>{l}</div>
                <input type="number" value={posCal[k]} onChange={e=>setPosCal(p=>({...p,[k]:+e.target.value||0}))}
                  style={{width:"100%",padding:"7px 10px",borderRadius:5,border:"1px solid #21262d",background:"#161b22",color:"#e6edf3",fontSize:17,outline:"none",fontFamily:"'JetBrains Mono'"}}/></div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:10}}>
            {[["매수수량",calcPos.sh+"주"],["규모","$"+calcPos.sz.toLocaleString()],["최대손실","$"+calcPos.ml.toLocaleString()],["비중",calcPos.pc+"%"]].map(([l,v])=>
              <div key={l} style={{background:"#161b22",borderRadius:6,padding:10,textAlign:"center"}}>
                <div style={{fontSize:14,color:"#484f58"}}>{l}</div>
                <div style={{fontSize:21,fontWeight:800,color:"#bc8cff",fontFamily:"'JetBrains Mono'"}}>{v}</div>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* Checklist Tab */}
      {tab==="check" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:16}}>
          <div style={{fontSize:20,fontWeight:800,color:"#d29922",marginBottom:10}}>실행 전 체크리스트</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
            {chkItems.map((item,i)=>
              <label key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:4,background:chk[i]?"rgba(63,185,80,.08)":"transparent",cursor:"pointer",fontSize:15,color:chk[i]?"#3fb950":"#8b949e"}}>
                <input type="checkbox" checked={chk[i]} onChange={()=>setChk(p=>{const n=[...p];n[i]=!n[i];return n;})} style={{accentColor:"#3fb950",width:18,height:18}}/>
                {item}
              </label>
            )}
          </div>
          <div style={{marginTop:10,fontSize:17,fontWeight:700,color:chk.filter(Boolean).length>=7?"#3fb950":chk.filter(Boolean).length>=5?"#d29922":"#f85149"}}>
            {chk.filter(Boolean).length+"/9 — "+(chk.filter(Boolean).length>=7?"✅ 진입 가능":"⚠️ 추가 점검 필요")}
          </div>
        </div>
      </div>}

      {/* Filters & Table */}
      {(tab==="main"||tab==="filter") && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",alignItems:"center",marginBottom:5}}>
          {[["all","🌐 전체"],["us","🇺🇸 미국"],["kr","🇰🇷 한국"]].map(([k,l])=><Tb key={k} label={l} active={mk===k} onClick={()=>setMk(k)}/>)}
          <div style={{width:1,height:20,background:"#21262d"}}/>
          {[["dual","📊 듀얼"],["mf","🎯 MF"],["sepa","🏆 SEPA"],["vcp","📉 VCP"],["cf","📐 CF"]].map(([k,l])=><Tb key={k} label={l} active={view===k} onClick={()=>setView(k)}/>)}
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍 검색" style={{padding:"6px 12px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:17,width:120,outline:"none"}}/>
          <span style={{fontSize:15,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{sorted.length}</span>
          <div style={{display:"flex",gap:4,marginLeft:"auto",flexWrap:"wrap"}}>
            <Chip n={upN} label="상승" color="#3fb950"/>
            <Chip n={dnN} label="하락" color="#f85149"/>
            <Chip n={buyR} label="매수준비" color="#bc8cff"/>
            <Chip n={vcpR} label="VCP성숙" color="#f778ba"/>
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>
          <button onClick={()=>setSec("all")} style={{padding:"3px 10px",borderRadius:3,border:"1px solid "+(sec==="all"?"#58a6ff":"#21262d"),background:sec==="all"?"rgba(88,166,255,.12)":"#0d1117",color:sec==="all"?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:14}}>전체</button>
          {sectors.map(s=><button key={s} onClick={()=>setSec(s)} style={{padding:"3px 10px",borderRadius:3,border:"1px solid "+(sec===s?"#58a6ff":"#21262d"),background:sec===s?"rgba(88,166,255,.12)":"#0d1117",color:sec===s?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:14}}>{s}</button>)}
        </div>
      </div>}

      {(tab==="main"||tab==="filter") && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 30px",overflowX:"auto"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:17}}>
          <thead><tr>
            <TH w={36}>{"#"}</TH>
            <TH onClick={()=>hs("n")} a={sc==="n"}>종목</TH>
            <TH onClick={()=>hs("s")} a={sc==="s"}>섹터</TH>
            <TH onClick={()=>hs("p")} a={sc==="p"} r>현재가</TH>
            <TH onClick={()=>hs("c")} a={sc==="c"} r>등락</TH>
            <TH onClick={()=>hs("f")} a={sc==="f"} c>펀더</TH>
            <TH c>B</TH>
            {(view==="dual"||view==="mf") && [
              <TH key="mfh" onClick={()=>hs("mf")} a={sc==="mf"} c>MF</TH>,
              <TH key="mfd" c>방향</TH>
            ]}
            {(view==="dual"||view==="sepa") && [
              <TH key="sph" onClick={()=>hs("sepa")} a={sc==="sepa"} c>SEPA</TH>,
              <TH key="spd" c>판정</TH>
            ]}
            {view==="vcp" && [
              <TH key="v1" c>VCP</TH>,<TH key="v2" c>피봇</TH>,<TH key="v3" c>근접</TH>
            ]}
            {view==="cf" && [
              <TH key="c1" onClick={()=>hs("cf")} a={sc==="cf"} c>단기</TH>,
              <TH key="c2" c>중기</TH>,<TH key="c3" c>장기</TH>
            ]}
            <TH c>등급</TH>
          </tr></thead>
          <tbody>
            {sorted.map((d,i)=>{
              const fl=flash[d.t];const isE=exp===d.t;
              return(
                <Fragment key={d.t}>
                  <tr onClick={()=>setExp(isE?null:d.t)} style={{borderBottom:"1px solid rgba(33,38,45,.4)",cursor:"pointer",background:fl==="up"?"rgba(63,185,80,.15)":fl==="dn"?"rgba(248,81,73,.15)":"transparent",transition:"background 1.5s"}}>
                    <td style={{padding:"7px 6px",color:"#484f58",fontFamily:"'JetBrains Mono'",fontSize:14}}>{i+1}</td>
                    <td style={{padding:"7px 6px",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><span style={{fontWeight:500}}>{d.n}</span><span style={{fontSize:12,color:"#484f58",marginLeft:4,fontFamily:"'JetBrains Mono'"}}>{d.t}</span></td>
                    <td style={{padding:"7px 6px"}}><span style={{padding:"2px 8px",borderRadius:3,fontSize:12,background:"rgba(72,79,88,.15)",color:"#484f58"}}>{d.s}</span></td>
                    <td style={{padding:"7px 6px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:fl?700:400,color:fl?"#39d353":"#e6edf3",fontSize:17}}>{fP(d.p,d.k)}</td>
                    <td style={{padding:"7px 6px",textAlign:"right"}}><Chg v={d.c}/></td>
                    <td style={{padding:"7px 6px",textAlign:"center"}}><Badge v={d.f||null} g={80} r={60}/></td>
                    <td style={{padding:"7px 6px",textAlign:"center"}}>{d.b?<span style={{fontSize:15}}>{"🚀"}</span>:""}</td>
                    {(view==="dual"||view==="mf") && [
                      <td key="m1" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={mfTs(d)} g={2.5} r={1.5}/></td>,
                      <td key="m2" style={{padding:"7px 6px",textAlign:"center"}}><span style={{fontSize:14,padding:"2px 8px",borderRadius:3,background:mfTd(d)==="매수"?"rgba(63,185,80,.12)":"rgba(248,81,73,.12)",color:mfTd(d)==="매수"?"#3fb950":"#f85149"}}>{mfTd(d)}{mfAl(d)?" ⚡":""}</span></td>
                    ]}
                    {(view==="dual"||view==="sepa") && [
                      <td key="s1" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={seTt(d)} g={8} r={7}/></td>,
                      <td key="s2" style={{padding:"7px 6px",textAlign:"center"}}><span style={{fontSize:14,padding:"2px 8px",borderRadius:3,background:seV(d)==="매수준비"?"rgba(63,185,80,.12)":seV(d)==="워치리스트"?"rgba(210,153,34,.12)":"rgba(248,81,73,.12)",color:seV(d)==="매수준비"?"#3fb950":seV(d)==="워치리스트"?"#d29922":"#f85149"}}>{seV(d)}</span></td>
                    ]}
                    {view==="vcp" && [
                      <td key="vc1" style={{padding:"7px 6px",textAlign:"center",fontSize:14,color:vcpC(vcpMt(d))}}>{vcpI(vcpMt(d))+" "+vcpMt(d)}</td>,
                      <td key="vc2" style={{padding:"7px 6px",textAlign:"center",fontSize:14,fontFamily:"'JetBrains Mono'"}}>{vcpPv(d)?fP(vcpPv(d),d.k):"-"}</td>,
                      <td key="vc3" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={vcpPx(d)} g={99} r={5}/></td>
                    ]}
                    {view==="cf" && [
                      <td key="cf1" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={cfS(d)} g={3} r={2}/></td>,
                      <td key="cf2" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={cfM(d)} g={3} r={2}/></td>,
                      <td key="cf3" style={{padding:"7px 6px",textAlign:"center"}}><Badge v={cfL(d)} g={3} r={2}/></td>
                    ]}
                    <td style={{padding:"7px 6px",textAlign:"center",fontSize:12}}><span style={{color:grC(fundGr(d))}}>{grT(fundGr(d))}</span></td>
                  </tr>
                  {isE && <tr><td colSpan={20} style={{padding:0}}><Detail d={d}/></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {sorted.length===0 && <div style={{textAlign:"center",padding:40,color:"#484f58",fontSize:17}}>결과 없음</div>}
      </div>}

      <style>{`
        *{box-sizing:border-box}
        table tbody tr:hover{background:#161b22!important}
        ::-webkit-scrollbar{width:6px;height:6px}
        ::-webkit-scrollbar-track{background:#0d1117}
        ::-webkit-scrollbar-thumb{background:#21262d;border-radius:3px}
        thead th{position:sticky;top:0;z-index:2}
      `}</style>
    </div>
    </>
  );
}
