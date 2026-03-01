import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

import D from "./data";

/* ===== 유틸 ===== */
const fP=(v,k)=>k?`₩${Math.round(v).toLocaleString()}`:`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MKT={spy12m:14.2,spy200:"위",kospi12m:8.5,vix:16.8,nh:"양호",ad:"상승",
  sec:[["XLK",18.5],["XLC",15.2],["XLI",12.3],["XLY",11.4],["XLV",9.8],["XLU",8.7],["XLE",7.2],["XLF",6.1],["XLB",5.5],["XLP",4.3],["XLRE",2.1]]};

/* 데이터 접근자 */
const mfTd=d=>d.m[1];const mfTs=d=>d.m[0];const mfAl=d=>d.m[2];
const seV=d=>d.e[0];const seSt=d=>d.e[1];const seTt=d=>d.e[2];const seRs=d=>d.e[3];
const vcpMt=d=>d.v[6];const vcpPv=d=>d.v[4];const vcpPx=d=>d.v[5];
const fundGr=d=>d.d[4];const cfS=d=>d.x[0];const cfM=d=>d.x[1];const cfL=d=>d.x[2];
const cfLbl=(v)=>v>=3?"강함":v>=2?"보통":"약함";
const cfClr=(v)=>v>=3?"#3fb950":v>=2?"#d29922":"#f85149";

/* ===== 듀얼모멘텀 강화 분석 ===== */
function getDualMomentum(d) {
  const r3m = d.r[0], r6m = d.r[1], secRank = d.r[2];
  const spyBench3 = 4.2, spyBench6 = 8.7;

  /* 절대 모멘텀: 양의 수익률 */
  const absM3 = r3m > 0;
  const absM6 = r6m > 0;
  const absScore = (absM3 ? 1 : 0) + (absM6 ? 1 : 0);

  /* 상대 모멘텀: 시장 대비 초과 수익 */
  const relM3 = r3m > spyBench3;
  const relM6 = r6m > spyBench6;
  const relScore = (relM3 ? 1 : 0) + (relM6 ? 1 : 0);

  /* 섹터 순위 점수 */
  const secScore = secRank <= 5 ? 3 : secRank <= 10 ? 2 : secRank <= 20 ? 1 : 0;

  /* 추세 강도 (-3 ~ +3) */
  const trendStr = (absM3 ? 1 : -1) + (relM3 ? 1 : -1) + (relM6 ? 1 : -1);

  /* SEPA 보완 */
  const sepaOK = seV(d) === "매수준비" || seTt(d) >= 7;
  const sepaWatch = seTt(d) >= 6;
  const stageOK = seSt(d).includes("Stage 2");

  /* 22일/50일 고가 돌파 */
  const near22 = vcpPx(d) <= 5;
  const near50 = vcpPx(d) <= 10;
  const breakout = seV(d) === "매수준비" && near22;

  /* 듀얼 종합 신호 */
  let signal, signalColor, signalScore;
  if (absScore >= 2 && relScore >= 2 && sepaOK && stageOK) {
    signal = "STRONG BUY"; signalColor = "#ff1744"; signalScore = 10;
  } else if (absScore >= 2 && relScore >= 1 && (sepaOK || sepaWatch) && stageOK) {
    signal = "BUY"; signalColor = "#00e676"; signalScore = 8;
  } else if (absScore >= 1 && relScore >= 1 && sepaWatch) {
    signal = "HOLD"; signalColor = "#448aff"; signalScore = 6;
  } else if (absScore >= 1 && relScore === 0) {
    signal = "CAUTION"; signalColor = "#ffd600"; signalScore = 4;
  } else {
    signal = "SELL"; signalColor = "#f85149"; signalScore = 2;
  }

  /* RS 점수 (0~100) */
  const rsScore = Math.min(100, Math.max(0, Math.round(
    (r3m > 0 ? 15 : 0) + (r6m > 0 ? 15 : 0) +
    (relM3 ? 20 : 0) + (relM6 ? 20 : 0) +
    (secRank <= 5 ? 30 : secRank <= 10 ? 20 : secRank <= 20 ? 10 : 0)
  )));

  return {
    absM3, absM6, absScore,
    relM3, relM6, relScore,
    secScore, secRank,
    trendStr, sepaOK, stageOK,
    near22, near50, breakout,
    signal, signalColor, signalScore,
    rsScore, r3m, r6m
  };
}

/* ===== 종합판정 ===== */
function getVerdict(d) {
  const mfScore = d.f || 0;
  const mfGrade = mfScore >= 80 ? 'A' : mfScore >= 70 ? 'B' : mfScore >= 60 ? 'C' : 'F';
  const sv = seV(d), st = seTt(d);
  const sepaLevel = sv === "매수준비" ? '강력매수' : st >= 7 ? '매수' : st >= 6 ? '관심' : st >= 5 ? '대기' : '회피';
  const vm = vcpMt(d);
  const vcpScore = vm === "성숙" ? 8 : vm === "형성중" ? 5 : 2;
  const hasFCF = d.b || (cfM(d) >= 2 && cfL(d) >= 2);
  const dm = getDualMomentum(d);

  /* === 100점 만점 점수제 === */
  /* SEPA (35점) - 실시간 핵심 */
  const sepaPt = st >= 8 ? 35 : st >= 7 ? 30 : st >= 6 ? 22 : st >= 5 ? 15 : 5;
  /* 듀얼모멘텀 (25점) - 실시간 */
  const dmPt = dm.signalScore >= 10 ? 25 : dm.signalScore >= 8 ? 20 : dm.signalScore >= 6 ? 12 : 3;
  /* VCP (20점) - 실시간 + 거래량수축 보너스 */
  const vcpPt = vm === "성숙🔥" ? 20 : vm === "성숙" ? 18 : vm === "형성중" ? 12 : 3;
  /* MF 펀더멘탈 (12점) - 고정값 보너스 */
  const mfPt = mfScore >= 80 ? 12 : mfScore >= 70 ? 8 : mfScore >= 60 ? 5 : 2;
  /* CF 현금흐름 (8점) - 고정값 보너스 */
  const cfPt = hasFCF ? 8 : 2;
  /* 거래량 시그널 (+5~-5점, 가격맥락 반영) */
  const volData = d._volData;
  let volPt = 0;
  if (volData) {
    if (volData.signalType === 'buy') volPt = volData.surgeDay ? 5 : 3;
    else if (volData.signalType === 'sell') volPt = volData.surgeDay ? -5 : -3;
    else if (volData.signalType === 'caution') volPt = -1;
    else if (volData.volDryup && (vm==="성숙🔥"||vm==="성숙")) volPt = 3;
  }

  const totalPt = Math.max(0, Math.min(sepaPt + dmPt + vcpPt + mfPt + cfPt + volPt, 100));

  let verdict, color, stars;
  if (totalPt >= 80) { verdict = '\u{1F525}최강'; color = '#ff1744'; stars = 5; }
  else if (totalPt >= 65) { verdict = '\u{1F7E2}매수'; color = '#00e676'; stars = 4; }
  else if (totalPt >= 50) { verdict = '\u{1F535}관심'; color = '#448aff'; stars = 3; }
  else if (totalPt >= 35) { verdict = '\u{1F7E1}관망'; color = '#ffd600'; stars = 2; }
  else { verdict = '\u26D4위험'; color = '#78909c'; stars = 1; }

  return { verdict, color, stars, totalPt, details: { mfGrade, mfScore, sepaLevel, vcpScore, hasFCF, dm, sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt } };
}

/* ===== AI 분석 텍스트 생성 ===== */
function genAnalysis(d) {
  const v = getVerdict(d);
  const dm = v.details.dm;
  const mf = d.f || 0;
  const lines = [];

  /* 종합 점수 */
  lines.push(`종합 ${v.totalPt}점 — SEPA:${v.details.sepaPt} DM:${v.details.dmPt} VCP:${v.details.vcpPt} MF:${v.details.mfPt} CF:${v.details.cfPt}${v.details.volPt?(' VOL:'+(v.details.volPt>0?'+':'')+v.details.volPt):''}`);

  // 듀얼모멘텀
  if (dm.signalScore >= 8) lines.push(`듀얼모멘텀 ${dm.signal}: 절대+상대 모멘텀 모두 양호. 시장 대비 아웃퍼폼 중.`);
  else if (dm.signalScore >= 6) lines.push(`듀얼모멘텀 HOLD: 추세 유지 중이나 시장 대비 초과수익 제한적.`);
  else lines.push(`듀얼모멘텀 SELL: 하락추세 또는 시장 대비 언더퍼폼. 리스크 관리 필수.`);

  // SEPA
  const sv = seV(d);
  if (sv === "매수준비") lines.push(`SEPA 매수준비! 미너비니 8조건 충족. Stage 2 브레이크아웃 임박.`);
  else if (seTt(d) >= 7) lines.push(`SEPA ${seTt(d)}/8 — 대부분 조건 충족. 돌파 시 진입 고려.`);
  else if (seTt(d) >= 5) lines.push(`SEPA ${seTt(d)}/8 — 일부 조건 미달. 추세 개선 대기.`);
  else lines.push(`SEPA ${seTt(d)}/8 — 조건 부족. 추세 전환 전까지 관망.`);

  // VCP
  const vm = vcpMt(d);
  if (vm === "성숙🔥") lines.push(`VCP 성숙+거래량수축🔥 변동성+거래량 동시 수축. 피봇 돌파 시 강력한 상승 예상!`);
  else if (vm === "성숙") lines.push(`VCP 성숙 단계. 변동성 수축 완료, 피봇 돌파 시 강한 상승 예상.`);
  else if (vm === "형성중") lines.push(`VCP 형성 중. 추가 수축 확인 후 진입 검토.`);

  // 거래량 분석
  const vol = d._volData;
  if (vol) {
    if (vol.signalType === 'buy') {
      if (vol.signal.includes('바닥매집')) lines.push(`📊 바닥권 거래량 급증! 기관 매집 시작 가능성. 52주 위치 ${vol.positionPct}%, 5일 가격 +${vol.priceChg5d}%.`);
      else if (vol.signal.includes('돌파상승')) lines.push(`📊 돌파 거래량 급증! 50일 평균의 ${vol.volRatio}배. 건강한 상승 돌파 확인.`);
      else lines.push(`📊 매집 증가 추세. 가격 상승과 함께 거래량 동반 증가. 긍정 신호.`);
    } else if (vol.signalType === 'sell') {
      if (vol.signal.includes('고점이탈')) lines.push(`⚠️ 고점권 거래량 급증 + 하락! 기관 물량 출회 가능성. 52주 위치 ${vol.positionPct}%. 매도 검토.`);
      else if (vol.signal.includes('매도압력')) lines.push(`⚠️ 하락 중 거래량 급증! 추가 하락 가능성. 리스크 관리 필수.`);
      else lines.push(`⚠️ 분산(매도) 거래량 증가. 하락과 함께 거래량 동반 증가. 주의 필요.`);
    } else if (vol.signalType === 'caution') {
      if (vol.signal.includes('과열')) lines.push(`🟡 고점권 거래량 급증 + 상승! 클라이맥스 탑(과열 천장) 가능성. 추격 매수 주의.`);
      else if (vol.signal.includes('투매')) lines.push(`🟡 바닥권 투매 거래량. 패닉셀 가능성이나 반등 기회일 수도. 관찰 필요.`);
      else if (vol.signal.includes('추세약화')) lines.push(`🟡 상승 중 거래량 감소! 상승 동력 소진 가능성. 추세 약화 주의.`);
      else lines.push(`🟡 거래량 시그널 관찰 필요.`);
    } else if (vol.volDryup) {
      lines.push(`📊 거래량 수축 중 (Dry-up). 가격+거래량 동시 수축은 돌파 전 전형적 패턴.`);
    }
  }

  // 결론
  if (v.stars >= 5) lines.push(`🔥 최강 매수 추천. ${d.q[5]||3}% 비중, 진입가 ${fP(d.q[0]||d.p, d.k)} 부근. 손절 ${fP(d.q[1]||(d.p*0.93), d.k)}`);
  else if (v.stars >= 4) lines.push(`💡 매수 추천. 소량 진입 후 돌파 확인 시 추가매수.`);
  else if (v.stars >= 3) lines.push(`👀 관심 종목. 워치리스트 등록 후 조건 개선 시 재검토.`);
  else if (v.stars >= 2) lines.push(`⏸ 관망. 추세 전환 신호 대기.`);
  else lines.push(`⚠️ 매수 비추천. 하락 리스크 주의.`);

  return lines;
}

/* ===== TradingView 차트 컴포넌트 ===== */
function TVChart({ symbol, isKR, ticker }) {
  const [krView, setKrView] = useState('day');

  if (isKR) {
    /* 한국 주식: 네이버 증권 차트 이미지 (CORS 문제 없음) */
    const naverUrl = `https://finance.naver.com/item/fchart.naver?code=${ticker}`;
    const chartDay = `https://ssl.pstatic.net/imgfinance/chart/item/candle/day/${ticker}.png`;
    const chartMonth3 = `https://ssl.pstatic.net/imgfinance/chart/item/area/month3/${ticker}.png`;
    const chartYear = `https://ssl.pstatic.net/imgfinance/chart/item/area/year/${ticker}.png`;
    const chartSrc = krView === 'day' ? chartDay : krView === '3m' ? chartMonth3 : chartYear;
    return (
      <div style={{borderRadius:'10px',overflow:'hidden',border:'1px solid #1a1a2e',background:'#0d0d1a'}}>
        <div style={{padding:'6px 12px',display:'flex',gap:4,alignItems:'center',background:'#080818',borderBottom:'1px solid #1a1a2e'}}>
          <span style={{fontSize:11,color:'#484f58',marginRight:4}}>기간:</span>
          {[['day','일봉'],['3m','3개월'],['1y','1년']].map(([k,l])=>(
            <button key={k} onClick={()=>setKrView(k)} style={{padding:'2px 10px',borderRadius:4,fontSize:11,fontWeight:600,cursor:'pointer',border:'1px solid '+(krView===k?'#ff922b':'#21262d'),background:krView===k?'#ff922b15':'transparent',color:krView===k?'#ff922b':'#8b949e'}}>{l}</button>
          ))}
          <a href={naverUrl} target="_blank" rel="noopener noreferrer" style={{marginLeft:'auto',fontSize:10,color:'#484f58',textDecoration:'none'}}>네이버 증권에서 열기 ↗</a>
        </div>
        <div className="chart-wrap" style={{height:'300px',display:'flex',alignItems:'center',justifyContent:'center',background:'#0d0d1a',padding:'8px'}}>
          <img
            key={chartSrc}
            src={chartSrc + '?t=' + Date.now()}
            alt={ticker + ' chart'}
            style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain',borderRadius:'6px'}}
            onError={(e)=>{e.target.style.display='none';e.target.parentElement.innerHTML='<div style="text-align:center;color:#484f58;font-size:13px"><div style="font-size:24px;margin-bottom:8px">📊</div>차트를 불러올 수 없습니다<br/><a href="'+naverUrl+'" target="_blank" style="color:#58a6ff;font-size:12px">네이버 증권에서 확인 →</a></div>';}}
          />
        </div>
      </div>
    );
  }

  /* 미국 주식: TradingView iframe */
  const tvUrl = `https://www.tradingview.com/chart/?symbol=${symbol}`;
  const embedUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tv_${Date.now()}&symbol=${symbol}&interval=D&hidesidetoolbar=1&symboledit=0&saveimage=0&toolbarbg=0d0d1a&theme=dark&style=1&timezone=Asia%2FSeoul&withdateranges=1&showpopupbutton=0&locale=kr`;

  return (
    <div style={{borderRadius:'10px',overflow:'hidden',border:'1px solid #1a1a2e',background:'#0d0d1a'}}>
      <iframe
        key={symbol}
        src={embedUrl}
        className="chart-wrap"
        style={{width:'100%',height:'340px',border:'none',display:'block'}}
        title={symbol}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
      <div style={{padding:'4px 12px',display:'flex',justifyContent:'flex-end',background:'#080818'}}>
        <a href={tvUrl} target="_blank" rel="noopener noreferrer"
          style={{color:'#484f58',fontSize:10,textDecoration:'none'}}>
          TradingView에서 열기 ↗
        </a>
      </div>
    </div>
  );
}

/* ===== 상세분석 모달 ===== */
function StockDetailModal({ stock, onClose, isWatched, onToggleWatch }) {
  if (!stock) return null;
  const verdict = getVerdict(stock);
  const dm = getDualMomentum(stock);
  const analysis = genAnalysis(stock);
  const radarData = [
    { label: 'MF', value: Math.min(stock.f || 0, 100), max: 100 },
    { label: 'SEPA', value: seTt(stock) * 12.5, max: 100 },
    { label: 'VCP', value: vcpMt(stock) === "성숙" ? 80 : vcpMt(stock) === "형성중" ? 50 : 20, max: 100 },
    { label: 'RS', value: dm.rsScore, max: 100 },
    { label: 'CF', value: (cfM(stock)+cfL(stock))*16.6, max: 100 },
    { label: 'DM', value: dm.signalScore * 10, max: 100 },
  ];
  const sigInfo = seV(stock) === "매수준비"
    ? { text: '🚀 매수준비!', color: '#00ff88' }
    : seTt(stock) >= 7 ? { text: seTt(stock)+'/8', color: '#4dabf7' }
    : seTt(stock) >= 5 ? { text: seTt(stock)+'/8', color: '#ffd43b' }
    : { text: seTt(stock)+'/8', color: '#ff6b6b' };

  const NYSE_STOCKS = new Set(['NOC','RTX','LMT','GD','PH','CAT','URI','GE','WM','DE','ROK','JNJ','PFE','BMY','ABBV','MRK','BSX','SYK','ABT','EW','JPM','AXP','KKR','V','MA','WMT','DLR','EQIX','IRM','XOM','OXY','NEE','LLY','AMGN','VRTX','BKNG','CMG','GEV','VRT','VST','CEG','CCJ','BWXT','PWR','GLW','NVO','HALO','ETN','EME','MOD','TT','EQT','TDG','SHOP','SPOT','LIN','CRH','PLD','WMB','HWM','HUBS','APD','AMT','VTR','SO','BA','SQ','EMR','DIS','DOC']);
  const tradingViewSymbol = stock.k
    ? `KRX:${stock.t}`
    : NYSE_STOCKS.has(stock.t) ? `NYSE:${stock.t}` : `NASDAQ:${stock.t}`;

  return (
    <div className="modal-overlay" style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.9)',zIndex:9999,display:'flex',justifyContent:'center',alignItems:'flex-start',padding:'20px',overflowY:'auto'}} onClick={onClose}>
      <div className="modal-inner" style={{background:'#0d0d1a',borderRadius:'16px',maxWidth:'900px',width:'100%',border:'1px solid #333',padding:'0'}} onClick={e=>e.stopPropagation()}>

        {/* 헤더 */}
        <div className="modal-header" style={{padding:'16px 20px',borderBottom:'1px solid #1a1a2e',display:'flex',justifyContent:'space-between',alignItems:'flex-start',gap:'12px'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'4px',flexWrap:'wrap'}}>
              <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,background:stock.k?'#ff922b20':'#4dabf720',color:stock.k?'#ff922b':'#4dabf7',fontWeight:700}}>{stock.k?'🇰🇷 KR':'🇺🇸 US'}</span>
              <span style={{padding:'2px 8px',borderRadius:4,fontSize:11,background:'#1a1a2e',color:'#666'}}>{stock.s}</span>
            </div>
            <h2 style={{fontSize:'20px',fontWeight:900,color:'#eee',margin:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{stock.n}<span style={{fontSize:'13px',color:'#555',marginLeft:'6px',fontFamily:"'JetBrains Mono'"}}>{stock.t}</span></h2>
            <div style={{fontSize:'18px',fontWeight:700,color:'#fff',marginTop:'4px',fontFamily:"'JetBrains Mono'"}}>
              {fP(stock.p,stock.k)}
              <span style={{fontSize:'13px',color:stock.c>=0?'#3fb950':'#f85149',marginLeft:'8px'}}>{stock.c>=0?'▲':'▼'}{Math.abs(stock.c).toFixed(2)}%</span>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',flexShrink:0}}>
            <div style={{padding:'8px 14px',borderRadius:'10px',background:verdict.color+'20',border:`2px solid ${verdict.color}`,textAlign:'center'}}>
              <div style={{fontSize:'16px',fontWeight:900,color:verdict.color,whiteSpace:'nowrap'}}>{verdict.verdict}</div>
              <div style={{fontSize:'9px',color:'#666'}}>{'⭐'.repeat(verdict.stars)}</div>
            </div>
            <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
              <span style={{padding:'3px 8px',borderRadius:'5px',background:dm.signalColor+'20',border:`1px solid ${dm.signalColor}44`,fontSize:'10px',fontWeight:700,color:dm.signalColor,whiteSpace:'nowrap'}}>{dm.signal}</span>
              <button onClick={()=>onToggleWatch(stock.t)} style={{padding:'3px 8px',borderRadius:'5px',border:'1px solid '+(isWatched?'#ffd43b':'#21262d'),background:isWatched?'#ffd43b18':'#161b22',color:isWatched?'#ffd43b':'#8b949e',cursor:'pointer',fontSize:'10px',fontWeight:700,whiteSpace:'nowrap'}}>
                {isWatched?'⭐':'☆ 추가'}
              </button>
            </div>
          </div>
        </div>

        {/* TradingView 차트 */}
        <div style={{padding:'0 24px',margin:'16px 0'}}>
          <TVChart key={tradingViewSymbol} symbol={tradingViewSymbol} isKR={stock.k} ticker={stock.t}/>
        </div>

        <div className="modal-body" style={{padding:'0 24px 24px'}}>
          {/* 4엔진 분석 그리드 */}
          <div className="engine-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'16px'}}>

            {/* 엔진1: MF 레이더 */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#4dabf7',marginBottom:'10px'}}>◈ 엔진1: MF 멀티팩터</div>
              {stock.f ? (<>
                <svg width="100%" viewBox="0 0 160 160" style={{maxWidth:'140px',margin:'0 auto',display:'block'}}>
                  {[0.25,0.5,0.75,1].map((fc,i)=>(<polygon key={i} points={radarData.map((_,j)=>{const a=(Math.PI*2*j)/6-Math.PI/2;return`${80+55*fc*Math.cos(a)},${80+55*fc*Math.sin(a)}`;}).join(' ')} fill="none" stroke="#222" strokeWidth="0.5"/>))}
                  {radarData.map((_,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;return<line key={i} x1="80" y1="80" x2={80+55*Math.cos(a)} y2={80+55*Math.sin(a)} stroke="#222" strokeWidth="0.5"/>;})}
                  <polygon points={radarData.map((dd,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;const val=(dd.value/dd.max)*55;return`${80+val*Math.cos(a)},${80+val*Math.sin(a)}`;}).join(' ')} fill="rgba(77,171,247,0.2)" stroke="#4dabf7" strokeWidth="2"/>
                  {radarData.map((dd,i)=>{const a=(Math.PI*2*i)/6-Math.PI/2;return(<text key={i} x={80+70*Math.cos(a)} y={80+70*Math.sin(a)} fill="#888" fontSize="8" textAnchor="middle" dominantBaseline="middle">{dd.label}</text>);})}
                </svg>
                <div style={{marginTop:'6px',textAlign:'center',padding:'6px',background:'#0a1628',borderRadius:'6px'}}>
                  <span style={{fontSize:'20px',fontWeight:900,color:'#4dabf7'}}>{stock.f}점</span>
                  <span style={{fontSize:'12px',color:'#4dabf799',marginLeft:'6px'}}>({verdict.details.mfGrade}등급)</span>
                </div>
              </>) : (<div style={{textAlign:'center',padding:'30px 0',color:'#444',fontSize:'12px'}}>데이터 없음</div>)}
            </div>

            {/* 엔진2: SEPA + 듀얼모멘텀 */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#69db7c',marginBottom:'10px'}}>◈ 엔진2: SEPA + 듀얼모멘텀</div>
              <div style={{display:'grid',gap:'6px'}}>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>SEPA 템플릿</span>
                    <span style={{fontSize:'13px',fontWeight:700,color:sigInfo.color}}>{sigInfo.text}</span>
                  </div>
                </div>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>절대모멘텀</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:dm.absScore>=2?'#3fb950':'#f85149'}}>
                      3M:{dm.absM3?'✅':'❌'} 6M:{dm.absM6?'✅':'❌'}
                    </span>
                  </div>
                </div>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>상대모멘텀</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:dm.relScore>=2?'#3fb950':dm.relScore>=1?'#d29922':'#f85149'}}>
                      3M:{dm.relM3?'✅':'❌'} 6M:{dm.relM6?'✅':'❌'}
                    </span>
                  </div>
                </div>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>추세강도</span>
                    <span style={{fontSize:'13px',fontWeight:700,color:dm.trendStr>0?'#3fb950':dm.trendStr===0?'#d29922':'#f85149'}}>
                      {dm.trendStr>0?'+':''}{dm.trendStr} / 3
                    </span>
                  </div>
                </div>
                <div style={{padding:'8px 10px',background:dm.signalColor+'10',borderRadius:'6px',textAlign:'center',border:`1px solid ${dm.signalColor}33`}}>
                  <div style={{fontSize:'9px',color:'#888'}}>듀얼모멘텀 종합</div>
                  <div style={{fontSize:'16px',fontWeight:900,color:dm.signalColor,marginTop:'2px'}}>{dm.signal}</div>
                  <div style={{fontSize:'10px',color:'#666',marginTop:'2px'}}>RS: {dm.rsScore}/100 | 섹터 {dm.secRank}위</div>
                </div>
              </div>
            </div>

            {/* 엔진3: VCP */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#ffd43b',marginBottom:'10px'}}>◈ 엔진3: VCP 변동성수축</div>
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontSize:'32px',fontWeight:900,color:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b'}}>
                  {vcpMt(stock)==="성숙"?'✅':vcpMt(stock)==="형성중"?'⏳':'❌'}
                </div>
                <div style={{fontSize:'14px',fontWeight:700,color:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',marginTop:'4px'}}>
                  {vcpMt(stock)} ({verdict.details.vcpScore}/10)
                </div>
                <div style={{margin:'8px auto',width:'80%',height:'6px',background:'#1a1a2e',borderRadius:'3px',overflow:'hidden'}}>
                  <div style={{width:`${(verdict.details.vcpScore/10)*100}%`,height:'100%',background:vcpMt(stock)==="성숙"?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',borderRadius:'3px'}}/>
                </div>
                <div style={{marginTop:'6px',fontSize:'11px',color:'#888'}}>수축: T1:-{stock.v[0]}% T2:-{stock.v[1]}%{stock.v[2]?` T3:-${stock.v[2]}%`:''}</div>
                <div style={{fontSize:'11px',color:'#888'}}>베이스: {stock.v[3]}주 | 피봇: {fP(vcpPv(stock),stock.k)} | 근접: {vcpPx(stock)}%</div>
              </div>
            </div>

            {/* 엔진4: CF */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#ff922b',marginBottom:'10px'}}>◈ 엔진4: CF 현금흐름</div>
              <div style={{textAlign:'center',padding:'10px 0'}}>
                {verdict.details.hasFCF ? (<>
                  <div style={{fontSize:'32px'}}>✅</div>
                  <div style={{fontSize:'14px',fontWeight:700,color:'#00ff88',marginTop:'4px'}}>FCF 양수</div>
                </>) : (<>
                  <div style={{fontSize:'32px'}}>⚠️</div>
                  <div style={{fontSize:'14px',fontWeight:700,color:'#ff6b6b',marginTop:'4px'}}>FCF 음수 / 미확인</div>
                </>)}
                <div style={{marginTop:'10px',display:'flex',justifyContent:'center',gap:'16px',fontSize:'12px'}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:'10px',color:'#666'}}>단기</div>
                    <div style={{fontWeight:700,color:cfClr(cfS(stock))}}>{cfLbl(cfS(stock))}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:'10px',color:'#666'}}>중기</div>
                    <div style={{fontWeight:700,color:cfClr(cfM(stock))}}>{cfLbl(cfM(stock))}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:'10px',color:'#666'}}>장기</div>
                    <div style={{fontWeight:700,color:cfClr(cfL(stock))}}>{cfLbl(cfL(stock))}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RS 상대강도 바 */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#bc8cff',marginBottom:'10px'}}>◈ RS 상대강도 분석</div>
            <div className="rs-grid" style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr 1fr',gap:'8px'}}>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>3M 수익률</div>
                <div style={{fontSize:'16px',fontWeight:800,color:dm.r3m>0?'#3fb950':'#f85149',fontFamily:"'JetBrains Mono'"}}>{dm.r3m>0?'+':''}{dm.r3m}%</div>
                <div style={{fontSize:'9px',color:'#484f58'}}>SPY: +4.2%</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>6M 수익률</div>
                <div style={{fontSize:'16px',fontWeight:800,color:dm.r6m>0?'#3fb950':'#f85149',fontFamily:"'JetBrains Mono'"}}>{dm.r6m>0?'+':''}{dm.r6m}%</div>
                <div style={{fontSize:'9px',color:'#484f58'}}>SPY: +8.7%</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>RS 점수</div>
                <div style={{fontSize:'16px',fontWeight:800,color:dm.rsScore>=70?'#3fb950':dm.rsScore>=40?'#d29922':'#f85149',fontFamily:"'JetBrains Mono'"}}>{dm.rsScore}</div>
                <div style={{fontSize:'9px',color:'#484f58'}}>/ 100</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>섹터순위</div>
                <div style={{fontSize:'16px',fontWeight:800,color:dm.secRank<=10?'#3fb950':'#8b949e',fontFamily:"'JetBrains Mono'"}}>{dm.secRank}위</div>
                <div style={{fontSize:'9px',color:'#484f58'}}>/ 40</div>
              </div>
            </div>
          </div>

          {/* 거래량 분석 */}
          {stock._volData && (()=>{
            const vl=stock._volData;
            const st=vl.signalType;
            const sigClr=st==='buy'?'#3fb950':st==='sell'?'#ff1744':st==='caution'?'#ffd43b':'#8b949e';
            const sigBg=st==='buy'?'#3fb95015':st==='sell'?'#ff174415':st==='caution'?'#ffd43b15':'#0d0d1a';
            return <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#ffa94d',marginBottom:'10px'}}>◈ 거래량 분석</div>
            {/* 시그널 배너 */}
            <div style={{background:sigBg,border:`1px solid ${sigClr}44`,borderRadius:'8px',padding:'10px',marginBottom:'10px',textAlign:'center'}}>
              <div style={{fontSize:'16px',fontWeight:800,color:sigClr}}>{vl.signal}</div>
              <div style={{fontSize:'10px',color:'#888',marginTop:'2px'}}>
                5일 가격변화: <span style={{color:vl.priceChg5d>0?'#3fb950':'#f85149'}}>{vl.priceChg5d>0?'+':''}{vl.priceChg5d}%</span>
                {' | '}52주 위치: <span style={{color:'#e6edf3'}}>{vl.positionPct}%</span>
              </div>
            </div>
            <div className="vol-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px'}}>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>50일 평균</div>
                <div style={{fontSize:'14px',fontWeight:700,color:'#e6edf3',fontFamily:"'JetBrains Mono'"}}>{(vl.avgVol50/1000).toFixed(0)}K</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>최근 5일</div>
                <div style={{fontSize:'14px',fontWeight:700,color:'#e6edf3',fontFamily:"'JetBrains Mono'"}}>{(vl.avgVol5/1000).toFixed(0)}K</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>비율</div>
                <div style={{fontSize:'14px',fontWeight:700,color:vl.volRatio>=1.5?'#ff6b6b':vl.volRatio>=0.8?'#e6edf3':'#4dabf7',fontFamily:"'JetBrains Mono'"}}>{vl.volRatio}x</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>Dry-up</div>
                <div style={{fontSize:'14px',fontWeight:700,color:vl.volDryup?'#4dabf7':'#484f58'}}>{vl.volDryup?'💧Yes':'No'}</div>
              </div>
            </div>
          </div>;
          })()}

          {/* 진입전략 */}
          {(stock.q[0] > 0) && <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#58a6ff',marginBottom:'10px'}}>◈ 진입 전략</div>
            <div className="strategy-grid" style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px'}}>
              {[['진입가',fP(stock.q[0],stock.k),'#58a6ff'],['손절(-7%)',fP(stock.q[1],stock.k),'#f85149'],['1차목표(+15%)',fP(stock.q[2],stock.k),'#3fb950'],['2차목표(+30%)',fP(stock.q[3],stock.k),'#3fb950'],['손익비',stock.q[4]+':1','#bc8cff'],['추천비중',stock.q[5]+'%','#ff922b']].map(([l,v,c])=>(
                <div key={l} style={{textAlign:'center',padding:'6px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{fontSize:'10px',color:'#666'}}>{l}</div>
                  <div style={{fontSize:'14px',fontWeight:700,color:c,fontFamily:"'JetBrains Mono'"}}>{v}</div>
                </div>
              ))}
            </div>
          </div>}

          {/* AI 분석 */}
          <div style={{background:'linear-gradient(135deg,#0a0a2e,#0d1830)',borderRadius:'10px',padding:'16px',border:'1px solid #1a2a4a'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#f778ba',marginBottom:'10px'}}>🤖 AI 종합 분석</div>
            {analysis.map((line,i)=>(
              <div key={i} style={{fontSize:'13px',color:'#ccc',lineHeight:1.8,padding:'4px 0',borderBottom:i<analysis.length-1?'1px solid #1a1a2e':'none'}}>
                {line}
              </div>
            ))}
          </div>
        </div>

        <button onClick={onClose} style={{width:'100%',padding:'14px',background:'#1a1a2e',border:'none',borderTop:'1px solid #222',borderRadius:'0 0 16px 16px',color:'#888',fontSize:'14px',cursor:'pointer',fontWeight:600}}>닫기 (ESC)</button>
      </div>
    </div>
  );
}

/* ===== 메인 대시보드 ===== */
export default function Dashboard(){
  const[isMobile,setIsMobile]=useState(false);
  useEffect(()=>{
    const check=()=>setIsMobile(window.innerWidth<768);
    check();window.addEventListener('resize',check);return()=>window.removeEventListener('resize',check);
  },[]);
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
  const[selectedChkStock,setSelectedChkStock]=useState(null);
  const[manualChecks,setManualChecks]=useState({c9:false,c10:false});
  const[chkSearch,setChkSearch]=useState("");
  const[detailStock,setDetailStock]=useState(null);
  const[showDetail,setShowDetail]=useState(false);
  /* 워치리스트 (localStorage) */
  const[watchlist,setWatchlist]=useState(()=>{
    try{const s=localStorage.getItem('watchlist');return s?JSON.parse(s):[];}catch(e){return[];}
  });
  /* 보유종목 (localStorage) */
  const[portfolio,setPortfolio]=useState(()=>{
    try{const s=localStorage.getItem('portfolio');return s?JSON.parse(s):[];}catch(e){return[];}
  });
  /* 보유종목 입력폼 */
  const[pfForm,setPfForm]=useState({ticker:'',buyPrice:0,qty:0,stopLoss:0});
  /* 보유종목 검색 */
  const[pfSearch,setPfSearch]=useState('');
  /* 듀얼모멘텀 필터 */
  const[dmFilter,setDmFilter]=useState("all");
  /* 분석 갱신 상태 */
  const[anaRt,setAnaRt]=useState("idle");
  const[anaProg,setAnaProg]=useState(0);
  const[anaTime,setAnaTime]=useState(()=>{
    try{const s=localStorage.getItem('ana_time');return s||'-';}catch(e){return'-';}
  });
  const autoRef=useRef(null);
  const busy=useRef(false);
  const anaBusy=useRef(false);

  /* localStorage에서 마지막 분석 결과 로드 */
  useEffect(()=>{
    try{
      const cached=localStorage.getItem('ana_data');
      if(cached){
        const parsed=JSON.parse(cached);
        setStocks(prev=>prev.map(d=>{
          const a=parsed[d.t];
          if(!a)return d;
          return {...d,
            e:a.e||d.e,
            r:[a.r?a.r[0]:d.r[0], a.r?a.r[1]:d.r[1], d.r[2]],
            v:a.v||d.v,
            _volData:a.volData||null
          };
        }));
        log("📂 마지막 분석 결과 로드 ("+anaTime+")","ok");
      }
    }catch(e){}
  },[]);

  const log=useCallback((msg,c="if")=>{
    setLogs(p=>[{ts:new Date().toLocaleTimeString("ko"),msg,c},...p].slice(0,80));
  },[]);

  /* watchlist localStorage 동기화 */
  useEffect(()=>{try{localStorage.setItem('watchlist',JSON.stringify(watchlist));}catch(e){}},[watchlist]);
  useEffect(()=>{try{localStorage.setItem('portfolio',JSON.stringify(portfolio));}catch(e){}},[portfolio]);

  const toggleWatch=useCallback((ticker)=>{
    setWatchlist(p=>p.includes(ticker)?p.filter(t=>t!==ticker):[...p,ticker]);
  },[]);
  const addPortfolio=useCallback((ticker,buyPrice,qty,stopLoss)=>{
    if(!ticker||!buyPrice||!qty)return;
    const bp=Number(buyPrice);
    setPortfolio(p=>{
      const exists=p.findIndex(x=>x.ticker===ticker&&x.buyPrice===bp);
      if(exists>=0)return p;
      return[...p,{ticker,buyPrice:bp,qty:Number(qty),stopLoss:Number(stopLoss)||0,highPrice:bp,addedAt:new Date().toISOString()}];
    });
  },[]);
  /* 최고가 실시간 업데이트 (가격 갱신 시마다) */
  useEffect(()=>{
    setPortfolio(prev=>{
      let changed=false;
      const next=prev.map(p=>{
        const s=stocks.find(d=>d.t===p.ticker);
        if(s&&s.p&&s.p>(p.highPrice||p.buyPrice)){
          changed=true;
          return {...p,highPrice:s.p};
        }
        return p.highPrice?p:{...p,highPrice:p.buyPrice};
      });
      return changed?next:prev;
    });
  },[stocks]);
  /* 손절 계산 헬퍼 */
  const calcStops=useCallback((p,curPrice)=>{
    const entryStop=Math.round(p.buyPrice*0.93*100)/100; /* 매수가 -7% */
    const hp=p.highPrice||p.buyPrice;
    const trailStop=Math.round(hp*0.91*100)/100; /* 최고가 -9% */
    const activeStop=Math.max(entryStop,trailStop); /* 더 높은 쪽이 활성 */
    const pctFromStop=curPrice>0?Math.round((curPrice/activeStop-1)*1000)/10:0;
    const isTrailActive=trailStop>entryStop;
    const pctFromHigh=hp>0?Math.round((curPrice/hp-1)*1000)/10:0;
    const pctGain=p.buyPrice>0?Math.round((curPrice/p.buyPrice-1)*1000)/10:0;
    /* 상태 판정 */
    let status,statusColor,statusBg;
    if(curPrice<=activeStop){status='이탈❗';statusColor='#ff1744';statusBg='#ff174418';}
    else if(pctFromStop<=3){status='임박⚠️';statusColor='#ffd43b';statusBg='#ffd43b12';}
    else if(pctFromStop<=7){status='근접';statusColor='#ff922b';statusBg='transparent';}
    else{status='안전';statusColor='#3fb950';statusBg='transparent';}
    return {entryStop,trailStop,activeStop,isTrailActive,pctFromStop,pctFromHigh,pctGain,hp,status,statusColor,statusBg};
  },[]);
  const updateStopLoss=useCallback((idx,val)=>{
    setPortfolio(p=>p.map((x,i)=>i===idx?{...x,stopLoss:Number(val)||0}:x));
  },[]);
  const removePortfolio=useCallback((idx)=>{
    setPortfolio(p=>p.filter((_,i)=>i!==idx));
  },[]);
  const[syncMsg,setSyncMsg]=useState('');
  const[syncInput,setSyncInput]=useState('');
  const[showSync,setShowSync]=useState(false);

  const doExport=useCallback(()=>{
    const data=JSON.stringify({w:watchlist,p:portfolio,ts:Date.now()});
    const code=btoa(unescape(encodeURIComponent(data)));
    navigator.clipboard.writeText(code).then(()=>setSyncMsg('✅ 코드 복사 완료! 다른 기기에서 가져오기 하세요.')).catch(()=>{
      /* 클립보드 실패 시 직접 표시 */
      setSyncInput(code);setSyncMsg('📋 아래 코드를 복사하세요:');
    });
    setTimeout(()=>setSyncMsg(''),4000);
  },[watchlist,portfolio]);

  const doImport=useCallback(()=>{
    try{
      const json=JSON.parse(decodeURIComponent(escape(atob(syncInput.trim()))));
      if(json.w)setWatchlist(json.w);
      if(json.p)setPortfolio(json.p);
      setSyncMsg(`✅ 가져오기 완료! 워치${(json.w||[]).length}개 + 보유${(json.p||[]).length}개`);
      setSyncInput('');
    }catch(e){setSyncMsg('❌ 잘못된 코드입니다.');}
    setTimeout(()=>setSyncMsg(''),4000);
  },[syncInput]);

  /* ESC로 모달 닫기 + 타이틀/폰트 설정 */
  useEffect(()=>{
    document.title='듀얼 엔진 프로 | MF × SEPA × 듀얼모멘텀';
    /* viewport meta for mobile */
    if(!document.querySelector('meta[name="viewport"]')){
      const m=document.createElement('meta');m.name='viewport';
      m.content='width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no';
      document.head.appendChild(m);
    }
    if(!document.getElementById('gfont-noto')){
      const l=document.createElement('link');l.id='gfont-noto';l.rel='stylesheet';
      l.href='https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;900&family=JetBrains+Mono:wght@400;600;700&display=swap';
      document.head.appendChild(l);
    }
    const h=e=>{if(e.key==='Escape')setShowDetail(false);};
    window.addEventListener('keydown',h);return()=>window.removeEventListener('keydown',h);
  },[]);

  /* ============ YAHOO FINANCE FETCH ENGINE ============ */
  const doFetch=useCallback(async()=>{
    if(busy.current)return;busy.current=true;setRt("fetching");setProg(0);
    const t0=Date.now();
    log("🚀 Yahoo Finance 실시간 조회 시작 ("+stocks.length+"종목)");
    const nf={};const np={};
    stocks.forEach(d=>{np[d.t]=d.p});
    const allTickers=stocks.map(d=>({t:d.t,k:d.k}));
    const batches=[];
    for(let i=0;i<allTickers.length;i+=40) batches.push(allTickers.slice(i,i+40));
    let totalOk=0,totalFail=0;
    const allUpdates={};
    for(let bi=0;bi<batches.length;bi++){
      const batch=batches[bi];
      log(`📡 배치 ${bi+1}/${batches.length}: ${batch.slice(0,3).map(t=>t.t).join(",")}... (${batch.length}종목)`);
      try{
        const resp=await fetch("/api/quotes",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tickers:batch})});
        if(!resp.ok)throw new Error("API "+resp.status);
        const result=await resp.json();
        if(result.data){
          Object.entries(result.data).forEach(([tk,info])=>{allUpdates[tk]={price:info.price,change:info.change_pct};});
          totalOk+=result.ok||0;
          log(`✅ ${result.ok}/${batch.length} 수신`,"ok");
        }
      }catch(e){totalFail+=batch.length;log(`❌ 실패: ${e.message}`,"er");}
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

  /* ============ ANALYSIS ENGINE (하루 1번) ============ */
  const doAnalysis=useCallback(async()=>{
    if(anaBusy.current)return;
    anaBusy.current=true;setAnaRt("fetching");setAnaProg(0);
    const t0=Date.now();
    log("🔬 분석 갱신 시작 (SEPA+모멘텀+VCP, "+stocks.length+"종목)","if");
    log("⏱ 1~2분 소요 예상. 잠시 기다려주세요...","if");

    const allTickers=stocks.map(d=>({t:d.t,k:d.k}));
    const batches=[];
    for(let i=0;i<allTickers.length;i+=10) batches.push(allTickers.slice(i,i+10));

    const allResults={};
    let totalOk=0, totalFail=0;

    for(let bi=0;bi<batches.length;bi++){
      const batch=batches[bi];
      log(`🔬 분석 ${bi+1}/${batches.length}: ${batch.slice(0,3).map(t=>t.t).join(",")}...`);
      try{
        const resp=await fetch("/api/analysis",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({tickers:batch})});
        if(!resp.ok)throw new Error("API "+resp.status);
        const result=await resp.json();
        if(result.data){
          Object.entries(result.data).forEach(([tk,info])=>{allResults[tk]=info;});
          totalOk+=result.ok||0;
          log(`✅ 분석 ${result.ok}/${batch.length} 완료`,"ok");
        }
      }catch(e){totalFail+=batch.length;log(`❌ 분석 실패: ${e.message}`,"er");}
      setAnaProg(Math.round((bi+1)/batches.length*100));
    }

    /* stocks에 반영 */
    setStocks(prev=>prev.map(d=>{
      const a=allResults[d.t];
      if(!a)return d;
      return {...d,
        e: a.e || d.e,
        r: [a.r?a.r[0]:d.r[0], a.r?a.r[1]:d.r[1], d.r[2]],
        v: a.v || d.v,
        _sepaDetail: a.sepaDetail,
        _momDetail: a.momDetail,
        _volData: a.volData,
      };
    }));

    /* localStorage에 캐시 */
    try{
      localStorage.setItem('ana_data',JSON.stringify(allResults));
      const timeStr=new Date().toLocaleString("ko");
      localStorage.setItem('ana_time',timeStr);
      setAnaTime(timeStr);
    }catch(e){}

    const elapsed=((Date.now()-t0)/1000).toFixed(1);
    setAnaRt(totalFail===0?"done":"error");setAnaProg(100);
    log(`🏁 분석 완료: ${totalOk}성공 ${totalFail}실패 (${elapsed}s)`,"ok");
    anaBusy.current=false;
    /* 5초 후 상태 리셋 */
    setTimeout(()=>setAnaRt("idle"),5000);
  },[stocks,log]);

  /* ============ Filter & Sort ============ */
  const sectors=useMemo(()=>[...new Set(stocks.map(d=>d.s))].sort(),[stocks]);
  const filtered=useMemo(()=>stocks.filter(d=>{
    if(mk==="us"&&d.k)return false;if(mk==="kr"&&!d.k)return false;
    if(sec!=="all"&&d.s!==sec)return false;
    if(q){const ql=q.toLowerCase();if(!d.n.toLowerCase().includes(ql)&&!d.t.toLowerCase().includes(ql))return false;}
    /* 듀얼모멘텀 필터 */
    if(dmFilter!=="all"){
      const dm=getDualMomentum(d);
      if(dmFilter==="strong"&&dm.signalScore<10)return false;
      if(dmFilter==="buy"&&dm.signalScore<8)return false;
      if(dmFilter==="hold"&&(dm.signalScore<6||dm.signalScore>=8))return false;
      if(dmFilter==="sell"&&dm.signalScore>=6)return false;
    }
    return true;
  }),[stocks,mk,sec,q,dmFilter]);

  const sorted=useMemo(()=>[...filtered].sort((a,b)=>{
    const gv=d=>{switch(sc){case"n":return d.n;case"s":return d.s;case"p":return d.p;case"c":return d.c;case"f":return d.f||0;case"mf":return mfTs(d);case"sepa":return seTt(d);case"cf":return cfM(d)+cfL(d);case"vd":return getVerdict(d).totalPt;case"dm":return getDualMomentum(d).signalScore*100+getDualMomentum(d).rsScore;case"rs":return getDualMomentum(d).rsScore;default:return d.f||0;}};
    const va=gv(a),vb=gv(b);
    if(typeof va==="string")return sa?va.localeCompare(vb):vb.localeCompare(va);
    return sa?(va-vb):(vb-va);
  }),[filtered,sc,sa]);
  const hs=col=>{if(sc===col)setSa(!sa);else{setSc(col);setSa(false);}};

  /* 통계 */
  const upN=filtered.filter(d=>d.c>0).length;
  const dnN=filtered.filter(d=>d.c<0).length;
  const buyR=filtered.filter(d=>seV(d)==="매수준비").length;
  const vcpR=filtered.filter(d=>vcpMt(d)==="성숙").length;
  const bestN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars>=5).length,[filtered]);
  const strongN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars===4).length,[filtered]);
  const dmBuyN=useMemo(()=>filtered.filter(d=>getDualMomentum(d).signalScore>=8).length,[filtered]);

  /* US/KR 분리 통계 */
  const usStocks=useMemo(()=>filtered.filter(d=>!d.k),[filtered]);
  const krStocks=useMemo(()=>filtered.filter(d=>d.k),[filtered]);

  const handleStockClick=useCallback((stock)=>{setDetailStock(stock);setShowDetail(true);},[]);

  /* 체크리스트 */
  const checklistItems=useMemo(()=>[
    {id:'c1',engine:'MF',label:'MF 종합점수 70점 이상?',auto:true,check:(s)=>(s.f||0)>=70},
    {id:'c2',engine:'MF',label:'MF 방향 "매수"?',auto:true,check:(s)=>mfTd(s)==="매수"},
    {id:'c3',engine:'SEPA',label:'SEPA 템플릿 7/8 이상?',auto:true,check:(s)=>seTt(s)>=7},
    {id:'c4',engine:'SEPA',label:'SEPA 판정 "매수준비"?',auto:true,check:(s)=>seV(s)==="매수준비"},
    {id:'c5',engine:'DM',label:'듀얼모멘텀 BUY 이상?',auto:true,check:(s)=>getDualMomentum(s).signalScore>=8},
    {id:'c6',engine:'VCP',label:'VCP 성숙?',auto:true,check:(s)=>vcpMt(s)==="성숙"},
    {id:'c7',engine:'CF',label:'CF 중기+장기 양호?',auto:true,check:(s)=>cfM(s)>=2&&cfL(s)>=2},
    {id:'c8',engine:'시장',label:'주요 지수 상승추세?',auto:true,check:()=>true},
    {id:'c9',engine:'리스크',label:'손절가 설정(-7~8%)?',auto:false},
    {id:'c10',engine:'리스크',label:'투자금 5% 이하?',auto:false},
  ],[]);

  const calcPos=useMemo(()=>{
    const{acct,risk,entry,stop}=posCal;
    if(!entry||!stop||entry<=stop)return{sh:0,sz:0,ml:0,pc:0};
    const ra=acct*(risk/100);const ps=entry-stop;const sh=Math.floor(ra/ps);
    return{sh,sz:Math.round(sh*entry),ml:Math.round(ra),pc:(sh*entry/acct*100).toFixed(1)};
  },[posCal]);

  /* === UI Components === */
  const Dot=({s})=>{const bg=s==="idle"?"#484f58":s==="fetching"?"#d29922":s==="live"?"#3fb950":"#f85149";
    return <div style={{width:14,height:14,borderRadius:"50%",background:bg,boxShadow:s!=="idle"?("0 0 8px "+bg):"none",flexShrink:0}}/>};
  const Badge=({v,g,r})=>{if(v===null||v===undefined)return <span style={{color:"#484f58",fontSize:14}}>-</span>;
    const c=g?v>=g?"#3fb950":v>=(r||0)?"#d29922":"#f85149":"#8b949e";
    return <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",minWidth:36,height:24,padding:"0 5px",borderRadius:3,fontSize:14,fontWeight:600,background:c+"20",color:c}}>{typeof v==="number"&&v%1?v.toFixed(1):v}</span>};
  const Chg=({v})=>{const c=v>0?"#3fb950":v<0?"#f85149":"#484f58";return <span style={{color:c,fontFamily:"'JetBrains Mono'",fontSize:14}}>{v>0?"+":""}{v.toFixed(2)}%</span>};
  const Tb=({label,active,onClick,color})=><button onClick={onClick} style={{padding:"5px 14px",borderRadius:5,fontSize:13,fontWeight:600,cursor:"pointer",border:"1px solid "+(active?(color||"#58a6ff"):"#21262d"),background:active?`${color||"#58a6ff"}15`:"#0d1117",color:active?(color||"#58a6ff"):"#8b949e",whiteSpace:"nowrap"}}>{label}</button>;
  const Chip=({n,label,color})=><div style={{display:"flex",alignItems:"center",gap:3,padding:"2px 10px",borderRadius:5,fontSize:12,fontWeight:600,border:"1px solid "+color,background:color+"20",color:color}}><span style={{fontFamily:"'JetBrains Mono'",fontSize:15,fontWeight:700}}>{n}</span>{label}</div>;
  const TH=({children,onClick,a,r,c,w,sx})=><th onClick={onClick} style={{padding:"7px 5px",textAlign:r?"right":c?"center":"left",fontWeight:600,color:a?"#58a6ff":"#484f58",fontSize:12,borderBottom:"2px solid #21262d",whiteSpace:"nowrap",cursor:onClick?"pointer":"default",userSelect:"none",background:"#06080d",width:w,position:"sticky",top:0,zIndex:1,...(sx||{})}}>{children}</th>;

  const grC=g=>g==="A"?"#3fb950":g==="B"?"#d29922":g==="C"||g==="D"?"#f85149":"#484f58";
  const grT=g=>g==="A"?"⭐⭐⭐":g==="B"?"⭐⭐":g==="C"?"⭐":g==="D"?"❌":"—";
  const vcpC=m=>m==="성숙"?"#3fb950":m==="형성중"?"#d29922":"#f85149";
  const vcpI=m=>m==="성숙"?"🟢":m==="형성중"?"🟡":"🔴";

  /* === Detail Panel (인라인 확장) === */
  const Detail=({d})=>{
    const gr=fundGr(d);const eq1=d.d[0];const eq2=d.d[1];const rq=d.d[2];const roe=d.d[3];
    const acc=eq1>eq2?"가속":"둔화";
    const dm=getDualMomentum(d);
    const IR=({l,v,c})=><div style={{display:"flex",justifyContent:"space-between",padding:"2px 0"}}><span style={{color:"#484f58",fontSize:13}}>{l}</span><span style={{fontFamily:"'JetBrains Mono'",color:c||"#e6edf3",fontWeight:600,fontSize:13}}>{v||"-"}</span></div>;
    return(
    <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:8,padding:12,margin:"2px 6px 6px"}}>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:8,flexWrap:"wrap"}}>
        <span style={{fontSize:20,fontWeight:800}}>{d.n}</span>
        <span style={{fontSize:13,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{d.t}</span>
        <span style={{padding:"2px 8px",borderRadius:8,fontSize:11,background:dm.signalColor+"20",color:dm.signalColor,fontWeight:700}}>{dm.signal}</span>
        <button onClick={e=>{e.stopPropagation();handleStockClick(d);}} style={{marginLeft:"auto",padding:"4px 12px",borderRadius:6,border:"1px solid #58a6ff",background:"#58a6ff15",color:"#58a6ff",cursor:"pointer",fontSize:12,fontWeight:600}}>📊 상세분석</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:14,fontWeight:700,color:"#39d353",marginBottom:4}}>멀티팩터</div>
          <IR l="종합" v={(mfTs(d)).toFixed(2)} c={mfTs(d)>=2?"#3fb950":"#d29922"}/>
          <IR l="방향" v={mfTd(d)+(mfAl(d)?" ⚡":"")} c={mfTd(d)==="매수"?"#3fb950":"#f85149"}/>
          <IR l="펀더" v={(d.f||0)+"점"} c={d.f>=80?"#3fb950":"#d29922"}/>
        </div>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:14,fontWeight:700,color:"#bc8cff",marginBottom:4}}>SEPA + 듀얼모멘텀</div>
          <IR l="SEPA" v={seTt(d)+"/8"} c={seTt(d)>=8?"#3fb950":"#d29922"}/>
          <IR l="판정" v={seV(d)} c={seV(d)==="매수준비"?"#3fb950":"#d29922"}/>
          <IR l="RS점수" v={dm.rsScore+"/100"} c={dm.rsScore>=70?"#3fb950":"#d29922"}/>
          <IR l="추세" v={(dm.trendStr>0?"+":"")+dm.trendStr+"/3"} c={dm.trendStr>0?"#3fb950":"#f85149"}/>
        </div>
        <div style={{background:"#161b22",borderRadius:6,padding:10}}>
          <div style={{fontSize:14,fontWeight:700,color:"#f778ba",marginBottom:4}}>VCP / 전략</div>
          <IR l="VCP" v={vcpI(vcpMt(d))+" "+vcpMt(d)} c={vcpC(vcpMt(d))}/>
          <IR l="피봇" v={fP(vcpPv(d),d.k)} c="#58a6ff"/>
          <IR l="손익비" v={d.q[4]?d.q[4]+":1":"-"} c={d.q[4]>=2?"#3fb950":"#d29922"}/>
          <IR l="등급" v={grT(gr)+" "+gr} c={grC(gr)}/>
        </div>
      </div>
    </div>
  )};

  /* ============ RENDER ============ */
  return(
    <>
    <div style={{background:"#06080d",color:"#e6edf3",minHeight:"100vh",fontFamily:"'Noto Sans KR',system-ui,sans-serif"}} suppressHydrationWarning>
      {/* Header */}
      <div className="dash-header" style={{background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",borderBottom:"1px solid #21262d",padding:"12px 20px"}}>
        <div style={{maxWidth:1800,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h1 className="dash-title" style={{fontSize:22,fontWeight:900,background:"linear-gradient(135deg,#58a6ff,#bc8cff,#f778ba)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>{isMobile?("⚡ 듀얼엔진 ("+D.length+")"):("⚡ 듀얼 엔진 프로 — MF × SEPA × 듀얼모멘텀 ("+D.length+"종목)")}</h1>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <span style={{fontSize:13,color:"#3fb950",fontFamily:"'JetBrains Mono'",fontWeight:600}}>Yahoo Finance Live</span>
            <span style={{fontSize:13,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{new Date().toISOString().slice(0,10)}</span>
          </div>
        </div>
      </div>

      {/* RT Engine Bar */}
      <div style={{maxWidth:1800,margin:"6px auto",padding:"0 20px"}}>
        <div className="rt-bar" style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:isMobile?"6px 10px":"10px 14px",display:"flex",gap:isMobile?6:10,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:4}}><Dot s={rt}/>{!isMobile&&<span style={{fontSize:14,fontWeight:700}}>{rt==="idle"?"대기":rt==="fetching"?"조회중...":rt==="live"?"✅ 완료":"⚠️ 실패"}</span>}</div>
          <div style={{flex:1,minWidth:40,maxWidth:isMobile?80:200}}><div style={{height:4,background:"#161b22",borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#58a6ff,#bc8cff)",borderRadius:3,width:prog+"%",transition:"width .3s"}}/></div></div>
          <div style={{display:"flex",gap:isMobile?6:12,fontSize:isMobile?10:12,color:"#484f58",fontFamily:"'JetBrains Mono'"}}><span>{stats.time}</span><span><b style={{color:"#3fb950"}}>{stats.ok}</b>{"/"}{D.length}</span><span>{stats.ms}</span></div>
          <div style={{display:"flex",gap:4,marginLeft:"auto",alignItems:"center"}}>
            <button onClick={doFetch} disabled={rt==="fetching"} style={{padding:isMobile?"5px 10px":"6px 14px",borderRadius:6,border:"1px solid #bc8cff",cursor:rt==="fetching"?"wait":"pointer",background:"linear-gradient(135deg,#1a3a5c,#2d1b69)",color:"#bc8cff",fontSize:isMobile?12:14,fontWeight:700}}>{isMobile?"⚡":"⚡ 가격"}</button>
            <button onClick={doAnalysis} disabled={anaRt==="fetching"} style={{padding:isMobile?"5px 10px":"6px 14px",borderRadius:6,border:"1px solid #ff922b",cursor:anaRt==="fetching"?"wait":"pointer",background:anaRt==="fetching"?"#ff922b20":"linear-gradient(135deg,#2d1b00,#3d2b10)",color:"#ff922b",fontSize:isMobile?12:14,fontWeight:700}}>{anaRt==="fetching"?(isMobile?anaProg+"%":"🔬 "+anaProg+"%"):(isMobile?"🔬":"🔬 분석")}</button>
            <button onClick={toggleAuto} style={{padding:isMobile?"5px 8px":"6px 12px",borderRadius:6,fontSize:isMobile?12:14,fontWeight:600,cursor:"pointer",border:"1px solid "+(autoOn?"#3fb950":"#21262d"),background:autoOn?"rgba(63,185,80,.12)":"#161b22",color:autoOn?"#3fb950":"#8b949e"}}>{autoOn?"⏹":"🔄"}</button>
            {!isMobile&&<><input type="number" value={intv} min={1} max={60} onChange={e=>setIntv(+e.target.value||3)} style={{width:40,padding:"4px 5px",borderRadius:4,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:13,fontFamily:"'JetBrains Mono'",textAlign:"center",outline:"none"}}/>
            <span style={{fontSize:12,color:"#484f58"}}>분</span></>}
            <button onClick={()=>setShowLog(!showLog)} style={{padding:isMobile?"4px 8px":"5px 10px",borderRadius:5,border:"1px solid #21262d",background:"#161b22",color:"#8b949e",cursor:"pointer",fontSize:isMobile?11:13}}>📋</button>
          </div>
        </div>
        {/* 분석 진행바 */}
        {anaRt==="fetching" && <div style={{marginTop:4,background:"#0d1117",border:"1px solid #21262d",borderRadius:6,padding:"6px 12px",display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:12,color:"#ff922b",fontWeight:600}}>🔬 분석 갱신 중... ({anaProg}%)</span>
          <div style={{flex:1,height:4,background:"#161b22",borderRadius:2,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#ff922b,#ffd43b)",borderRadius:2,width:anaProg+"%",transition:"width .3s"}}/></div>
          <span style={{fontSize:11,color:"#484f58"}}>SEPA+모멘텀+VCP</span>
        </div>}
        {/* 마지막 분석 시간 */}
        {anaTime!=='-' && anaRt!=="fetching" && <div style={{marginTop:2,fontSize:11,color:"#484f58",textAlign:"right",padding:"0 4px"}}>
          마지막 분석: {anaTime} {anaRt==="done" && <span style={{color:"#3fb950"}}>✅</span>}
        </div>}
      </div>

      {showLog && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}><div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:6,padding:"6px 10px",maxHeight:100,overflowY:"auto",fontFamily:"'JetBrains Mono'",fontSize:12}}>{logs.map((l,i)=><div key={i} style={{padding:"1px 0"}}><span style={{color:"#484f58",marginRight:4}}>{l.ts}</span><span style={{color:l.c==="ok"?"#3fb950":l.c==="er"?"#f85149":"#58a6ff"}}>{l.msg}</span></div>)}</div></div>}

      {/* Tab Nav */}
      <div className="tab-nav" style={{maxWidth:1800,margin:"6px auto",padding:"0 20px"}}>
        <div style={{display:"flex",gap:4,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2,scrollbarWidth:"none"}}>
          {[["main",isMobile?"📊":"📊 메인"],["watch",isMobile?("👁"+watchlist.length):("👁 워치("+watchlist.length+")")],["port",isMobile?"💼":"💼 보유종목"],["filter",isMobile?"🌐":"🌐 시장필터"],["calc",isMobile?"🧮":"🧮 포지션"],["check",isMobile?"✅":"✅ 체크리스트"]].map(([k,l])=>
            <Tb key={k} label={l} active={tab===k} onClick={()=>setTab(k)}/>
          )}
        </div>
      </div>

      {/* ============ 시장필터 탭 ============ */}
      {tab==="filter" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <div style={{fontSize:18,fontWeight:800,color:"#58a6ff",marginBottom:10}}>듀얼 모멘텀 시장 필터</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            <div style={{background:"#161b22",borderRadius:8,padding:10}}>
              <div style={{fontSize:13,color:"#484f58",marginBottom:3}}>절대 모멘텀</div>
              <div style={{fontSize:14}}>{"SPY 12M: "}<b style={{color:"#3fb950"}}>{"+"+MKT.spy12m+"%"}</b>{" ✅"}</div>
              <div style={{fontSize:14}}>{"KOSPI 12M: "}<b style={{color:"#3fb950"}}>{"+"+MKT.kospi12m+"%"}</b>{" ✅"}</div>
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:10}}>
              <div style={{fontSize:13,color:"#484f58",marginBottom:3}}>시장 건강도</div>
              <div style={{fontSize:13}}>200일선: <b style={{color:"#3fb950"}}>{MKT.spy200}</b> | VIX: <b style={{color:"#3fb950"}}>{MKT.vix}</b></div>
              <div style={{fontSize:13}}>신고가/신저가: <b style={{color:"#3fb950"}}>{MKT.nh}</b> | A/D: <b style={{color:"#3fb950"}}>{MKT.ad}</b></div>
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:10,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:28,fontWeight:900,color:"#3fb950"}}>🟢</div>
              <div style={{fontSize:18,fontWeight:800,color:"#3fb950"}}>공격 모드</div>
              <div style={{fontSize:12,color:"#484f58"}}>정상매매 비중100%</div>
            </div>
          </div>
          <div style={{marginTop:8}}>
            <div style={{fontSize:13,color:"#484f58",marginBottom:3}}>상대 모멘텀 섹터 순위</div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {MKT.sec.map(([s,v],i)=>
                <span key={s} style={{padding:"2px 8px",borderRadius:8,fontSize:12,background:i<3?"rgba(63,185,80,.12)":"#161b22",border:"1px solid "+(i<3?"#3fb950":"#21262d"),color:i<3?"#3fb950":"#8b949e"}}>{s+" "+(v>0?"+":"")+v+"%"}</span>
              )}
            </div>
          </div>
        </div>
      </div>}

      {/* ============ 포지션 계산기 ============ */}
      {tab==="calc" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <div style={{fontSize:18,fontWeight:800,color:"#bc8cff",marginBottom:10}}>포지션 사이징 계산기</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8}}>
            {[["계좌($)","acct"],["리스크(%)","risk"],["진입가","entry"],["손절가","stop"]].map(([l,k])=>
              <div key={k}><div style={{fontSize:12,color:"#484f58",marginBottom:2}}>{l}</div>
                <input type="number" value={posCal[k]} onChange={e=>setPosCal(p=>({...p,[k]:+e.target.value||0}))}
                  style={{width:"100%",padding:"6px 8px",borderRadius:5,border:"1px solid #21262d",background:"#161b22",color:"#e6edf3",fontSize:15,outline:"none",fontFamily:"'JetBrains Mono'"}}/></div>
            )}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:8}}>
            {[["매수수량",calcPos.sh+"주"],["규모","$"+calcPos.sz.toLocaleString()],["최대손실","$"+calcPos.ml.toLocaleString()],["비중",calcPos.pc+"%"]].map(([l,v])=>
              <div key={l} style={{background:"#161b22",borderRadius:6,padding:8,textAlign:"center"}}>
                <div style={{fontSize:12,color:"#484f58"}}>{l}</div>
                <div style={{fontSize:18,fontWeight:800,color:"#bc8cff",fontFamily:"'JetBrains Mono'"}}>{v}</div>
              </div>
            )}
          </div>
        </div>
      </div>}

      {/* ============ 체크리스트 탭 ============ */}
      {tab==="check" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#b197fc",fontSize:16,marginBottom:12,marginTop:0}}>✅ 4엔진 매수 전 체크리스트</h3>
          <div style={{marginBottom:12}}>
            <input type="text" value={chkSearch} onChange={e=>setChkSearch(e.target.value)} placeholder="🔍 종목명 또는 티커 검색..."
              style={{width:"100%",padding:8,background:"#1a1a2e",border:"1px solid #333",borderRadius:"6px 6px 0 0",color:"#eee",fontSize:13,outline:"none"}}/>
            <select value={selectedChkStock?.t||''} onChange={e=>{const s=stocks.find(d=>d.t===e.target.value);setSelectedChkStock(s||null);setChkSearch("");}}
              style={{width:"100%",padding:8,background:"#1a1a2e",border:"1px solid #333",borderTop:"none",borderRadius:"0 0 6px 6px",color:"#eee",fontSize:13}}
              size={chkSearch?Math.min(stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}).length+1,8):1}>
              <option value="">-- 종목 선택 --</option>
              {(chkSearch?stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}):stocks).map(s=>(
                <option key={s.t} value={s.t}>{s.n} ({s.t}) MF:{s.f||'N/A'}</option>
              ))}
            </select>
          </div>
          {selectedChkStock && (<div style={{padding:10,background:"#0a0a2e",borderRadius:8,marginBottom:12,border:"1px solid #222"}}>
            <div style={{fontSize:15,fontWeight:700,color:"#eee"}}>{selectedChkStock.n} <span style={{fontSize:11,color:"#666"}}>{selectedChkStock.t}</span></div>
            <div style={{display:"flex",gap:12,marginTop:4,fontSize:11}}>
              <span style={{color:"#4dabf7"}}>MF: {selectedChkStock.f||'N/A'}</span>
              <span style={{color:"#69db7c"}}>SEPA: {seV(selectedChkStock)}</span>
              <span style={{color:"#ffd43b"}}>VCP: {vcpMt(selectedChkStock)}</span>
              <span style={{color:getDualMomentum(selectedChkStock).signalColor}}>DM: {getDualMomentum(selectedChkStock).signal}</span>
            </div>
          </div>)}
          <div style={{display:"grid",gap:6}}>
            {checklistItems.map((item,idx)=>{
              const isAutoChecked=item.auto&&selectedChkStock?item.check(selectedChkStock):false;
              const isManualChecked=!item.auto?manualChecks[item.id]:false;
              const isChecked=item.auto?isAutoChecked:isManualChecked;
              return(<div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:6,background:isChecked?"#0d2818":"#1a1a1a",border:`1px solid ${isChecked?"#00ff8833":"#222"}`,cursor:item.auto?"default":"pointer",opacity:!selectedChkStock&&item.auto?0.5:1}}
                onClick={()=>{if(!item.auto)setManualChecks(p=>({...p,[item.id]:!p[item.id]}));}}>
                <div style={{width:22,height:22,borderRadius:5,background:isChecked?"#00ff88":"#333",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:isChecked?"#000":"#555",flexShrink:0}}>{isChecked?"✓":idx+1}</div>
                <span style={{padding:"2px 6px",borderRadius:4,fontSize:10,background:item.engine==='MF'?'#4dabf720':item.engine==='SEPA'?'#69db7c20':item.engine==='DM'?'#bc8cff20':item.engine==='VCP'?'#ffd43b20':item.engine==='CF'?'#ff922b20':item.engine==='시장'?'#b197fc20':'#ff6b6b20',color:item.engine==='MF'?'#4dabf7':item.engine==='SEPA'?'#69db7c':item.engine==='DM'?'#bc8cff':item.engine==='VCP'?'#ffd43b':item.engine==='CF'?'#ff922b':item.engine==='시장'?'#b197fc':'#ff6b6b',fontWeight:700,flexShrink:0}}>{item.engine}</span>
                <span style={{fontSize:12,color:isChecked?"#eee":"#888"}}>{item.label}</span>
                {item.auto && <span style={{marginLeft:"auto",fontSize:9,color:"#555"}}>자동</span>}
              </div>);
            })}
          </div>
          {selectedChkStock && (()=>{
            const autoCount=checklistItems.filter(i=>i.auto&&i.check(selectedChkStock)).length;
            const manualCount=Object.values(manualChecks).filter(Boolean).length;
            const total=autoCount+manualCount;
            const color=total>=8?'#00ff88':total>=6?'#ffd43b':'#ff6b6b';
            const msg=total>=8?'✅ 매수 조건 충족!':total>=6?'⚠️ 조건부 매수':'❌ 매수 비추천';
            return(<div style={{marginTop:12,padding:14,borderRadius:8,background:color+'15',border:`2px solid ${color}33`,textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color}}>{total}/10</div>
              <div style={{fontSize:13,fontWeight:600,color,marginTop:2}}>{msg}</div>
            </div>);
          })()}
        </div>
      </div>}

      {/* ============ 워치리스트 탭 ============ */}
      {tab==="watch" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#ffd43b",fontSize:16,marginBottom:12,marginTop:0}}>👁 워치리스트 ({watchlist.length}종목)</h3>
          {/* 동기화 버튼 */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={doExport} style={{padding:"5px 12px",borderRadius:5,border:"1px solid #58a6ff",background:"#58a6ff15",color:"#58a6ff",cursor:"pointer",fontSize:11,fontWeight:600}}>📤 내보내기</button>
            <button onClick={()=>setShowSync(!showSync)} style={{padding:"5px 12px",borderRadius:5,border:"1px solid #bc8cff",background:"#bc8cff15",color:"#bc8cff",cursor:"pointer",fontSize:11,fontWeight:600}}>📥 가져오기</button>
            {syncMsg && <span style={{fontSize:11,color:syncMsg.startsWith('✅')?'#3fb950':syncMsg.startsWith('❌')?'#f85149':'#58a6ff',fontWeight:600}}>{syncMsg}</span>}
          </div>
          {showSync && <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center"}}>
            <input value={syncInput} onChange={e=>setSyncInput(e.target.value)} placeholder="코드를 여기에 붙여넣기" style={{flex:1,padding:"6px 10px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:11,fontFamily:"'JetBrains Mono'",outline:"none"}}/>
            <button onClick={doImport} style={{padding:"5px 14px",borderRadius:5,border:"1px solid #3fb950",background:"#3fb95015",color:"#3fb950",cursor:"pointer",fontSize:11,fontWeight:700}}>적용</button>
          </div>}
          {watchlist.length===0 ? <div style={{color:"#484f58",fontSize:13,padding:20,textAlign:"center"}}>워치리스트가 비어있습니다.<br/>종목 상세보기에서 ☆ 버튼으로 추가하세요.</div> : <>
            {/* 최강 임박 알림 */}
            {(()=>{
              const nearFire=stocks.filter(d=>watchlist.includes(d.t)).filter(d=>{const vd=getVerdict(d);return vd.totalPt>=70&&vd.totalPt<80;});
              if(nearFire.length===0)return null;
              return <div style={{background:"#ff174412",border:"1px solid #ff174444",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#ff1744",marginBottom:6}}>🔥 최강 임박! ({nearFire.length}종목)</div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {nearFire.map(d=>{const vd=getVerdict(d);return <span key={d.t} onClick={()=>{setDetailStock(d);setShowDetail(true);}}
                    style={{padding:"4px 10px",background:"#ff174420",borderRadius:5,fontSize:11,fontWeight:700,color:"#ff8a80",cursor:"pointer",border:"1px solid #ff174444"}}>
                    {d.n} <span style={{fontFamily:"'JetBrains Mono'",color:"#ffd43b"}}>{vd.totalPt}점</span>
                  </span>;})}
                </div>
              </div>;
            })()}

            {/* 미국 / 한국 분리 테이블 */}
            {["us","kr"].map(market=>{
              const items=stocks.filter(d=>(market==="us"?!d.k:d.k)&&watchlist.includes(d.t))
                .sort((a,b)=>getVerdict(b).totalPt-getVerdict(a).totalPt);
              if(items.length===0)return null;
              return <div key={market} style={{marginBottom:14}}>
                <div style={{fontSize:14,fontWeight:700,color:market==="us"?"#4dabf7":"#ff922b",marginBottom:8}}>{market==="us"?"🇺🇸 미국":"🇰🇷 한국"} ({items.length})</div>
                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",fontSize:12,width:isMobile?"max-content":"100%"}}>
                  <thead><tr style={{borderBottom:"2px solid #21262d"}}>
                    <th style={{padding:"6px 8px",textAlign:"left",color:"#484f58",fontSize:11,position:isMobile?"sticky":undefined,left:isMobile?0:undefined,background:"#0d1117",zIndex:isMobile?2:undefined,whiteSpace:"nowrap"}}>종목</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>판정</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>현재가</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>등락</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>SEPA</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>DM</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>VCP</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>거래량</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>MF</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}></th>
                  </tr></thead>
                  <tbody>{items.map(d=>{
                    const vd=getVerdict(d);
                    const dm=getDualMomentum(d);
                    const vol=d._volData;
                    const volSt=vol?.signalType;
                    const volClr=volSt==='buy'?'#3fb950':volSt==='sell'?'#ff1744':volSt==='caution'?'#ffd43b':'#484f58';
                    return <tr key={d.t} style={{borderBottom:"1px solid rgba(33,38,45,.4)",background:vd.totalPt>=80?"#ff174408":vd.totalPt>=70?"#ffd43b06":"transparent"}}>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap",position:isMobile?"sticky":undefined,left:isMobile?0:undefined,background:vd.totalPt>=80?"#0d0d12":vd.totalPt>=70?"#0d0d11":"#0d1117",zIndex:isMobile?1:undefined,borderRight:isMobile?"1px solid #21262d":undefined}}>
                        <span onClick={()=>{setDetailStock(d);setShowDetail(true);}} style={{fontSize:13,fontWeight:vd.stars>=5?700:600,cursor:"pointer",borderBottom:"1px dashed #484f58",color:vd.stars>=5?"#ff1744":"#e6edf3"}}>{d.n}</span>
                        <span style={{fontSize:10,color:"#484f58",marginLeft:4}}>{d.t}</span>
                        {!isMobile&&<div style={{fontSize:10,color:"#484f58"}}>{d.s}</div>}
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:60}}>
                        <div style={{fontSize:12,fontWeight:800,color:vd.color}}>{vd.verdict}</div>
                        <div style={{fontSize:10,color:vd.color,fontFamily:"'JetBrains Mono'",fontWeight:700}}>{vd.totalPt}점</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:"#e6edf3",fontWeight:600,fontSize:13}}>{d.p?fP(d.p,d.k):'-'}</td>
                      <td style={{padding:"6px 8px",textAlign:"right"}}><Chg v={d.c}/></td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{fontSize:11,fontWeight:700,color:seTt(d)>=8?'#3fb950':seTt(d)>=7?'#d29922':seTt(d)>=5?'#8b949e':'#f85149'}}>{seTt(d)}/8</div>
                        <div style={{fontSize:9,color:seSt(d).includes('Stage 2')&&seSt(d).includes('✅')?'#3fb950':'#484f58'}}>{seSt(d).length>12?seSt(d).slice(0,12):seSt(d)}</div>
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{fontSize:10,fontWeight:700,color:dm.signalColor}}>{dm.signal}</div>
                        <div style={{fontSize:9,color:"#484f58"}}>{dm.r3m>0?'+':''}{dm.r3m}%</div>
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{fontSize:10,fontWeight:700,color:vcpMt(d)==='성숙🔥'?'#ff1744':vcpMt(d)==='성숙'?'#3fb950':vcpMt(d)==='형성중'?'#d29922':'#484f58'}}>{vcpMt(d)}</div>
                        <div style={{fontSize:9,color:"#484f58"}}>{vcpPx(d)<5?'피봇'+vcpPx(d)+'%':''}</div>
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        {vol ? <div>
                          <div style={{fontSize:10,fontWeight:700,color:volClr,lineHeight:1.2}}>{vol.signal||vol.volTrend}</div>
                          <div style={{fontSize:9,color:"#484f58"}}>{vol.volRatio}x</div>
                        </div> : <span style={{color:"#333",fontSize:10}}>-</span>}
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{fontSize:11,fontWeight:600,color:d.f>=80?'#3fb950':d.f>=70?'#58a6ff':d.f>=60?'#8b949e':'#f85149'}}>{d.f||'-'}</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"center"}}><button onClick={()=>toggleWatch(d.t)} style={{padding:"3px 7px",borderRadius:4,border:"1px solid #f8514933",background:"#f8514912",color:"#f85149",cursor:"pointer",fontSize:10}}>✕</button></td>
                    </tr>;
                  })}</tbody>
                </table>
                </div>
              </div>;
            })}
          </>}
        </div>
      </div>}

      {/* ============ 보유종목 탭 ============ */}
      {tab==="port" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#bc8cff",fontSize:16,marginBottom:12,marginTop:0}}>💼 보유종목</h3>

          {/* 검색창 */}
          <div style={{marginBottom:10}}>
            <input placeholder="🔍 종목명 또는 티커 검색..." value={pfSearch} onChange={e=>setPfSearch(e.target.value)}
              style={{padding:"8px 14px",borderRadius:8,border:"1px solid #21262d",background:"#161b22",color:"#e6edf3",fontSize:13,width:"100%",maxWidth:400,outline:"none"}}/>
          </div>

          {/* 종목 추가 폼 */}
          <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap",alignItems:"center",padding:10,background:"#161b22",borderRadius:8,border:"1px solid #21262d"}}>
            <span style={{fontSize:12,color:"#8b949e",fontWeight:600}}>➕ 추가:</span>
            <select value={pfForm.ticker} onChange={e=>setPfForm(p=>({...p,ticker:e.target.value}))}
              style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,minWidth:140}}>
              <option value="">종목 선택</option>
              <optgroup label="🇺🇸 미국">
                {stocks.filter(d=>!d.k).map(d=><option key={d.t} value={d.t}>{d.n} ({d.t})</option>)}
              </optgroup>
              <optgroup label="🇰🇷 한국">
                {stocks.filter(d=>d.k).map(d=><option key={d.t} value={d.t}>{d.n} ({d.t})</option>)}
              </optgroup>
            </select>
            <input type="number" placeholder="매수가" value={pfForm.buyPrice||''} onChange={e=>setPfForm(p=>({...p,buyPrice:e.target.value}))}
              style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:100,fontFamily:"'JetBrains Mono'"}}/>
            <input type="number" placeholder="수량" value={pfForm.qty||''} onChange={e=>setPfForm(p=>({...p,qty:e.target.value}))}
              style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:70,fontFamily:"'JetBrains Mono'"}}/>
            <button onClick={()=>{addPortfolio(pfForm.ticker,pfForm.buyPrice,pfForm.qty,0);setPfForm({ticker:'',buyPrice:0,qty:0,stopLoss:0});}}
              style={{padding:"5px 14px",borderRadius:5,border:"1px solid #bc8cff",background:"#bc8cff18",color:"#bc8cff",cursor:"pointer",fontSize:12,fontWeight:700}}>추가</button>
            <span style={{fontSize:10,color:"#484f58"}}>손절가 자동계산 (진입-7% / 트레일링-9%)</span>
          </div>

          {portfolio.length===0 ? <div style={{color:"#484f58",fontSize:13,padding:20,textAlign:"center"}}>보유종목이 없습니다. 위에서 종목을 추가하세요.</div> : <>
            {/* 총 요약 */}
            {(()=>{
              let totalBuy=0,totalCur=0;
              portfolio.forEach(p=>{const s=stocks.find(d=>d.t===p.ticker);if(s&&s.p){totalBuy+=p.buyPrice*p.qty;totalCur+=s.p*p.qty;}});
              const totalPnl=totalCur-totalBuy;
              const totalPct=totalBuy>0?((totalCur/totalBuy-1)*100):0;
              /* 경고 종목 카운트 */
              const alertItems=portfolio.filter(p=>{
                const s=stocks.find(d=>d.t===p.ticker);
                if(!s||!s.p)return false;
                const sl=calcStops(p,s.p);
                return sl.status==='이탈❗'||sl.status==='임박⚠️';
              });
              return <div style={{display:"flex",gap:16,padding:"10px 14px",background:"linear-gradient(135deg,#0d1117,#161b22)",borderRadius:8,marginBottom:14,border:"1px solid #21262d",flexWrap:"wrap",alignItems:"center"}}>
                <div><div style={{fontSize:10,color:"#484f58"}}>총 매수금액</div><div style={{fontSize:15,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{totalBuy.toLocaleString()}</div></div>
                <div><div style={{fontSize:10,color:"#484f58"}}>총 평가금액</div><div style={{fontSize:15,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{Math.round(totalCur).toLocaleString()}</div></div>
                <div><div style={{fontSize:10,color:"#484f58"}}>총 손익</div><div style={{fontSize:15,fontWeight:700,color:totalPnl>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{totalPnl>=0?"+":""}{Math.round(totalPnl).toLocaleString()}</div></div>
                <div><div style={{fontSize:10,color:"#484f58"}}>총 수익률</div><div style={{fontSize:15,fontWeight:700,color:totalPct>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{totalPct>=0?"+":""}{totalPct.toFixed(2)}%</div></div>
                {alertItems.length>0 && <div style={{padding:"4px 12px",background:"#f8514920",border:"1px solid #f8514966",borderRadius:6}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#f85149"}}>🚨 손절 경고 {alertItems.length}종목</div>
                  <div style={{fontSize:9,color:"#ff8a80"}}>{alertItems.map(p=>{const s=stocks.find(d=>d.t===p.ticker);return s?s.n:'';}).join(', ')}</div>
                </div>}
              </div>;
            })()}

            {/* 손절 시스템 설명 */}
            <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
              <span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"#ff922b15",border:"1px solid #ff922b33",color:"#ff922b"}}>진입손절: 매수가 -7%</span>
              <span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"#bc8cff15",border:"1px solid #bc8cff33",color:"#bc8cff"}}>트레일링: 최고가 -9%</span>
              <span style={{fontSize:10,padding:"3px 8px",borderRadius:4,background:"#58a6ff15",border:"1px solid #58a6ff33",color:"#58a6ff"}}>활성 = 둘 중 높은 가격</span>
            </div>

            {/* 미국 / 한국 분리 */}
            {["us","kr"].map(market=>{
              let items=portfolio.filter(p=>{const s=stocks.find(d=>d.t===p.ticker);return s?(market==="us"?!s.k:s.k):false;});
              /* 검색 필터 */
              if(pfSearch.trim()){
                const q=pfSearch.trim().toLowerCase();
                items=items.filter(p=>{const s=stocks.find(d=>d.t===p.ticker);return s&&(s.n.toLowerCase().includes(q)||s.t.toLowerCase().includes(q));});
              }
              if(items.length===0)return null;
              let mktBuy=0,mktCur=0;
              items.forEach(p=>{const s=stocks.find(d=>d.t===p.ticker);if(s&&s.p){mktBuy+=p.buyPrice*p.qty;mktCur+=s.p*p.qty;}});
              const mktPnl=mktCur-mktBuy;const mktPct=mktBuy>0?((mktCur/mktBuy-1)*100):0;
              return <div key={market} style={{marginBottom:14}}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                  <span style={{fontSize:14,fontWeight:700,color:market==="us"?"#4dabf7":"#ff922b"}}>{market==="us"?"🇺🇸 미국":"🇰🇷 한국"}</span>
                  <span style={{fontSize:11,color:"#484f58"}}>{items.length}종목</span>
                  <span style={{fontSize:11,color:mktPnl>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'",fontWeight:600}}>{mktPnl>=0?"+":""}{Math.round(mktPnl).toLocaleString()} ({mktPct>=0?"+":""}{mktPct.toFixed(2)}%)</span>
                </div>
                <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
                <table style={{borderCollapse:"collapse",fontSize:12,width:isMobile?"max-content":"100%"}}>
                  <thead><tr style={{borderBottom:"2px solid #21262d"}}>
                    <th style={{padding:"6px 8px",textAlign:"left",color:"#484f58",fontSize:11,position:isMobile?"sticky":undefined,left:isMobile?0:undefined,background:"#0d1117",zIndex:isMobile?2:undefined,whiteSpace:"nowrap"}}>종목</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>판정</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>현재가</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>매수가</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>수익률</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>손익</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#ff922b",fontSize:11,whiteSpace:"nowrap"}}>진입-7%</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#bc8cff",fontSize:11,whiteSpace:"nowrap"}}>트레일-9%</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#f85149",fontSize:11,whiteSpace:"nowrap"}}>활성손절</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}></th>
                  </tr></thead>
                  <tbody>{items.map((p,idx)=>{
                    const s=stocks.find(d=>d.t===p.ticker);
                    if(!s)return null;
                    const curVal=s.p*p.qty;
                    const pnl=curVal-p.buyPrice*p.qty;
                    const pct=p.buyPrice>0?((s.p/p.buyPrice-1)*100):0;
                    const vd=getVerdict(s);
                    const globalIdx=portfolio.indexOf(p);
                    const sl=calcStops(p,s.p||0);
                    return <tr key={idx} style={{borderBottom:"1px solid rgba(33,38,45,.4)",background:sl.statusBg}}>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap",position:isMobile?"sticky":undefined,left:isMobile?0:undefined,background:sl.statusBg||"#0d1117",zIndex:isMobile?1:undefined,borderRight:isMobile?"1px solid #21262d":undefined}}>
                        <span onClick={()=>{setDetailStock(s);setShowDetail(true);}} style={{fontWeight:600,cursor:"pointer",borderBottom:"1px dashed #484f58",color:vd.stars>=5?"#ff1744":"#e6edf3"}}>{s.n}</span>
                        <span style={{fontSize:10,color:"#484f58",marginLeft:4}}>{s.t}</span>
                        <div style={{fontSize:10,color:s.c>=0?"#3fb950":"#f85149"}}>당일 {s.c>=0?"+":""}{s.c?.toFixed(2)||0}%</div>
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:60}}>
                        <div style={{fontSize:11,fontWeight:800,color:vd.color}}>{vd.verdict}</div>
                        <div style={{fontSize:9,color:'#484f58',fontFamily:"'JetBrains Mono'"}}>{vd.totalPt}점</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:"#e6edf3",fontWeight:600,fontSize:13}}>{fP(s.p,s.k)}</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:"#8b949e",fontSize:11}}>
                        <div>{fP(p.buyPrice,s.k)}</div>
                        <div style={{fontSize:9,color:"#484f58"}}>×{p.qty}</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:700,fontSize:14,color:pct>=0?"#3fb950":"#f85149"}}>{pct>=0?"+":""}{pct.toFixed(1)}%</td>
                      <td style={{padding:"6px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:600,color:pnl>=0?"#3fb950":"#f85149",fontSize:11}}>{pnl>=0?"+":""}{s.k?"₩":"$"}{Math.round(Math.abs(pnl)).toLocaleString()}</td>
                      {/* 진입손절 -7% */}
                      <td style={{padding:"4px 6px",textAlign:"center",background:!sl.isTrailActive?"#ff922b08":"transparent"}}>
                        <div style={{fontSize:11,fontWeight:!sl.isTrailActive?700:400,color:!sl.isTrailActive?"#ff922b":"#484f58",fontFamily:"'JetBrains Mono'"}}>{fP(sl.entryStop,s.k)}</div>
                        {!sl.isTrailActive && <div style={{fontSize:8,color:"#ff922b"}}>◀ 활성</div>}
                      </td>
                      {/* 트레일링 -9% */}
                      <td style={{padding:"4px 6px",textAlign:"center",background:sl.isTrailActive?"#bc8cff08":"transparent"}}>
                        <div style={{fontSize:11,fontWeight:sl.isTrailActive?700:400,color:sl.isTrailActive?"#bc8cff":"#484f58",fontFamily:"'JetBrains Mono'"}}>{fP(sl.trailStop,s.k)}</div>
                        <div style={{fontSize:9,color:"#484f58"}}>최고{fP(sl.hp,s.k)} ({sl.pctFromHigh>=0?"+":""}{sl.pctFromHigh}%)</div>
                        {sl.isTrailActive && <div style={{fontSize:8,color:"#bc8cff"}}>◀ 활성</div>}
                      </td>
                      {/* 활성 손절 상태 */}
                      <td style={{padding:"4px 6px",textAlign:"center",minWidth:85,borderLeft:`2px solid ${sl.statusColor}`}}>
                        <div style={{fontSize:12,fontWeight:800,color:sl.statusColor}}>{sl.status}</div>
                        <div style={{fontSize:10,fontWeight:700,color:sl.statusColor,fontFamily:"'JetBrains Mono'"}}>{fP(sl.activeStop,s.k)}</div>
                        <div style={{fontSize:9,color:sl.pctFromStop<=5?sl.statusColor:'#484f58',fontFamily:"'JetBrains Mono'"}}>거리 +{sl.pctFromStop}%</div>
                      </td>
                      <td style={{padding:"6px 8px",textAlign:"center"}}><button onClick={()=>removePortfolio(globalIdx)} style={{padding:"2px 6px",borderRadius:3,border:"1px solid #f8514933",background:"transparent",color:"#f85149",cursor:"pointer",fontSize:10}}>✕</button></td>
                    </tr>;
                  })}</tbody>
                </table>
                </div>
              </div>;
            })}
          </>}
        </div>
      </div>}

      {/* ============ Filters & Table ============ */}
      {(tab==="main"||tab==="filter") && <div className="filter-bar" style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}>
        {/* 뷰 선택 + 검색 (1줄) */}
        <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:4,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:2}}>
          {[["dual",isMobile?"📊":"📊 듀얼"],["mf",isMobile?"🎯":"🎯 MF"],["sepa",isMobile?"🏆":"🏆 SEPA"],["dm",isMobile?"⚡":"⚡ DM"],["vcp",isMobile?"📉":"📉 VCP"],["cf",isMobile?"📐":"📐 CF"]].map(([k,l])=><Tb key={k} label={l} active={view===k} onClick={()=>setView(k)}/>)}
          <div style={{width:1,height:18,background:"#21262d",flexShrink:0}}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍" style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:isMobile?60:100,outline:"none",flexShrink:0}}/>
          <span style={{fontSize:12,color:"#484f58",fontFamily:"'JetBrains Mono'",flexShrink:0}}>{sorted.length}</span>
        </div>
        {/* 시장필터 + DM + 정렬 (2줄) */}
        <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:2}}>
          {[["all",isMobile?"전체":"🌐 전체"],["us",isMobile?"🇺🇸"+usStocks.length:"🇺🇸 미국("+usStocks.length+")"],["kr",isMobile?"🇰🇷"+krStocks.length:"🇰🇷 한국("+krStocks.length+")"]].map(([k,l])=><Tb key={k} label={l} active={mk===k} onClick={()=>setMk(k)}/>)}
          <div style={{width:1,height:16,background:"#21262d",flexShrink:0}}/>
          <span style={{fontSize:10,color:"#484f58",flexShrink:0}}>DM:</span>
          {[["all","전체"],["strong","🔥"],["buy","🟢"],["hold","🔵"],["sell","🔴"]].map(([k,l])=>(
            <button key={k} onClick={()=>setDmFilter(k)} style={{padding:"2px 6px",borderRadius:3,border:"1px solid "+(dmFilter===k?"#bc8cff":"#21262d"),background:dmFilter===k?"#bc8cff15":"#0d1117",color:dmFilter===k?"#bc8cff":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>{l}</button>
          ))}
          <div style={{width:1,height:16,background:"#21262d",flexShrink:0}}/>
          <button onClick={()=>hs("vd")} style={{padding:"2px 6px",borderRadius:3,border:"1px solid "+(sc==="vd"?"#ff1744":"#21262d"),background:sc==="vd"?"rgba(255,23,68,.12)":"#0d1117",color:sc==="vd"?"#ff1744":"#8b949e",cursor:"pointer",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>{isMobile?"🔥순":"🔥종합판정순"}</button>
          <button onClick={()=>hs("dm")} style={{padding:"2px 6px",borderRadius:3,border:"1px solid "+(sc==="dm"?"#00e676":"#21262d"),background:sc==="dm"?"rgba(0,230,118,.12)":"#0d1117",color:sc==="dm"?"#00e676":"#8b949e",cursor:"pointer",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>{isMobile?"⚡순":"⚡DM순"}</button>
        </div>
        {/* 섹터 (가로 스크롤) */}
        <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:2}}>
          <button onClick={()=>setSec("all")} style={{padding:"2px 6px",borderRadius:3,border:"1px solid "+(sec==="all"?"#58a6ff":"#21262d"),background:sec==="all"?"rgba(88,166,255,.12)":"#0d1117",color:sec==="all"?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>전체</button>
          {sectors.map(s=><button key={s} onClick={()=>setSec(s)} style={{padding:"2px 6px",borderRadius:3,border:"1px solid "+(sec===s?"#58a6ff":"#21262d"),background:sec===s?"rgba(88,166,255,.12)":"#0d1117",color:sec===s?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:10,flexShrink:0,whiteSpace:"nowrap"}}>{s}</button>)}
        </div>
        {/* 통계 칩 (데스크탑만) */}
        {!isMobile && <div className="stat-chips" style={{display:"flex",gap:3,flexWrap:"wrap",marginBottom:4}}>
          <Chip n={upN} label="상승" color="#3fb950"/>
          <Chip n={dnN} label="하락" color="#f85149"/>
          <Chip n={buyR} label="매수준비" color="#bc8cff"/>
          <Chip n={dmBuyN} label="DM매수" color="#00e676"/>
          {bestN>0 && <Chip n={bestN} label="🔥최강" color="#ff1744"/>}
          {strongN>0 && <Chip n={strongN} label="매수" color="#00e676"/>}
        </div>}

        {/* US/KR 분리 미니 통계 */}
        {mk==="all" && <div className="market-split" style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:6,marginBottom:6}}>
          <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:8,padding:isMobile?"6px 10px":"8px 12px",display:"flex",gap:isMobile?8:12,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#4dabf7"}}>🇺🇸</span>
            <span style={{fontSize:11,color:"#484f58"}}>{usStocks.length}</span>
            <span style={{fontSize:11,color:"#3fb950"}}>▲{usStocks.filter(d=>d.c>0).length}</span>
            <span style={{fontSize:11,color:"#f85149"}}>▼{usStocks.filter(d=>d.c<0).length}</span>
            <span style={{fontSize:11,color:"#bc8cff"}}>DM:{usStocks.filter(d=>getDualMomentum(d).signalScore>=8).length}</span>
          </div>
          <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:8,padding:isMobile?"6px 10px":"8px 12px",display:"flex",gap:isMobile?8:12,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:"#ff922b"}}>🇰🇷</span>
            <span style={{fontSize:11,color:"#484f58"}}>{krStocks.length}</span>
            <span style={{fontSize:11,color:"#3fb950"}}>▲{krStocks.filter(d=>d.c>0).length}</span>
            <span style={{fontSize:11,color:"#f85149"}}>▼{krStocks.filter(d=>d.c<0).length}</span>
            <span style={{fontSize:11,color:"#bc8cff"}}>DM:{krStocks.filter(d=>getDualMomentum(d).signalScore>=8).length}</span>
          </div>
        </div>}
      </div>}

      {/* ============ Table ============ */}
      {(tab==="main"||tab==="filter") && <div className="tbl-wrap" style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 30px",overflowX:"auto"}}>
        <table style={{borderCollapse:"collapse",fontSize:isMobile?11:14,width:isMobile?"max-content":"100%"}}>
          <thead><tr>
            {!isMobile&&<TH w={30}>{"#"}</TH>}
            <TH onClick={()=>hs("n")} a={sc==="n"} sx={isMobile?{position:"sticky",left:0,zIndex:3,background:"#06080d",minWidth:90}:undefined}>종목</TH>
            {!isMobile&&<TH onClick={()=>hs("s")} a={sc==="s"}>섹터</TH>}
            <TH onClick={()=>hs("p")} a={sc==="p"} r>현재가</TH>
            <TH onClick={()=>hs("c")} a={sc==="c"} r>등락</TH>
            <TH onClick={()=>hs("f")} a={sc==="f"} c>펀더</TH>
            <TH onClick={()=>hs("vd")} a={sc==="vd"} c>종합</TH>
            {(view==="dual"||view==="mf") && <>
              <TH onClick={()=>hs("mf")} a={sc==="mf"} c>MF</TH>
              <TH c>방향</TH>
            </>}
            {(view==="dual"||view==="sepa") && <>
              <TH onClick={()=>hs("sepa")} a={sc==="sepa"} c>SEPA</TH>
              <TH c>판정</TH>
            </>}
            {(view==="dual"||view==="dm") && <>
              <TH onClick={()=>hs("dm")} a={sc==="dm"} c>DM신호</TH>
              <TH onClick={()=>hs("rs")} a={sc==="rs"} c>RS</TH>
              <TH c>추세</TH>
            </>}
            {view==="vcp" && <>
              <TH c>VCP</TH><TH c>피봇</TH><TH c>근접</TH>
            </>}
            {view==="cf" && <>
              <TH onClick={()=>hs("cf")} a={sc==="cf"} c>단기</TH>
              <TH c>중기</TH><TH c>장기</TH>
            </>}
            <TH c>등급</TH>
            <TH c>거래량</TH>
          </tr></thead>
          <tbody>
            {sorted.map((d,i)=>{
              const fl=flash[d.t];const isE=exp===d.t;
              const vd=getVerdict(d);
              const dm=getDualMomentum(d);
              return(
                <Fragment key={d.t}>
                  <tr onClick={()=>setExp(isE?null:d.t)} style={{borderBottom:"1px solid rgba(33,38,45,.4)",cursor:"pointer",background:fl==="up"?"rgba(63,185,80,.15)":fl==="dn"?"rgba(248,81,73,.15)":"transparent",transition:"background 1.5s"}}>
                    {!isMobile&&<td style={{padding:"6px 5px",color:"#484f58",fontFamily:"'JetBrains Mono'",fontSize:11}}>{i+1}</td>}
                    <td style={isMobile?{padding:"4px 3px",maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",position:"sticky",left:0,zIndex:1,background:fl==="up"?"#0f1d15":fl==="dn"?"#1d0f0f":"#06080d",borderRight:"1px solid #21262d"}:{padding:"6px 5px",maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      <span style={{fontSize:10,marginRight:2}}>{d.k?'🇰🇷':'🇺🇸'}</span>
                      {watchlist.includes(d.t)&&<span style={{fontSize:9,marginRight:1,color:'#ffd43b'}}>⭐</span>}
                      <span onClick={e=>{e.stopPropagation();handleStockClick(d);}} style={{fontWeight:vd.stars>=5?700:500,cursor:"pointer",borderBottom:"1px dashed "+(vd.stars>=5?"#ff1744":"#484f58"),fontSize:isMobile?11:13,color:vd.stars>=5?"#ff1744":undefined}}>{d.n}</span>
                      {isMobile&&<div style={{fontSize:8,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{d.t}</div>}
                      {!isMobile&&<span style={{fontSize:10,color:"#484f58",marginLeft:3,fontFamily:"'JetBrains Mono'"}}>{d.t}</span>}
                    </td>
                    {!isMobile&&<td style={{padding:"6px 5px"}}><span style={{padding:"1px 6px",borderRadius:3,fontSize:10,background:"rgba(72,79,88,.15)",color:"#484f58"}}>{d.s}</span></td>}
                    <td style={{padding:isMobile?"4px 2px":"6px 5px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:fl?700:400,color:fl?"#39d353":"#e6edf3",fontSize:isMobile?11:14}}>{d.p?fP(d.p,d.k):'-'}</td>
                    <td style={{padding:isMobile?"4px 2px":"6px 5px",textAlign:"right"}}><Chg v={d.c}/></td>
                    <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={d.f||null} g={80} r={60}/></td>
                    <td style={{textAlign:"center",padding:isMobile?"3px 4px":"4px 6px",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:isMobile?50:70}}>
                      <div style={{fontSize:isMobile?10:12,fontWeight:800,color:vd.color}}>{vd.verdict}</div>
                      <div style={{fontSize:isMobile?8:9,color:'#484f58',fontFamily:"'JetBrains Mono'"}}>{vd.totalPt}점</div>
                    </td>
                    {(view==="dual"||view==="mf") && <>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={mfTs(d)} g={2.5} r={1.5}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?10:12,padding:"1px 6px",borderRadius:3,background:mfTd(d)==="매수"?"rgba(63,185,80,.12)":"rgba(248,81,73,.12)",color:mfTd(d)==="매수"?"#3fb950":"#f85149"}}>{mfTd(d)}{mfAl(d)?" ⚡":""}</span></td>
                    </>}
                    {(view==="dual"||view==="sepa") && <>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={seTt(d)} g={8} r={7}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?10:12,padding:"1px 6px",borderRadius:3,background:seV(d)==="매수준비"?"rgba(63,185,80,.12)":seV(d)==="워치리스트"?"rgba(210,153,34,.12)":"rgba(248,81,73,.12)",color:seV(d)==="매수준비"?"#3fb950":seV(d)==="워치리스트"?"#d29922":"#f85149"}}>{seV(d)}</span></td>
                    </>}
                    {(view==="dual"||view==="dm") && <>
                      <td style={{padding:isMobile?"3px 2px":"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?9:11,padding:isMobile?"1px 4px":"2px 6px",borderRadius:4,background:dm.signalColor+"15",color:dm.signalColor,fontWeight:700,whiteSpace:"nowrap"}}>{dm.signal}</span></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={dm.rsScore} g={70} r={40}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?11:13,fontWeight:700,color:dm.trendStr>0?"#3fb950":dm.trendStr===0?"#d29922":"#f85149"}}>{dm.trendStr>0?"+":""}{dm.trendStr}</span></td>
                    </>}
                    {view==="vcp" && <>
                      <td style={{padding:"6px 5px",textAlign:"center",fontSize:isMobile?10:12,color:vcpC(vcpMt(d))}}>{vcpI(vcpMt(d))+" "+vcpMt(d)}</td>
                      <td style={{padding:"6px 5px",textAlign:"center",fontSize:isMobile?10:12,fontFamily:"'JetBrains Mono'"}}>{vcpPv(d)?fP(vcpPv(d),d.k):"-"}</td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={vcpPx(d)} g={99} r={5}/></td>
                    </>}
                    {view==="cf" && <>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={cfS(d)} g={3} r={2}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={cfM(d)} g={3} r={2}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={cfL(d)} g={3} r={2}/></td>
                    </>}
                    <td style={{padding:"6px 5px",textAlign:"center",fontSize:isMobile?9:11}}><span style={{color:grC(fundGr(d))}}>{grT(fundGr(d))}</span></td>
                    <td style={{padding:"6px 5px",textAlign:"center",fontSize:isMobile?9:11,fontFamily:"'JetBrains Mono'"}}>
                      {d._volData ? (()=>{
                        const vl=d._volData;
                        const st=vl.signalType;
                        const clr=st==='buy'?'#3fb950':st==='sell'?'#ff1744':st==='caution'?'#ffd43b':vl.volDryup?'#4dabf7':'#484f58';
                        const icon=vl.volDryup&&!vl.surgeDay?'💧':'';
                        const short=vl.signal||vl.volTrend;
                        return <div>
                          <div style={{color:clr,fontWeight:st!=='neutral'?700:400,fontSize:isMobile?8:10,lineHeight:1.2}}>{short}</div>
                          <div style={{color:'#484f58',fontSize:isMobile?7:9}}>{icon}{vl.volRatio}x</div>
                        </div>;
                      })() : <span style={{color:'#333'}}>-</span>}
                    </td>
                  </tr>
                  {isE && <tr><td colSpan={20} style={{padding:0}}><Detail d={d}/></td></tr>}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {sorted.length===0 && <div style={{textAlign:"center",padding:30,color:"#484f58",fontSize:14}}>결과 없음</div>}
      </div>}

      {/* 상세분석 모달 */}
      {showDetail && <StockDetailModal key={detailStock?.t} stock={detailStock} onClose={()=>setShowDetail(false)} isWatched={watchlist.includes(detailStock?.t)} onToggleWatch={toggleWatch}/>}

      <style>{`
        *{box-sizing:border-box}
        table tbody tr:hover{background:#161b22!important}
        ::-webkit-scrollbar{width:5px;height:5px}
        ::-webkit-scrollbar-track{background:#0d1117}
        ::-webkit-scrollbar-thumb{background:#21262d;border-radius:3px}
        thead th{position:sticky;top:0;z-index:2}
        /* 스크롤바 숨기기 (가로 스크롤 영역) */
        .tab-nav>div::-webkit-scrollbar,
        .filter-bar div[style*="overflowX"]::-webkit-scrollbar,
        .dm-filter-row::-webkit-scrollbar,
        .sector-row::-webkit-scrollbar,
        .tbl-wrap::-webkit-scrollbar{display:none}
        .tbl-wrap{scrollbar-width:thin}
        @media(max-width:768px){
          .modal-inner{max-width:100%!important;margin:0!important;border-radius:10px!important}
          .modal-overlay{padding:4px!important}
          .modal-header{padding:12px 14px!important}
          .modal-header>div:last-child{display:flex;gap:4px;align-items:center}
          .engine-grid{grid-template-columns:1fr!important;gap:8px!important}
          .rs-grid{grid-template-columns:1fr 1fr!important}
          .strategy-grid{grid-template-columns:1fr 1fr!important}
          .vol-grid{grid-template-columns:1fr 1fr!important}
          .chart-wrap{height:220px!important}
          .modal-body{padding:0 10px 14px!important}
          .tradingview-widget-container{height:220px!important}
          .dash-title{font-size:16px!important}
          .dash-header{padding:6px 12px!important}
          .tab-nav{padding:0 10px!important}
          .filter-bar{padding:0 10px 4px!important}
          .tbl-wrap{padding:0 6px 16px!important;-webkit-overflow-scrolling:touch}
          .tbl-wrap table{font-size:11px!important}
          .market-split{grid-template-columns:1fr!important;gap:4px!important}
        }
      `}</style>
    </div>
    </>
  );
}
