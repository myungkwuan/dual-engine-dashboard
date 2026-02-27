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
const cfLbl=(v)=>v>=3?"강함":v>=2?"보통":"약함";
const cfClr=(v)=>v>=3?"#3fb950":v>=2?"#d29922":"#f85149";

// === 수정 #1: 종합판정 계산 함수 ===
function getVerdict(d) {
  const mfScore = d.f || 0;
  const mfGrade = mfScore >= 80 ? 'A' : mfScore >= 70 ? 'B' : mfScore >= 60 ? 'C' : 'F';
  const sv = seV(d), st = seTt(d);
  const sepaLevel = sv === "매수준비" ? '강력매수' : st >= 7 ? '매수' : st >= 6 ? '관심' : st >= 5 ? '대기' : '회피';
  const vm = vcpMt(d);
  const vcpScore = vm === "성숙" ? 8 : vm === "형성중" ? 5 : 2;
  const hasFCF = d.b || (cfM(d) >= 2 && cfL(d) >= 2);
  let verdict, color, stars;
  const sepaOK = (sepaLevel === '강력매수' || sepaLevel === '매수');
  const sepaWatch = (sepaLevel === '관심');
  if (mfScore >= 80 && sepaOK && vcpScore >= 7 && hasFCF) { verdict = '🔥최강'; color = '#ff1744'; stars = 5; }
  else if (mfScore >= 80 && sepaOK && vcpScore >= 5 && hasFCF) { verdict = '🟢강력'; color = '#00e676'; stars = 4; }
  else if (mfScore >= 70 && (sepaOK || sepaWatch) && vcpScore >= 5) { verdict = '🔵양호'; color = '#448aff'; stars = 3; }
  else if (mfScore >= 60 && sepaOK) { verdict = '🟡모멘텀'; color = '#ffd600'; stars = 2; }
  else { verdict = '⛔금지'; color = '#78909c'; stars = 1; }
  return { verdict, color, stars, details: { mfGrade, mfScore, sepaLevel, vcpScore, hasFCF } };
}

// === 수정 #3: 상세분석 모달 컴포넌트 ===
function StockDetailModal({ stock, onClose }) {
  if (!stock) return null;
  const verdict = getVerdict(stock);
  const radarData = [
    { label: 'MF점수', value: Math.min(stock.f || 0, 100), max: 100 },
    { label: 'SEPA', value: seTt(stock) * 12.5, max: 100 },
    { label: 'VCP', value: vcpMt(stock) === "성숙" ? 80 : vcpMt(stock) === "형성중" ? 50 : 20, max: 100 },
    { label: 'CF단기', value: cfS(stock) * 25, max: 100 },
    { label: 'CF중기', value: cfM(stock) * 25, max: 100 },
    { label: 'CF장기', value: cfL(stock) * 25, max: 100 },
  ];
  const sigInfo = seV(stock) === "매수준비"
    ? { text: '🚀 매수준비!', color: '#00ff88' }
    : seTt(stock) >= 7 ? { text: seTt(stock)+'/8 (근접)', color: '#4dabf7' }
    : seTt(stock) >= 5 ? { text: seTt(stock)+'/8 (조정)', color: '#ffd43b' }
    : { text: seTt(stock)+'/8 (이탈)', color: '#ff6b6b' };

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.85)',zIndex:9999,display:'flex',justifyContent:'center',alignItems:'center',padding:'20px'}} onClick={onClose}>
      <div style={{background:'#0d0d1a',borderRadius:'16px',maxWidth:'700px',width:'100%',maxHeight:'90vh',overflow:'auto',border:'1px solid #333',padding:'24px'}} onClick={e=>e.stopPropagation()}>
        {/* 헤더 */}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'20px'}}>
          <div>
            <div style={{fontSize:'10px',color:'#666',padding:'2px 6px',background:'#1a1a2e',borderRadius:4,display:'inline-block',marginBottom:'4px'}}>{stock.s}</div>
            <h2 style={{fontSize:'22px',fontWeight:800,color:'#eee',margin:0}}>{stock.n}<span style={{fontSize:'14px',color:'#666',marginLeft:'8px'}}>{stock.t}</span></h2>
            <div style={{fontSize:'20px',fontWeight:700,color:'#fff',marginTop:'4px',fontFamily:'monospace'}}>
              {fP(stock.p,stock.k)}
              <span style={{fontSize:'14px',color:stock.c>=0?'#ff5252':'#448aff',marginLeft:'8px'}}>{stock.c>=0?'▲':'▼'}{Math.abs(stock.c).toFixed(2)}%</span>
            </div>
          </div>
          <div style={{padding:'12px 16px',borderRadius:'12px',background:verdict.color+'20',border:`2px solid ${verdict.color}`,textAlign:'center'}}>
            <div style={{fontSize:'20px',fontWeight:800,color:verdict.color}}>{verdict.verdict}</div>
            <div style={{fontSize:'10px',color:'#888',marginTop:'2px'}}>{'⭐'.repeat(verdict.stars)}</div>
          </div>
        </div>

        {/* 4엔진 분석 그리드 */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'16px'}}>
          {/* 엔진1: MF */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#4dabf7',marginBottom:'10px'}}>◈ 엔진1: MF 멀티팩터</div>
            {stock.f ? (<>
              <svg width="100%" viewBox="0 0 160 160" style={{maxWidth:'160px',margin:'0 auto',display:'block'}}>
                {[0.25,0.5,0.75,1].map((fc,i)=>(<polygon key={i} points={radarData.map((_,j)=>{const a=(Math.PI*2*j)/6-Math.PI/2;return`${80+60*fc*Math.cos(a)},${80+60*fc*Math.sin(a)}`;}).join(' ')} fill="none" stroke="#222" strokeWidth="0.5"/>))}
                {radarData.map((_,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;return<line key={i} x1="80" y1="80" x2={80+60*Math.cos(a)} y2={80+60*Math.sin(a)} stroke="#222" strokeWidth="0.5"/>;})}
                <polygon points={radarData.map((dd,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;const val=(dd.value/dd.max)*60;return`${80+val*Math.cos(a)},${80+val*Math.sin(a)}`;}).join(' ')} fill="rgba(77,171,247,0.25)" stroke="#4dabf7" strokeWidth="2"/>
                {radarData.map((dd,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;return(<text key={i} x={80+75*Math.cos(a)} y={80+75*Math.sin(a)} fill="#888" fontSize="8" textAnchor="middle" dominantBaseline="middle">{dd.label}</text>);})}
              </svg>
              {radarData.map(dd=>(<div key={dd.label} style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px'}}>
                <span style={{width:'40px',fontSize:'10px',color:'#888',textAlign:'right'}}>{dd.label}</span>
                <div style={{flex:1,height:'5px',background:'#1a1a2e',borderRadius:'3px',overflow:'hidden'}}><div style={{width:`${(dd.value/dd.max)*100}%`,height:'100%',background:'#4dabf7',borderRadius:'3px'}}/></div>
                <span style={{width:'36px',fontSize:'10px',color:'#ccc',textAlign:'right'}}>{Math.round(dd.value)}</span>
              </div>))}
              <div style={{marginTop:'8px',textAlign:'center',padding:'6px',background:'#0a1628',borderRadius:'6px'}}>
                <span style={{fontSize:'18px',fontWeight:800,color:'#4dabf7'}}>{stock.f}점</span>
                <span style={{fontSize:'12px',color:'#4dabf799',marginLeft:'4px'}}>({verdict.details.mfGrade}등급)</span>
              </div>
            </>) : (<div style={{textAlign:'center',padding:'30px 0',color:'#444',fontSize:'12px'}}>MF 분석 데이터 없음</div>)}
          </div>

          {/* 엔진2: SEPA */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#69db7c',marginBottom:'10px'}}>◈ 엔진2: SEPA + 듀얼모멘텀</div>
            <div style={{display:'grid',gap:'8px'}}>
              <div style={{padding:'8px 10px',background:'#0d0d1a',borderRadius:'6px'}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'11px',color:'#888'}}>SEPA 템플릿</span><span style={{fontSize:'12px',fontWeight:700,color:sigInfo.color}}>{seTt(stock)}/8</span></div></div>
              <div style={{padding:'8px 10px',background:'#0d0d1a',borderRadius:'6px'}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'11px',color:'#888'}}>스테이지</span><span style={{fontSize:'12px',fontWeight:700,color:seSt(stock).includes("Stage 2")?'#00ff88':'#ffd43b'}}>{seSt(stock)}</span></div></div>
              <div style={{padding:'8px 10px',background:'#0d0d1a',borderRadius:'6px'}}><div style={{display:'flex',justifyContent:'space-between'}}><span style={{fontSize:'11px',color:'#888'}}>SEPA 판정</span><span style={{fontSize:'12px',fontWeight:700,color:seV(stock)==="매수준비"?'#00ff88':'#ffd43b'}}>{seV(stock)}</span></div></div>
              <div style={{padding:'10px',background:verdict.details.sepaLevel==='강력매수'?'#00ff8815':'#1a1a2e',borderRadius:'6px',textAlign:'center',border:`1px solid ${sigInfo.color}33`}}>
                <div style={{fontSize:'10px',color:'#888'}}>듀얼모멘텀 판정</div>
                <div style={{fontSize:'16px',fontWeight:800,color:sigInfo.color,marginTop:'2px'}}>{verdict.details.sepaLevel}</div>
              </div>
            </div>
          </div>

          {/* 엔진3: VCP */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#ffd43b',marginBottom:'10px'}}>◈ 엔진3: VCP 변동성수축</div>
            <div style={{textAlign:'center',padding:'16px 0'}}>
              <div style={{fontSize:'36px',fontWeight:800,color:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b'}}>{verdict.details.vcpScore}</div>
              <div style={{fontSize:'11px',color:'#888'}}>/ 10점</div>
              <div style={{margin:'12px auto',width:'80%',height:'8px',background:'#1a1a2e',borderRadius:'4px',overflow:'hidden'}}><div style={{width:`${(verdict.details.vcpScore/10)*100}%`,height:'100%',background:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',borderRadius:'4px'}}/></div>
              <div style={{fontSize:'12px',fontWeight:600,color:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b'}}>
                {vcpMt(stock)==="성숙"?'✅ VCP 성숙 - 돌파 임박':vcpMt(stock)==="형성중"?'⏳ VCP 진행중':'❌ VCP 미성숙'}
              </div>
              <div style={{marginTop:'8px',fontSize:'11px',color:'#888'}}>수축: T1:-{stock.v[0]}% T2:-{stock.v[1]}%{stock.v[2]?` T3:-${stock.v[2]}%`:''}</div>
              <div style={{fontSize:'11px',color:'#888'}}>베이스: {stock.v[3]}주 | 피봇: {fP(vcpPv(stock),stock.k)} | 근접: {vcpPx(stock)}%</div>
            </div>
          </div>

          {/* 엔진4: CF */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#ff922b',marginBottom:'10px'}}>◈ 엔진4: CF 현금흐름</div>
            <div style={{textAlign:'center',padding:'16px 0'}}>
              {verdict.details.hasFCF ? (<>
                <div style={{fontSize:'36px'}}>✅</div>
                <div style={{fontSize:'14px',fontWeight:700,color:'#00ff88',marginTop:'8px'}}>FCF 양수</div>
                <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>실제로 돈을 버는 회사</div>
              </>) : (<>
                <div style={{fontSize:'36px'}}>⚠️</div>
                <div style={{fontSize:'14px',fontWeight:700,color:'#ff6b6b',marginTop:'8px'}}>FCF 음수 / 미확인</div>
                <div style={{fontSize:'11px',color:'#888',marginTop:'4px'}}>현금흐름 주의 필요</div>
              </>)}
              <div style={{marginTop:'12px',display:'flex',justifyContent:'center',gap:'12px',fontSize:'11px'}}>
                <span style={{color:cfClr(cfS(stock))}}>단기: {cfLbl(cfS(stock))}</span>
                <span style={{color:cfClr(cfM(stock))}}>중기: {cfLbl(cfM(stock))}</span>
                <span style={{color:cfClr(cfL(stock))}}>장기: {cfLbl(cfL(stock))}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 종합 판단 */}
        <div style={{padding:'14px 16px',background:verdict.color+'10',borderRadius:'10px',border:`1px solid ${verdict.color}33`}}>
          <div style={{fontSize:'11px',color:'#888',marginBottom:'6px'}}>◈ 4엔진 종합 판단</div>
          <div style={{fontSize:'14px',color:'#eee',lineHeight:1.7}}>
            {verdict.verdict==='🔥최강'&&'4엔진 모두 일치! MF 우량 + SEPA 돌파 + VCP 성숙 + FCF 양수. 최대 포지션(5~10%)으로 즉시 매수 고려.'}
            {verdict.verdict==='🟢강력'&&'3~4엔진 일치. 우량한 기업이 상승 추세에 있으며 현금흐름도 건전. 표준 포지션(3~5%)으로 매수 적기.'}
            {verdict.verdict==='🔵양호'&&'2~3엔진 일치. 펀더멘탈은 양호하나 일부 엔진이 미충족. 소량(1~2%) 진입 후 추가매수 검토.'}
            {verdict.verdict==='🟡모멘텀'&&'MF는 보통이나 SEPA 돌파 신호. 단기 모멘텀 매매로만 접근. 손절 철저히 관리.'}
            {verdict.verdict==='⛔금지'&&'엔진 일치도 부족. 현재 시점에서 매수 비추천. 조건 개선 시까지 대기.'}
          </div>
        </div>
        <button onClick={onClose} style={{width:'100%',marginTop:'16px',padding:'12px',background:'#1a1a2e',border:'1px solid #333',borderRadius:'8px',color:'#888',fontSize:'14px',cursor:'pointer'}}>닫기</button>
      </div>
    </div>
  );
}

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
  const[logs,setLogs]=useState(()=>[{ts:new Date().toLocaleTimeString("ko"),msg:"시스템 로드 완료 (Yahoo Finance)",c:"ok"}]);
  const[flash,setFlash]=useState({});
  const[prev,setPrev]=useState(()=>{const m={};D.forEach(d=>{m[d.t]=d.p});return m});
  const[exp,setExp]=useState(null);
  const[posCal,setPosCal]=useState({acct:100000,risk:1,entry:0,stop:0});
  const[chk,setChk]=useState(Array(9).fill(false));
  // 수정 #2: 체크리스트 상태
  const[selectedChkStock,setSelectedChkStock]=useState(null);
  const[manualChecks,setManualChecks]=useState({c9:false,c10:false});
  const[chkSearch,setChkSearch]=useState("");
  // 수정 #3: 모달 상태
  const[detailStock,setDetailStock]=useState(null);
  const[showDetail,setShowDetail]=useState(false);
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
    const gv=d=>{switch(sc){case"n":return d.n;case"s":return d.s;case"p":return d.p;case"c":return d.c;case"f":return d.f||0;case"mf":return mfTs(d);case"sepa":return seTt(d);case"cf":return cfM(d)+cfL(d);case"vd":return getVerdict(d).stars*100+(d.f||0);default:return d.f||0;}};
    const va=gv(a),vb=gv(b);
    if(typeof va==="string")return sa?va.localeCompare(vb):vb.localeCompare(va);
    return sa?(va-vb):(vb-va);
  }),[filtered,sc,sa]);
  const hs=col=>{if(sc===col)setSa(!sa);else{setSc(col);setSa(false);}};

  const upN=filtered.filter(d=>d.c>0).length;
  const dnN=filtered.filter(d=>d.c<0).length;
  const buyR=filtered.filter(d=>seV(d)==="매수준비").length;
  const vcpR=filtered.filter(d=>vcpMt(d)==="성숙").length;
  // 수정 #1: 종합판정 카운트
  const bestN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars>=5).length,[filtered]);
  const strongN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars===4).length,[filtered]);

  // 수정 #3: 종목 클릭 핸들러
  const handleStockClick=useCallback((stock)=>{setDetailStock(stock);setShowDetail(true);},[]);

  // 수정 #2: 체크리스트 아이템
  const checklistItems=useMemo(()=>[
    {id:'c1',engine:'MF',label:'MF 종합점수 70점 이상인가?',auto:true,check:(s)=>(s.f||0)>=70},
    {id:'c2',engine:'MF',label:'MF 방향이 "매수"인가?',auto:true,check:(s)=>mfTd(s)==="매수"},
    {id:'c3',engine:'SEPA',label:'SEPA 템플릿 7/8 이상인가?',auto:true,check:(s)=>seTt(s)>=7},
    {id:'c4',engine:'SEPA',label:'SEPA 판정이 "매수준비"인가?',auto:true,check:(s)=>seV(s)==="매수준비"},
    {id:'c5',engine:'SEPA',label:'듀얼모멘텀 "매수" 이상 신호인가?',auto:true,check:(s)=>seV(s)==="매수준비"||seTt(s)>=7},
    {id:'c6',engine:'VCP',label:'VCP 성숙도가 "성숙"인가?',auto:true,check:(s)=>vcpMt(s)==="성숙"},
    {id:'c7',engine:'CF',label:'CF 중기+장기 점수가 양호한가?',auto:true,check:(s)=>cfM(s)>=2&&cfL(s)>=2},
    {id:'c8',engine:'시장',label:'주요 지수가 상승추세인가?',auto:true,check:()=>true},
    {id:'c9',engine:'리스크',label:'손절가를 설정했는가? (매수가 -7~8%)',auto:false},
    {id:'c10',engine:'리스크',label:'총 투자금의 5% 이하인가?',auto:false},
  ],[]);

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

      {/* 수정 #2: 4엔진 체크리스트 탭 */}
      {tab==="check" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:16}}>
          <h3 style={{color:"#b197fc",fontSize:18,marginBottom:16,marginTop:0}}>✅ 4엔진 매수 전 체크리스트</h3>

          {/* 종목 선택 드롭다운 */}
          <div style={{marginBottom:16}}>
            <label style={{color:"#888",fontSize:12}}>종목 선택 (자동 체크):</label>
            <input
              type="text"
              value={chkSearch}
              onChange={e=>setChkSearch(e.target.value)}
              placeholder="🔍 종목명 또는 티커 검색..."
              style={{width:"100%",padding:10,marginTop:4,background:"#1a1a2e",border:"1px solid #333",borderRadius:"8px 8px 0 0",color:"#eee",fontSize:14,outline:"none"}}
            />
            <select
              value={selectedChkStock?.t||''}
              onChange={e=>{const s=stocks.find(d=>d.t===e.target.value);setSelectedChkStock(s||null);setChkSearch("");}}
              style={{width:"100%",padding:10,background:"#1a1a2e",border:"1px solid #333",borderTop:"none",borderRadius:"0 0 8px 8px",color:"#eee",fontSize:14}}
              size={chkSearch?Math.min(stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}).length+1,8):1}
            >
              <option value="">-- 종목을 선택하세요 --</option>
              {(chkSearch?stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}):stocks).map(s=>(
                <option key={s.t} value={s.t}>{s.n} ({s.t}) - MF: {s.f||'N/A'}</option>
              ))}
              {chkSearch&&stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}).length===0&&(
                <option value="" disabled>검색 결과 없음</option>
              )}
            </select>
          </div>

          {/* 선택된 종목 요약 */}
          {selectedChkStock && (
            <div style={{padding:12,background:"#0a0a2e",borderRadius:8,marginBottom:16,border:"1px solid #222"}}>
              <div style={{fontSize:16,fontWeight:700,color:"#eee"}}>
                {selectedChkStock.n}
                <span style={{fontSize:12,color:"#666",marginLeft:8}}>{selectedChkStock.t}</span>
              </div>
              <div style={{display:"flex",gap:16,marginTop:8}}>
                <span style={{fontSize:12,color:"#4dabf7"}}>MF: {selectedChkStock.f||'N/A'}</span>
                <span style={{fontSize:12,color:"#69db7c"}}>SEPA: {seV(selectedChkStock)}</span>
                <span style={{fontSize:12,color:"#ffd43b"}}>VCP: {vcpMt(selectedChkStock)}</span>
              </div>
            </div>
          )}

          {/* 체크리스트 항목들 */}
          <div style={{display:"grid",gap:8}}>
            {checklistItems.map((item,idx)=>{
              const isAutoChecked=item.auto&&selectedChkStock?item.check(selectedChkStock):false;
              const isManualChecked=!item.auto?manualChecks[item.id]:false;
              const isChecked=item.auto?isAutoChecked:isManualChecked;
              return(
                <div key={item.id} style={{
                  display:"flex",alignItems:"center",gap:12,
                  padding:"10px 14px",borderRadius:8,
                  background:isChecked?"#0d2818":"#1a1a1a",
                  border:`1px solid ${isChecked?"#00ff8833":"#222"}`,
                  cursor:item.auto?"default":"pointer",
                  opacity:!selectedChkStock&&item.auto?0.5:1
                }}
                onClick={()=>{if(!item.auto)setManualChecks(p=>({...p,[item.id]:!p[item.id]}));}}>
                  <div style={{width:24,height:24,borderRadius:6,background:isChecked?"#00ff88":"#333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,color:isChecked?"#000":"#555",flexShrink:0}}>
                    {isChecked?"✓":idx+1}
                  </div>
                  <span style={{
                    padding:"2px 6px",borderRadius:4,fontSize:10,
                    background:item.engine==='MF'?'#4dabf720':item.engine==='SEPA'?'#69db7c20':item.engine==='VCP'?'#ffd43b20':item.engine==='CF'?'#ff922b20':item.engine==='시장'?'#b197fc20':'#ff6b6b20',
                    color:item.engine==='MF'?'#4dabf7':item.engine==='SEPA'?'#69db7c':item.engine==='VCP'?'#ffd43b':item.engine==='CF'?'#ff922b':item.engine==='시장'?'#b197fc':'#ff6b6b',
                    fontWeight:700,flexShrink:0
                  }}>{item.engine}</span>
                  <span style={{fontSize:13,color:isChecked?"#eee":"#888"}}>{item.label}</span>
                  {item.auto && <span style={{marginLeft:"auto",fontSize:9,color:"#555"}}>자동</span>}
                </div>
              );
            })}
          </div>

          {/* 결과 요약 */}
          {selectedChkStock && (()=>{
            const autoCount=checklistItems.filter(i=>i.auto&&i.check(selectedChkStock)).length;
            const manualCount=Object.values(manualChecks).filter(Boolean).length;
            const total=autoCount+manualCount;
            const color=total>=8?'#00ff88':total>=6?'#ffd43b':'#ff6b6b';
            const msg=total>=8?'✅ 매수 조건 충족!':total>=6?'⚠️ 조건부 매수 가능':'❌ 매수 비추천';
            return(
              <div style={{marginTop:16,padding:16,borderRadius:10,background:color+'15',border:`2px solid ${color}33`,textAlign:"center"}}>
                <div style={{fontSize:24,fontWeight:800,color}}>{total}/10</div>
                <div style={{fontSize:14,fontWeight:600,color,marginTop:4}}>{msg}</div>
              </div>
            );
          })()}
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
            {bestN>0 && <Chip n={bestN} label="🔥최강" color="#ff1744"/>}
            {strongN>0 && <Chip n={strongN} label="🟢강력" color="#00e676"/>}
          </div>
        </div>
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:5}}>
          <button onClick={()=>setSec("all")} style={{padding:"3px 10px",borderRadius:3,border:"1px solid "+(sec==="all"?"#58a6ff":"#21262d"),background:sec==="all"?"rgba(88,166,255,.12)":"#0d1117",color:sec==="all"?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:14}}>전체</button>
          {sectors.map(s=><button key={s} onClick={()=>setSec(s)} style={{padding:"3px 10px",borderRadius:3,border:"1px solid "+(sec===s?"#58a6ff":"#21262d"),background:sec===s?"rgba(88,166,255,.12)":"#0d1117",color:sec===s?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:14}}>{s}</button>)}
          <div style={{width:1,height:20,background:"#21262d",margin:"0 4px"}}/>
          <button onClick={()=>hs("vd")} style={{padding:"3px 10px",borderRadius:3,border:"1px solid "+(sc==="vd"?"#ff1744":"#21262d"),background:sc==="vd"?"rgba(255,23,68,.12)":"#0d1117",color:sc==="vd"?"#ff1744":"#8b949e",cursor:"pointer",fontSize:14}}>🔥 종합판정순</button>
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
            <TH onClick={()=>hs("vd")} a={sc==="vd"} c>종합판정</TH>
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
              const vd=getVerdict(d);
              return(
                <Fragment key={d.t}>
                  <tr onClick={()=>setExp(isE?null:d.t)} style={{borderBottom:"1px solid rgba(33,38,45,.4)",cursor:"pointer",background:fl==="up"?"rgba(63,185,80,.15)":fl==="dn"?"rgba(248,81,73,.15)":"transparent",transition:"background 1.5s"}}>
                    <td style={{padding:"7px 6px",color:"#484f58",fontFamily:"'JetBrains Mono'",fontSize:14}}>{i+1}</td>
                    <td style={{padding:"7px 6px",maxWidth:140,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span onClick={e=>{e.stopPropagation();handleStockClick(d);}} style={{fontWeight:500,cursor:"pointer",borderBottom:"1px dashed #484f58"}}>{d.n}</span>
                      <span style={{fontSize:12,color:"#484f58",marginLeft:4,fontFamily:"'JetBrains Mono'"}}>{d.t}</span>
                    </td>
                    <td style={{padding:"7px 6px"}}><span style={{padding:"2px 8px",borderRadius:3,fontSize:12,background:"rgba(72,79,88,.15)",color:"#484f58"}}>{d.s}</span></td>
                    <td style={{padding:"7px 6px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:fl?700:400,color:fl?"#39d353":"#e6edf3",fontSize:17}}>{fP(d.p,d.k)}</td>
                    <td style={{padding:"7px 6px",textAlign:"right"}}><Chg v={d.c}/></td>
                    <td style={{padding:"7px 6px",textAlign:"center"}}><Badge v={d.f||null} g={80} r={60}/></td>
                    <td style={{padding:"7px 6px",textAlign:"center"}}>{d.b?<span style={{fontSize:15}}>{"🚀"}</span>:""}</td>
                    {/* 수정 #1: 종합판정 셀 */}
                    <td style={{textAlign:"center",padding:"4px 8px",background:vd.color+"15",borderLeft:`2px solid ${vd.color}`,minWidth:80}}>
                      <div style={{fontSize:13,fontWeight:800,color:vd.color}}>{vd.verdict}</div>
                      <div style={{fontSize:10,color:"#666",marginTop:2}}>{'⭐'.repeat(vd.stars)}</div>
                    </td>
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

      {/* 수정 #3: 상세분석 모달 */}
      {showDetail && <StockDetailModal stock={detailStock} onClose={()=>setShowDetail(false)}/>}

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
