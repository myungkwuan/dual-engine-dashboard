import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

import D from "./data";

/* ===== 유틸 ===== */
const fP=(v,k)=>k?`₩${Math.round(v).toLocaleString()}`:`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MKT_DEFAULT={spy12m:0,spy200:"조회전",kospi12m:0,vix:0,nh:"-",ad:"-",
  sec:[["XLK",0,0],["XLC",0,0],["XLI",0,0],["XLY",0,0],["XLV",0,0],["XLU",0,0],["XLE",0,0],["XLF",0,0],["XLB",0,0],["XLP",0,0],["XLRE",0,0]],
  health:{score:0,mode:"조회전",modeColor:"#484f58",modeIcon:"⏳",modeAction:"시장필터를 먼저 실행하세요"},
  spy:{},vixData:{},kospi:{},loaded:false};

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
  const vcpScore = vm === "성숙🔥" ? 10 : vm.includes("성숙") ? 8 : vm === "형성중" ? 5 : 2;
  const hasFCF = d.b || (cfM(d) >= 2 && cfL(d) >= 2);
  const dm = getDualMomentum(d);

  /* ========================================
     100점 만점 v3 — 거래량 정식 엔진 승격
     
     점수 구조 (기본 95점 + 교차검증 ±5점)
     ① SEPA 추세 (30점) — 지금 상승추세인가?
     ② 듀얼모멘텀 (23점) — 남들보다 잘 오르고 있나?
     ③ VCP 패턴 (15점) — 매수 타이밍이 왔나?
     ④ 펀더멘탈 MF (10점) — 회사 실적이 좋은가?
     ⑤ 현금흐름 CF (5점) — 돈을 실제로 벌고 있나?
     ⑥ 거래량 (12점) — 큰손이 사고 있나 팔고 있나?
     ⑦ 교차검증 (±5점) — 엔진들이 같은 말을 하는가?
     합계: 95 + 5보너스 = 100, 최소 0
  ======================================== */

  /* ① SEPA (30점) - 지금 상승추세인가? */
  const sepaPt = st === 8 ? 30
    : st === 7 ? 22    // -8점: 1개 미충족은 큰 감점
    : st === 6 ? 15    // 아직 Stage 2 미확정
    : st === 5 ? 9     // 전환 시도 중
    : st >= 3 ? 4      // 일부 신호
    : 0;               // 하락추세

  /* ② 듀얼모멘텀 (23점) - 남들보다 잘 오르고 있나? */
  const dmPt = dm.signalScore >= 10 ? 23   // STRONG BUY: 모든 조건 충족
    : dm.signalScore >= 9 ? 19             // BUY에 가까움
    : dm.signalScore >= 7 ? 14             // BUY
    : dm.signalScore >= 5 ? 8              // CAUTION
    : dm.signalScore >= 3 ? 3              // 약세
    : 0;                                    // SELL

  /* ③ VCP (15점) - 매수 타이밍이 왔나? */
  const vcpPt = vm === "성숙🔥" ? 15      // 변동성+거래량 동시수축 → 만점
    : vm.includes("성숙") ? 11             // 성숙이지만 거래량 수축 미확인
    : vm === "형성중" ? 5                  // 수축 진행중 → 아직 매수근거 약함
    : 1;                                    // 미형성 → 거의 0

  /* ④ MF 펀더멘탈 (10점) - 회사 실적이 좋은가? */
  const mfPt = mfScore >= 85 ? 10
    : mfScore >= 75 ? 8
    : mfScore >= 65 ? 6
    : mfScore >= 55 ? 4
    : mfScore >= 40 ? 2
    : 0;

  /* ⑤ CF 현금흐름 (5점) - 돈을 실제로 벌고 있나? */
  const cfTotal = cfS(d) + cfM(d) + cfL(d);
  const cfPt = hasFCF && cfTotal >= 8 ? 5
    : hasFCF && cfTotal >= 5 ? 3
    : hasFCF ? 2
    : 0;

  /* ⑥ 거래량 (12점) - 큰손이 사고 있나 팔고 있나? */
  const volData = d._volData;
  let volPt = 6; // 기본 중립 6점
  if (volData) {
    if (volData.signalType === 'buy' && volData.surgeDay) volPt = 12;       // 바닥매집/돌파시도 + 급등일
    else if (volData.signalType === 'buy') volPt = 9;                        // 매집증가/반등시작
    else if (volData.volDryup && vm.includes("성숙")) volPt = 10;           // VCP 성숙 + 거래량 수축
    else if (volData.signalType === 'neutral') volPt = 6;                    // 중립
    else if (volData.signalType === 'caution') volPt = 3;                    // 변곡점/추세약화
    else if (volData.signalType === 'sell') volPt = volData.surgeDay ? 0 : 2; // 고점이탈/급락주의
  }

  /* ⑦ 교차검증 (±5점) - 엔진들이 같은 말을 하는가? */
  let crossPt = 0;
  const strongCount = [
    sepaPt >= 22,           // SEPA 강함 (7/8+)
    dmPt >= 14,             // DM 양호 (BUY+)
    vcpPt >= 11,            // VCP 성숙
    mfPt >= 6,              // MF 65+
  ].filter(Boolean).length;

  const weakCount = [
    sepaPt <= 4,            // SEPA 약함 (4/8 이하)
    dmPt <= 3,              // DM 약함 (SELL~)
    vcpPt <= 1,             // VCP 미형성
    mfPt <= 2,              // MF 55 미만
  ].filter(Boolean).length;

  if (strongCount >= 4) crossPt = 5;        // 올그린 → +5
  else if (strongCount >= 3) crossPt = 3;   // 3개 강 → +3
  else if (strongCount >= 2) crossPt = 1;   // 2개 강 → +1

  if (weakCount >= 3) crossPt -= 5;         // 3개+ 약함 → -5
  else if (weakCount >= 2) crossPt -= 3;    // 2개 약함 → -3
  else if (weakCount >= 1 && strongCount <= 1) crossPt -= 1; // 약점 있고 강점도 부족

  const totalPt = Math.max(0, Math.min(sepaPt + dmPt + vcpPt + mfPt + cfPt + volPt + crossPt, 100));

  let verdict, color, stars;
  if (totalPt >= 80) { verdict = '\u{1F525}최강'; color = '#ff1744'; stars = 5; }
  else if (totalPt >= 65) { verdict = '\u{1F7E2}매수'; color = '#00e676'; stars = 4; }
  else if (totalPt >= 50) { verdict = '\u{1F535}관심'; color = '#448aff'; stars = 3; }
  else if (totalPt >= 35) { verdict = '\u{1F7E1}관망'; color = '#ffd600'; stars = 2; }
  else { verdict = '\u26D4위험'; color = '#78909c'; stars = 1; }

  return { verdict, color, stars, totalPt, details: { mfGrade, mfScore, sepaLevel, vcpScore, hasFCF, dm, sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt, crossPt } };
}

/* ===== AI 분석 텍스트 생성 ===== */
function genAnalysis(d) {
  const v = getVerdict(d);
  const dm = v.details.dm;
  const lines = [];
  const st = seTt(d), vm = vcpMt(d), vol = d._volData;
  const {sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt, crossPt} = v.details;

  /* ── 한줄 요약 ── */
  const good = [], bad = [];
  if (sepaPt >= 22) good.push('추세↑'); else if (sepaPt <= 9) bad.push('추세↓');
  if (dmPt >= 14) good.push('모멘텀↑'); else if (dmPt <= 3) bad.push('모멘텀↓');
  if (vcpPt >= 11) good.push('타이밍↑'); else if (vcpPt <= 1) bad.push('패턴없음');
  if (volPt >= 9) good.push('매집↑'); else if (volPt <= 3) bad.push('매도압력');
  if (mfPt >= 6) good.push('실적↑'); else if (mfPt <= 2) bad.push('실적↓');

  let summary = '';
  if (v.stars >= 5) summary = `모든 조건이 갖춰진 최고 상태! 추세·모멘텀·패턴·실적 모두 강력.`;
  else if (v.stars >= 4) summary = good.length >= 3 ? `${good.join('+')} 동시 강세. 매수 조건 충족.` : `핵심 지표 양호. 추가 확인 후 매수 가능.`;
  else if (v.stars >= 3) summary = good.length ? `${good.join(',')}은 좋으나 ${bad.length?bad.join(',')+'이 약해':'일부 부족'}. 지켜볼 종목.` : `뚜렷한 강점 없이 보통 수준.`;
  else if (v.stars >= 2) summary = bad.length ? `${bad.join(',')} 약점. 아직 사기엔 이름.` : `전반적으로 힘이 부족. 대기.`;
  else summary = `${bad.length?bad.join(',')+' 등 ':''}여러 약점. 지금은 피하는 게 안전.`;
  lines.push(`💬 ${summary}`);

  /* ── 점수 한줄 ── */
  lines.push(`📊 ${v.totalPt}점 | SEPA ${sepaPt}/30 · DM ${dmPt}/23 · VCP ${vcpPt}/15 · MF ${mfPt}/10 · CF ${cfPt}/5 · 거래량 ${volPt}/12${crossPt?(' · 교차'+(crossPt>0?'+':'')+crossPt):''}`);

  /* ── 추세 (SEPA) ── */
  if (st === 8) lines.push(`📈 추세: 완벽한 상승추세! 모든 이동평균선이 정배열. 가장 이상적인 매수 구간.`);
  else if (st >= 7) lines.push(`📈 추세: 거의 완벽 (${st}/8). 한두 가지만 더 갖춰지면 최적 상태.`);
  else if (st >= 5) lines.push(`📈 추세: 상승 전환 시도 중 (${st}/8). 아직 확실하지 않아 기다리는 게 좋음.`);
  else if (st >= 3) lines.push(`📈 추세: 아직 약함 (${st}/8). 추세가 돌아설 때까지 관망.`);
  else lines.push(`📉 추세: 하락 중 (${st}/8). 지금 사면 물릴 가능성 높음.`);

  /* ── 모멘텀 (DM) ── */
  if (dm.signalScore >= 8) lines.push(`🚀 모멘텀: 시장평균(SPY)보다 훨씬 잘 오르고 있음! 강한 종목에 올라탈 때.`);
  else if (dm.signalScore >= 6) lines.push(`➡️ 모멘텀: 오르고는 있지만 시장평균 수준. 특별히 강하진 않음.`);
  else if (dm.signalScore >= 3) lines.push(`⚠️ 모멘텀: 시장보다 약하게 움직이는 중. 힘이 빠지고 있음.`);
  else lines.push(`🔻 모멘텀: 시장보다 많이 밀림. 약한 종목은 더 떨어지기 쉬움.`);

  /* ── VCP 타이밍 ── */
  if (vm === "성숙🔥") lines.push(`⏰ 타이밍: 변동성+거래량 동시 수축 완료! 곧 터질 준비. 피봇 돌파 시 즉시 매수.`);
  else if (vm.includes("성숙")) lines.push(`⏰ 타이밍: 패턴 거의 완성. 피봇가 근처에서 돌파를 기다리는 중.`);
  else if (vm === "형성중") lines.push(`⏳ 타이밍: 패턴 만들어가는 중. 아직 좀 더 기다려야 함.`);
  else lines.push(`❌ 타이밍: 뚜렷한 매수 패턴 없음. 패턴이 생길 때까지 대기.`);

  /* ── 거래량 ── */
  if (vol) {
    if (vol.signalType === 'buy') {
      if (vol.signal.includes('바닥')) lines.push(`💰 거래량: 바닥에서 큰손 매집 시작! 52주 위치 ${vol.positionPct}%로 싸게 모으는 중.`);
      else if (vol.signal.includes('돌파')) lines.push(`💰 거래량: 돌파하면서 거래량 폭발(${vol.volRatio}배)! 기관이 사들이는 신호.`);
      else lines.push(`💰 거래량: 오르면서 거래량도 늘어남. 건강한 상승 신호.`);
    } else if (vol.signalType === 'sell') {
      if (vol.signal.includes('고점')) lines.push(`🚨 거래량: 꼭대기에서 거래량 터지며 하락! 큰손이 팔고 나가는 중. 주의!`);
      else lines.push(`🚨 거래량: 내리면서 거래량 증가. 매도 세력이 강함. 조심!`);
    } else if (vol.signalType === 'caution') {
      if (vol.signal.includes('과열')) lines.push(`⚡ 거래량: 고점에서 거래량 급증. 과열 천장 가능성. 따라 사지 마세요!`);
      else if (vol.signal.includes('추세약화')) lines.push(`📉 거래량: 오르는데 거래량이 줄어듦. 상승 힘이 빠지는 중.`);
      else lines.push(`⚡ 거래량: 변곡점. 방향 전환 가능성 있어 지켜봐야 함.`);
    } else if (vol.volDryup) {
      lines.push(`🤫 거래량: 쥐죽은듯 조용해지는 중. 큰 움직임 전 전형적 패턴!`);
    }
  }

  /* ── 실적 (간략) ── */
  if (mfPt >= 8) lines.push(`✅ 실적: 우량! 매출·이익 성장 + 재무건전성 양호.`);
  else if (mfPt >= 6) lines.push(`✅ 실적: 양호. 대체로 괜찮지만 일부 개선 여지.`);
  else if (mfPt >= 4) lines.push(`⚠️ 실적: 보통. 펀더멘탈만으로는 확신 어려움.`);
  else if (mfPt >= 1) lines.push(`⚠️ 실적: 약함. 실적 뒷받침 부족.`);

  /* ── 최종 결론 ── */
  if (v.stars >= 5) lines.push(`\n🔥 결론: 지금 사세요! ${d.q[5]||3}% 비중, 진입가 ${fP(d.q[0]||d.p, d.k)} 부근. 손절 ${fP(d.q[1]||(d.p*0.93), d.k)} (-7%)`);
  else if (v.stars >= 4) lines.push(`\n💡 결론: 소량 먼저 사고, 돌파 확인되면 추가매수.`);
  else if (v.stars >= 3) lines.push(`\n👀 결론: 워치리스트에 넣고 조건 좋아지면 다시 보기.`);
  else if (v.stars >= 2) lines.push(`\n⏸ 결론: 아직 때가 아님. 추세 돌아설 때까지 기다리기.`);
  else lines.push(`\n🚫 결론: 사지 마세요. 더 떨어질 수 있음.`);

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
function StockDetailModal({ stock, onClose, isWatched, onToggleWatch, gradeHistory, onCalcPosition }) {
  if (!stock) return null;
  const verdict = getVerdict(stock);
  const dm = getDualMomentum(stock);
  const analysis = genAnalysis(stock);
  const radarData = [
    { label: 'MF', value: Math.min(stock.f || 0, 100), max: 100 },
    { label: 'SEPA', value: seTt(stock) * 12.5, max: 100 },
    { label: 'VCP', value: vcpMt(stock).includes("성숙") ? 80 : vcpMt(stock) === "형성중" ? 50 : 20, max: 100 },
    { label: 'RS', value: dm.rsScore, max: 100 },
    { label: 'CF', value: (cfM(stock)+cfL(stock))*16.6, max: 100 },
    { label: 'DM', value: dm.signalScore * 10, max: 100 },
  ];
  const sigInfo = seV(stock) === "매수준비"
    ? { text: '🚀 매수준비!', color: '#00ff88' }
    : seTt(stock) >= 7 ? { text: seTt(stock)+'/8', color: '#4dabf7' }
    : seTt(stock) >= 5 ? { text: seTt(stock)+'/8', color: '#ffd43b' }
    : { text: seTt(stock)+'/8', color: '#ff6b6b' };

  // ── 엔진별 해석 생성 ──
  const mfScore = stock.f || 0;
  const mfGrade = verdict.details.mfGrade;
  const mfInterp = mfScore >= 80
    ? { signal: '강력 매수 신호', color: '#3fb950', icon: '🟢',
        desc: `MF ${mfScore}점(${mfGrade}등급)으로 펀더멘탈 최상위권. EPS 성장률, 매출 증가, ROE 모두 우수한 종목. 기관 매수세가 유입될 가능성이 높고, 실적 서프라이즈 기대감이 있음.`,
        action: '✅ 펀더멘탈 기반 중장기 매수 적합' }
    : mfScore >= 65
    ? { signal: '양호', color: '#58a6ff', icon: '🔵',
        desc: `MF ${mfScore}점(${mfGrade}등급)으로 펀더멘탈 양호. 대부분의 지표가 평균 이상이나 일부 약점 존재. 기술적 타이밍과 함께 진입하면 유리.`,
        action: '🔵 기술적 매수 신호 동반 시 진입 가능' }
    : mfScore >= 50
    ? { signal: '보통', color: '#d29922', icon: '🟡',
        desc: `MF ${mfScore}점(${mfGrade}등급)으로 평균 수준. 실적이 극적으로 좋지도 나쁘지도 않음. 모멘텀이나 수급에 더 의존해야 함.`,
        action: '🟡 단독 매수 근거 부족, 다른 엔진과 교차 확인 필요' }
    : { signal: '취약', color: '#f85149', icon: '🔴',
        desc: `MF ${mfScore}점(${mfGrade}등급)으로 펀더멘탈 약세. EPS 성장 둔화, ROE 하락, 또는 매출 정체 가능성. 실적 하향 리스크 주의.`,
        action: '⛔ 펀더멘탈 기반 매수 부적합. 반등 트레이딩만 고려' };

  const sepaCount = seTt(stock);
  const sepaStage = seSt(stock);
  const sepaInterp = sepaCount === 8
    ? { signal: '완벽한 Stage 2 상승추세', color: '#00ff88', icon: '🟢',
        desc: `미너비니 8조건 모두 충족! 50일선>150일선>200일선 정배열 완성. 가격이 200일 이평 위에서 강한 상승추세 확인. 이상적인 SEPA 매수 구간.`,
        action: dm.signal==='STRONG BUY'||dm.signal==='BUY' ? '✅ SEPA+모멘텀 동시 충족! 브레이크아웃 시 적극 매수' : '✅ SEPA 완벽, 모멘텀 확인 후 매수 타이밍 포착' }
    : sepaCount >= 7
    ? { signal: 'Stage 2 근접', color: '#3fb950', icon: '🔵',
        desc: `${sepaCount}/8 조건 충족으로 상승추세 진입 직전. 이평선 정배열이 거의 완성되었으며, 남은 1~2개 조건 충족 시 이상적 매수 구간 진입.`,
        action: '🔵 워치리스트 우선순위. 조건 완성 시 즉시 매수 준비' }
    : sepaCount >= 5
    ? { signal: '추세 전환 시도 중', color: '#d29922', icon: '🟡',
        desc: `${sepaCount}/8 조건 충족. 이평선 정배열이 부분적으로 형성 중이며, 아직 확실한 Stage 2 진입은 아님. 추세 전환의 초기 신호일 수 있음.`,
        action: '🟡 관망 우선. 조건 추가 충족되는지 모니터링' }
    : { signal: '하락추세 또는 비추세', color: '#f85149', icon: '🔴',
        desc: `${sepaCount}/8 조건만 충족. 이평선 역배열 또는 횡보 구간. Stage 4(하락) 또는 Stage 1(바닥 다지기)에 해당할 가능성.`,
        action: '⛔ 매수 금지 구간. 추세 전환 확인까지 대기' };

  const dmInterp = dm.signal === 'STRONG BUY'
    ? { signal: '절대+상대 모멘텀 모두 강력', color: '#00ff88', icon: '🟢',
        desc: `3M·6M 절대수익률 양수 + SPY 대비 초과수익 확인. 시장 대비 확실한 아웃퍼폼 중이며, 추세강도 ${dm.trendStr}/3으로 상승세 견고.`,
        action: '✅ 모멘텀 최강! 추세 추종 매수 적극 권장' }
    : dm.signal === 'BUY'
    ? { signal: '모멘텀 양호', color: '#3fb950', icon: '🔵',
        desc: `절대·상대 모멘텀이 대체로 긍정적. 시장 대비 초과수익이 있으나 일부 기간에서 약세. 추세강도 ${dm.trendStr}/3.`,
        action: '🔵 매수 가능 구간. SEPA 조건과 교차 확인 권장' }
    : dm.signal === 'CAUTION'
    ? { signal: '모멘텀 혼조', color: '#d29922', icon: '🟡',
        desc: `절대/상대 모멘텀 중 일부만 충족. 상승세가 둔화되고 있거나 시장 평균 수준. 추세강도 ${dm.trendStr}/3으로 방향성 불확실.`,
        action: '🟡 신규 매수 보류. 기존 보유 시 모니터링 강화' }
    : { signal: '모멘텀 약세', color: '#f85149', icon: '🔴',
        desc: `절대·상대 모멘텀 미충족. SPY 대비 언더퍼폼이며 하락추세 가능성. 추세강도 ${dm.trendStr}/3.`,
        action: '⛔ 매수 금지. 보유 시 손절/축소 검토' };

  const vcpMaturity = vcpMt(stock);
  const vcpScore = verdict.details.vcpScore;
  const vcpT1=stock.v[0], vcpT2=stock.v[1], vcpT3=stock.v[2]||0;
  const vcpInterp = vcpMaturity === '성숙' || vcpMaturity === '성숙🔥'
    ? { signal: 'VCP 패턴 성숙 — 브레이크아웃 임박', color: '#00ff88', icon: '🟢',
        desc: `변동성 수축 완료! T1→T2→T3 수축률(${vcpT1}%→${vcpT2}%→${vcpT3||'N/A'}%)이 감소하며 에너지 응축. 베이스 ${stock.v[3]}주 형성 후 피봇 ${fP(vcpPv(stock),stock.k)} 근접(${vcpPx(stock)}%). 거래량 감소와 함께 가격 수렴 → 강한 돌파 가능성.`,
        action: '✅ 피봇가 돌파+거래량 급증 시 즉시 매수! 최적 타이밍' }
    : vcpMaturity === '형성중'
    ? { signal: 'VCP 패턴 형성 중', color: '#d29922', icon: '🟡',
        desc: `변동성 수축이 진행 중이나 아직 완성되지 않음. 수축률 T1:${vcpT1}%→T2:${vcpT2}%${vcpT3?`→T3:${vcpT3}%`:''}. 추가 수축이 필요하며, 베이스 ${stock.v[3]}주 진행 중.`,
        action: '🟡 워치리스트 등록. 수축 완료 후 피봇 돌파 대기' }
    : { signal: 'VCP 미형성', color: '#f85149', icon: '🔴',
        desc: `변동성 수축 패턴이 나타나지 않음. 수축률이 감소하지 않거나(${vcpT1}%→${vcpT2}%), 베이스 기간이 충분하지 않음. 불규칙한 가격 움직임.`,
        action: '⛔ 기술적 매수 부적합. 패턴 형성까지 대기 필요' };

  const hasFCF = verdict.details.hasFCF;
  const cfShort=cfS(stock), cfMid=cfM(stock), cfLong=cfL(stock);
  const cfTotal = cfShort+cfMid+cfLong;
  const cfInterp = hasFCF && cfTotal >= 7
    ? { signal: '현금흐름 매우 우수', color: '#3fb950', icon: '🟢',
        desc: 'FCF 양수이며 단기·중기·장기 현금흐름이 모두 양호. 기업이 투자와 주주환원을 동시에 할 수 있는 재무 여력 확보. 실적 안정성이 높아 하방 리스크가 제한적.',
        action: '✅ 재무 건전성 확인. 장기 보유에 적합한 체질' }
    : hasFCF && cfTotal >= 4
    ? { signal: '현금흐름 양호', color: '#58a6ff', icon: '🔵',
        desc: 'FCF 양수이나 일부 기간 현금흐름이 약함. 성장투자로 인한 일시적 현금 유출 가능성. 사업 확장기에 흔히 나타나는 패턴.',
        action: '🔵 기본적 안전마진 확보. 성장성 대비 허용 가능' }
    : hasFCF
    ? { signal: '현금흐름 주의', color: '#d29922', icon: '🟡',
        desc: 'FCF는 양수이나 흐름이 불안정. 단기·중기·장기 중 약한 구간 존재. 설비투자 부담이나 운영효율성 저하 가능.',
        action: '🟡 수익성 개선 여부 모니터링 필요' }
    : { signal: '현금흐름 위험', color: '#f85149', icon: '🔴',
        desc: 'FCF 음수 또는 미확인. 영업활동으로 현금을 창출하지 못하고 있을 가능성. 차입이나 증자에 의존할 수 있으며, 재무 리스크 존재.',
        action: '⛔ 재무 리스크 높음. 단기 트레이딩만 고려' };

  const rsInterp = dm.rsScore >= 80
    ? { signal: '상대강도 최상위', color: '#00ff88', icon: '🟢',
        desc: `RS ${dm.rsScore}/100으로 전체 시장 상위 ${100-dm.rsScore}%에 위치. 3M 수익률 ${dm.r3m>0?'+':''}${dm.r3m}%(SPY 대비 ${(dm.r3m-4.2).toFixed(1)}%p 초과). 기관·스마트머니가 집중 매수하는 리더 종목.`,
        action: '✅ 시장 리더! 추세 추종 매수 최적' }
    : dm.rsScore >= 60
    ? { signal: '상대강도 양호', color: '#3fb950', icon: '🔵',
        desc: `RS ${dm.rsScore}/100으로 시장 평균 이상. 3M ${dm.r3m>0?'+':''}${dm.r3m}%, 6M ${dm.r6m>0?'+':''}${dm.r6m}%로 시장 대비 초과수익 달성 중. 섹터 내 ${dm.secRank}위.`,
        action: '🔵 상승 모멘텀 확인. SEPA/VCP와 교차 확인 시 매수 유효' }
    : dm.rsScore >= 40
    ? { signal: '상대강도 보통', color: '#d29922', icon: '🟡',
        desc: `RS ${dm.rsScore}/100으로 시장 평균 수준. 뚜렷한 초과수익 없이 시장과 비슷한 움직임. 개별 모멘텀 부족.`,
        action: '🟡 모멘텀 부족. 강한 카탈리스트 없이는 매수 메리트 낮음' }
    : { signal: '상대강도 약세', color: '#f85149', icon: '🔴',
        desc: `RS ${dm.rsScore}/100으로 시장 하위권. SPY 대비 언더퍼폼이며, 자금이 빠져나가는 종목일 가능성. 섹터 순위도 ${dm.secRank}/40으로 하위.`,
        action: '⛔ 하락 리더. 매수 금지, 보유 시 비중 축소 검토' };

  const volInterp = stock._volData ? (()=>{
    const vl=stock._volData;const st=vl.signalType;
    if(st==='buy') return { signal:'거래량 매수 신호', color:'#3fb950', icon:'🟢',
      desc:`가격이 52주 기준 ${vl.positionPct}% 위치에서 5일간 ${vl.priceChg5d>0?'+':''}${vl.priceChg5d}% 상승 + 거래량 ${vl.volRatio}x 증가. 바닥권 매집 또는 돌파 시도 신호. ${vl.volDryup?'거래량 고갈(Dry-up) 후 터지는 패턴으로 강한 상승 가능성.':''}`,
      action:'✅ 스마트머니 매집 감지! 돌파 확인 시 즉시 매수' };
    if(st==='sell') return { signal:'거래량 매도 신호', color:'#f85149', icon:'🔴',
      desc:`고점권(52주 ${vl.positionPct}%)에서 가격 하락 + 거래량 ${vl.volRatio}x 증가는 기관 이탈(분배) 신호. 대량 매도세가 유입되고 있으며, 추가 하락 가능성 높음.`,
      action:'⛔ 분배(Distribution) 구간! 보유 시 즉시 손절/비중 축소' };
    if(st==='caution') return { signal:'거래량 주의 신호', color:'#ffd43b', icon:'🟡',
      desc:`거래량과 가격 방향이 혼조. 52주 ${vl.positionPct}% 위치에서 거래량 ${vl.volRatio}x. 방향이 불확실하며 변곡점에 있을 가능성.`,
      action:'🟡 관망. 가격·거래량 방향 일치 확인 후 판단' };
    return { signal:'거래량 중립', color:'#8b949e', icon:'⚪',
      desc:`거래량 비율 ${vl.volRatio}x로 평균 수준. 특별한 수급 신호 없이 평상시 거래. ${vl.volDryup?'다만 거래량 고갈(Dry-up) 감지 — VCP 수축 구간에서 긍정적 신호.':'52주 위치 '+vl.positionPct+'%.'}`,
      action:'⚪ 수급 중립. 다른 엔진 신호에 우선순위를 두고 판단' };
  })() : null;

  // ── 해석 표시 컴포넌트 ──
  const InterpBox = ({interp}) => interp ? (
    <div style={{marginTop:'8px',padding:'8px 10px',background:interp.color+'08',border:`1px solid ${interp.color}22`,borderRadius:'6px'}}>
      <div style={{fontSize:'11px',fontWeight:700,color:interp.color,marginBottom:'3px'}}>{interp.icon} {interp.signal}</div>
      <div style={{fontSize:'10px',color:'#999',lineHeight:1.6,marginBottom:'4px'}}>{interp.desc}</div>
      <div style={{fontSize:'10px',fontWeight:700,color:interp.color,lineHeight:1.4}}>{interp.action}</div>
    </div>
  ) : null;

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
              <div style={{fontSize:'12px',fontWeight:700,color:'#4dabf7',marginBottom:'10px'}}>◈ 엔진1: MF 멀티팩터 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 회사 실적이 좋은가?</span></div>
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
              <InterpBox interp={mfInterp}/>
            </div>

            {/* 엔진2: SEPA + 듀얼모멘텀 */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#69db7c',marginBottom:'10px'}}>◈ 엔진2: SEPA + 듀얼모멘텀 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 상승추세 + 남들보다 강한가?</span></div>
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
              <InterpBox interp={sepaInterp}/>
              <InterpBox interp={dmInterp}/>
            </div>

            {/* 엔진3: VCP */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#ffd43b',marginBottom:'10px'}}>◈ 엔진3: VCP 변동성수축 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 매수 타이밍이 왔나?</span> {stock._vcpDetail?<span style={{fontSize:'9px',color:'#3fb950',fontWeight:400}}>🔄 실시간 감지</span>:<span style={{fontSize:'9px',color:'#484f58',fontWeight:400}}>📋 고정값</span>}</div>
              <div style={{textAlign:'center',padding:'10px 0'}}>
                <div style={{fontSize:'32px',fontWeight:900,color:vcpMt(stock).includes("성숙")?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b'}}>
                  {vcpMt(stock).includes("성숙")?'✅':vcpMt(stock)==="형성중"?'⏳':'❌'}
                </div>
                <div style={{fontSize:'14px',fontWeight:700,color:vcpMt(stock).includes("성숙")?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',marginTop:'4px'}}>
                  {vcpMt(stock)} ({verdict.details.vcpScore}/10)
                </div>
                <div style={{margin:'8px auto',width:'80%',height:'6px',background:'#1a1a2e',borderRadius:'3px',overflow:'hidden'}}>
                  <div style={{width:`${(verdict.details.vcpScore/10)*100}%`,height:'100%',background:vcpMt(stock).includes("성숙")?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',borderRadius:'3px'}}/>
                </div>
                <div style={{marginTop:'8px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'4px'}}>
                  {[['T1',stock.v[0]],['T2',stock.v[1]],['T3',stock.v[2]]].map(([l,v])=>(
                    <div key={l} style={{padding:'4px',background:'#0d0d1a',borderRadius:'4px'}}>
                      <div style={{fontSize:'9px',color:'#666'}}>{l} 수축</div>
                      <div style={{fontSize:'13px',fontWeight:700,color:v>0?(v<=10?'#3fb950':v<=20?'#d29922':'#f85149'):'#484f58',fontFamily:"'JetBrains Mono'"}}>{v>0?`-${v}%`:'-'}</div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop:'6px',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'4px'}}>
                  <div style={{padding:'4px',background:'#0d0d1a',borderRadius:'4px'}}>
                    <div style={{fontSize:'9px',color:'#666'}}>베이스</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:'#e6edf3'}}>{stock.v[3]}주</div>
                  </div>
                  <div style={{padding:'4px',background:'#0d0d1a',borderRadius:'4px'}}>
                    <div style={{fontSize:'9px',color:'#666'}}>피봇</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:'#58a6ff',fontFamily:"'JetBrains Mono'"}}>{fP(vcpPv(stock),stock.k)}</div>
                  </div>
                  <div style={{padding:'4px',background:vcpPx(stock)<=5?'#3fb95015':'#0d0d1a',borderRadius:'4px',border:vcpPx(stock)<=5?'1px solid #3fb95033':'none'}}>
                    <div style={{fontSize:'9px',color:'#666'}}>근접도</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:vcpPx(stock)<=5?'#3fb950':vcpPx(stock)<=10?'#d29922':'#8b949e',fontFamily:"'JetBrains Mono'"}}>{vcpPx(stock)}%</div>
                  </div>
                </div>
                {stock._vcpDetail?.volDrying && <div style={{marginTop:'6px',fontSize:'10px',color:'#4dabf7',fontWeight:600}}>💧 거래량 수축 동반 — 에너지 응축 확인</div>}
              </div>
              <InterpBox interp={vcpInterp}/>
            </div>

            {/* 엔진4: CF */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#ff922b',marginBottom:'10px'}}>◈ 엔진4: CF 현금흐름 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 돈을 실제로 벌고 있나?</span></div>
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
              <InterpBox interp={cfInterp}/>
            </div>
          </div>

          {/* RS 상대강도 바 */}
          <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#bc8cff',marginBottom:'10px'}}>◈ RS 상대강도 분석 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 남들보다 잘 오르고 있나?</span></div>
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
            <InterpBox interp={rsInterp}/>
          </div>

          {/* 거래량 분석 */}
          {stock._volData && (()=>{
            const vl=stock._volData;
            const st=vl.signalType;
            const sigClr=st==='buy'?'#3fb950':st==='sell'?'#ff1744':st==='caution'?'#ffd43b':'#8b949e';
            const sigBg=st==='buy'?'#3fb95015':st==='sell'?'#ff174415':st==='caution'?'#ffd43b15':'#0d0d1a';
            return <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#ffa94d',marginBottom:'10px'}}>◈ 거래량 분석 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 큰손이 사고 있나 팔고 있나?</span></div>
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
            <InterpBox interp={volInterp}/>
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

          {/* 등급 전환 히스토리 */}
          {(()=>{
            const h=gradeHistory&&gradeHistory[stock.t];
            if(!h||!h.length)return null;
            const recent=h.slice(-6).reverse();
            return <div style={{background:'linear-gradient(135deg,#1a1200,#1a0d00)',borderRadius:'10px',padding:'16px',border:'1px solid #ff922b33',marginBottom:10}}>
              <div style={{fontSize:'12px',fontWeight:700,color:'#ff922b',marginBottom:'12px'}}>📜 등급 전환 히스토리</div>
              <div style={{position:'relative',paddingLeft:'20px'}}>
                <div style={{position:'absolute',left:'7px',top:'6px',bottom:'6px',width:'2px',background:'#21262d'}}/>
                {recent.map((r,i)=>{
                  const isUp=r.to.pt>r.from.pt;
                  const clr=r.to.grade.includes('최강')?'#ff1744':r.to.grade.includes('매수')?'#3fb950':r.to.grade.includes('관심')?'#58a6ff':r.to.grade.includes('관망')?'#ffd600':'#78909c';
                  const transRet=r.price&&stock.p?((stock.p-r.price)/r.price*100).toFixed(1):null;
                  return <div key={i} style={{position:'relative',marginBottom:'14px',paddingLeft:'16px'}}>
                    <div style={{position:'absolute',left:'-17px',top:'4px',width:'10px',height:'10px',borderRadius:'50%',background:clr,border:'2px solid #0a0a0f'}}/>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                      <div>
                        <div style={{fontSize:'11px'}}>
                          <span style={{color:isUp?'#3fb950':'#f85149'}}>{r.from.grade}({r.from.pt})</span>
                          <span style={{color:isUp?'#3fb950':'#f85149',margin:'0 4px'}}>{isUp?'→':'↓'}</span>
                          <span style={{color:clr,fontWeight:700}}>{r.to.grade}({r.to.pt})</span>
                        </div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0,marginLeft:8}}>
                        <div style={{fontSize:'10px',fontFamily:"'JetBrains Mono'",color:'#e6edf3'}}>{r.price?fP(r.price,stock.k):'-'}</div>
                        <div style={{fontSize:'9px',color:'#484f58'}}>{r.date}</div>
                      </div>
                    </div>
                    {transRet&&i===0&&<div style={{marginTop:'3px',fontSize:'9px',color:Number(transRet)>=0?'#3fb950':'#f85149',background:Number(transRet)>=0?'#3fb95010':'#f8514910',display:'inline-block',padding:'1px 6px',borderRadius:'4px'}}>현재 {transRet>0?'+':''}{transRet}% (전환 후)</div>}
                  </div>;
                })}
              </div>
            </div>;
          })()}

          {/* AI 분석 */}
          <div style={{background:'linear-gradient(135deg,#0a0a2e,#0d1830)',borderRadius:'10px',padding:'16px',border:'1px solid #1a2a4a'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#f778ba',marginBottom:'12px'}}>🤖 AI 종합 분석</div>
            
            {/* 막대그래프 시각화 */}
            {(()=>{
              const {sepaPt,dmPt,vcpPt,mfPt,cfPt,volPt,crossPt}=verdict.details;
              const bars=[
                {name:'추세',sub:'SEPA',pt:sepaPt,max:30,color:'#58a6ff',
                  tag:sepaPt>=30?'완벽':sepaPt>=22?'강력':sepaPt>=15?'양호':sepaPt>=9?'약함':'하락',
                  tagC:sepaPt>=22?'#3fb950':sepaPt>=15?'#58a6ff':sepaPt>=9?'#ffd600':'#f85149',
                  desc:sepaPt>=30?'완벽한 상승추세':sepaPt>=22?'거의 완벽':sepaPt>=15?'전환 시도중':sepaPt>=9?'아직 약함':'하락중'},
                {name:'모멘텀',sub:'DM',pt:dmPt,max:23,color:'#bc8cff',
                  tag:dmPt>=23?'최강':dmPt>=19?'강함':dmPt>=14?'양호':dmPt>=8?'보통':'약함',
                  tagC:dmPt>=14?'#3fb950':dmPt>=8?'#ffd600':'#f85149',
                  desc:dmPt>=23?'SPY 압도적 초과':dmPt>=19?'시장보다 강함':dmPt>=14?'시장 수준':dmPt>=8?'다소 약함':'시장보다 약함'},
                {name:'타이밍',sub:'VCP',pt:vcpPt,max:15,color:'#ffd43b',
                  tag:vcpPt>=15?'지금!':vcpPt>=11?'거의':vcpPt>=5?'기다려':'없음',
                  tagC:vcpPt>=11?'#3fb950':vcpPt>=5?'#ffd600':'#f85149',
                  desc:vcpPt>=15?'에너지 압축 완료!':vcpPt>=11?'패턴 거의 완성':vcpPt>=5?'만들어가는 중':'매수패턴 없음'},
                {name:'실적',sub:'MF',pt:mfPt,max:10,color:'#4dabf7',
                  tag:mfPt>=8?'우량':mfPt>=6?'양호':mfPt>=4?'보통':'약함',
                  tagC:mfPt>=6?'#3fb950':mfPt>=4?'#ffd600':'#f85149',
                  desc:mfPt>=8?'매출·이익 성장':mfPt>=6?'대체로 괜찮음':mfPt>=4?'평균 수준':'실적 부족'},
                {name:'현금',sub:'CF',pt:cfPt,max:5,color:'#ff922b',
                  tag:cfPt>=5?'좋음':cfPt>=3?'양호':cfPt>=2?'보통':'없음',
                  tagC:cfPt>=3?'#3fb950':cfPt>=2?'#ffd600':'#f85149',
                  desc:cfPt>=5?'돈 잘 벌고 있음':cfPt>=3?'대체로 양수':cfPt>=2?'일부 약함':'현금 부족'},
                {name:'거래량',sub:'VOL',pt:volPt,max:12,color:'#ffa94d',
                  tag:volPt>=10?'매집!':volPt>=7?'양호':volPt>=4?'보통':'매도',
                  tagC:volPt>=9?'#3fb950':volPt>=4?'#ffd600':'#f85149',
                  desc:volPt>=10?'큰손 매집 감지':volPt>=7?'건강한 거래량':volPt>=4?'특이사항 없음':'매도 압력'},
              ];
              return <div style={{marginBottom:'14px'}}>
                {bars.map((b,i)=>{
                  const pct=Math.max(0,Math.min((b.pt/b.max)*100,100));
                  return <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                    <div style={{width:'52px',fontSize:'10px',color:'#8b949e',textAlign:'right',lineHeight:1.2,flexShrink:0}}>
                      <div style={{color:'#ccc',fontWeight:600}}>{b.name}</div>
                      <div style={{fontSize:'8px'}}>{b.sub}</div>
                    </div>
                    <div style={{flex:1,height:'18px',background:'#161b22',borderRadius:'4px',position:'relative',overflow:'hidden',border:'1px solid #21262d'}}>
                      <div style={{width:pct+'%',height:'100%',background:`linear-gradient(90deg,${b.color}88,${b.color})`,borderRadius:'3px',transition:'width 0.5s ease'}}/>
                      <div style={{position:'absolute',top:0,left:'6px',height:'100%',display:'flex',alignItems:'center',fontSize:'9px',color:'#fff',fontWeight:600,textShadow:'0 0 3px #000'}}>{b.pt}/{b.max}</div>
                    </div>
                    <div style={{width:'44px',textAlign:'center',flexShrink:0}}>
                      <div style={{fontSize:'9px',fontWeight:700,color:b.tagC,lineHeight:1}}>{b.tag}</div>
                      <div style={{fontSize:'7px',color:'#484f58',lineHeight:1.4,marginTop:'1px'}}>{b.desc}</div>
                    </div>
                  </div>;
                })}
                {crossPt!==0&&<div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',padding:'4px 8px',background:crossPt>0?'#3fb95010':'#f8514910',borderRadius:'6px',border:'1px solid '+(crossPt>0?'#3fb95030':'#f8514930')}}>
                  <span style={{fontSize:'10px',color:'#8b949e'}}>교차검증</span>
                  <span style={{fontSize:'11px',fontWeight:700,color:crossPt>0?'#3fb950':'#f85149'}}>{crossPt>0?'+':''}{crossPt}점</span>
                  <span style={{fontSize:'9px',color:'#8b949e'}}>{crossPt>0?'여러 엔진이 동시에 좋음!':'엔진간 불일치 감점'}</span>
                </div>}
              </div>;
            })()}

            {/* 텍스트 분석 */}
            {analysis.map((line,i)=>(
              <div key={i} style={{fontSize:'13px',color:'#ccc',lineHeight:1.8,padding:'4px 0',borderBottom:i<analysis.length-1?'1px solid #1a1a2e':'none'}}>
                {line}
              </div>
            ))}
          </div>
        </div>

        <div style={{display:'flex',borderTop:'1px solid #222'}}>
          {onCalcPosition && <button onClick={()=>{onCalcPosition(stock);onClose();}} style={{flex:1,padding:'14px',background:'#bc8cff12',border:'none',borderRight:'1px solid #222',borderRadius:'0 0 0 16px',color:'#bc8cff',fontSize:'13px',cursor:'pointer',fontWeight:700}}>🧮 포지션 계산</button>}
          <button onClick={onClose} style={{flex:1,padding:'14px',background:'#1a1a2e',border:'none',borderRadius:onCalcPosition?'0 0 16px 0':'0 0 16px 16px',color:'#888',fontSize:'14px',cursor:'pointer',fontWeight:600}}>닫기 (ESC)</button>
        </div>
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
  const[posCal,setPosCal]=useState({acct:100000,risk:1,entry:0,stop:0,target1:0,target2:0,search:"",selStock:null,isKR:false});
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
  /* 시장필터 실시간 데이터 */
  const[MKT,setMKT]=useState(()=>{
    try{const c=localStorage.getItem('mkt_data');return c?JSON.parse(c):MKT_DEFAULT;}catch(e){return MKT_DEFAULT;}
  });
  const[mktRt,setMktRt]=useState("idle");
  const[mktTime,setMktTime]=useState(()=>{
    try{return localStorage.getItem('mkt_time')||'-';}catch(e){return'-';}
  });
  /* 심리지수 데이터 */
  const[SENTI,setSENTI]=useState(()=>{
    try{const c=localStorage.getItem('senti_data');return c?JSON.parse(c):{loaded:false};}catch(e){return{loaded:false};}
  });
  const[sentiRt,setSentiRt]=useState("idle");
  const[sentiTime,setSentiTime]=useState(()=>{
    try{return localStorage.getItem('senti_time')||'-';}catch(e){return'-';}
  });
  /* 등급 전환 이력 */
  const[gradeHistory,setGradeHistory]=useState(()=>{
    try{return JSON.parse(localStorage.getItem('grade_history')||'{}');}catch(e){return{};}
  });
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
    const data=JSON.stringify({w:watchlist,p:portfolio,gh:gradeHistory,ts:Date.now()});
    const code=btoa(unescape(encodeURIComponent(data)));
    navigator.clipboard.writeText(code).then(()=>setSyncMsg('✅ 코드 복사 완료! 다른 기기에서 가져오기 하세요.')).catch(()=>{
      /* 클립보드 실패 시 직접 표시 */
      setSyncInput(code);setSyncMsg('📋 아래 코드를 복사하세요:');
    });
    setTimeout(()=>setSyncMsg(''),4000);
  },[watchlist,portfolio,gradeHistory]);

  const doImport=useCallback(()=>{
    try{
      const json=JSON.parse(decodeURIComponent(escape(atob(syncInput.trim()))));
      if(json.w)setWatchlist(json.w);
      if(json.p)setPortfolio(json.p);
      if(json.gh){setGradeHistory(json.gh);try{localStorage.setItem('grade_history',JSON.stringify(json.gh));}catch(e){}}
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
    log("🔬 분석 갱신 시작 (SEPA+모멘텀+VCP자동감지+거래량, "+stocks.length+"종목)","if");
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

    /* stocks에 분석 결과 반영 (동기 계산 + state 업데이트 분리) */
    const computeUpdated = (prev) => prev.map(d=>{
      const a=allResults[d.t];
      if(!a)return d;
      return {...d,
        e: a.e || d.e,
        r: [a.r?a.r[0]:d.r[0], a.r?a.r[1]:d.r[1], d.r[2]],
        v: a.v || d.v,
        _sepaDetail: a.sepaDetail,
        _momDetail: a.momDetail,
        _vcpDetail: a.vcpDetail,
        _volData: a.volData,
      };
    });

    /* ── 등급 전환 감지 (동기) ── */
    /* stocks closure 기반으로 업데이트된 종목 배열을 동기 계산 */
    const updatedForGrade = computeUpdated(stocks);
    try{
      const prevGrades=JSON.parse(localStorage.getItem('prev_grades')||'{}');
      const history=JSON.parse(localStorage.getItem('grade_history')||'{}');
      let transCount=0;
      updatedForGrade.forEach(d=>{
        const vd=getVerdict(d);
        const newGrade=vd.verdict;
        const newPt=vd.totalPt;
        if(prevGrades[d.t]&&prevGrades[d.t].grade!==newGrade){
          if(!history[d.t])history[d.t]=[];
          if(history[d.t].length>=20)history[d.t]=history[d.t].slice(-19);
          history[d.t].push({
            date:new Date().toISOString().slice(0,10),
            from:{grade:prevGrades[d.t].grade,pt:prevGrades[d.t].pt},
            to:{grade:newGrade,pt:newPt},
            price:d.p||0
          });
          transCount++;
        }
        prevGrades[d.t]={grade:newGrade,pt:newPt};
      });
      localStorage.setItem('prev_grades',JSON.stringify(prevGrades));
      localStorage.setItem('grade_history',JSON.stringify(history));
      setGradeHistory(history);
      if(transCount>0)log(`🔄 등급 전환 ${transCount}종목 감지됨`,"ok");
    }catch(e){}

    /* state 업데이트 (React 배칭 OK) */
    setStocks(computeUpdated);

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

  /* ============ 시장필터 실시간 갱신 ============ */
  const doMarketFilter=useCallback(async()=>{
    if(mktRt==="fetching")return;
    setMktRt("fetching");
    log("🌐 시장필터 갱신 시작 (SPY+VIX+KOSPI+섹터11개)","if");
    try{
      const resp=await fetch("/api/market",{method:"GET",signal:AbortSignal.timeout(60000)});
      if(!resp.ok)throw new Error("API "+resp.status);
      const json=await resp.json();
      if(!json.data)throw new Error("No data");
      const d=json.data;
      const newMKT={
        spy12m:d.spy?.r12m||0,
        spy200:d.spy?.above200?"위":"아래",
        spy200Rising:d.spy?.sma200Rising,
        spyPrice:d.spy?.price,
        spySma200:d.spy?.sma200,
        spySma50:d.spy?.sma50,
        spy3m:d.spy?.r3m||0,
        spy6m:d.spy?.r6m||0,
        kospi12m:d.kospi?.r12m||0,
        kospiAbove200:d.kospi?.above200,
        kospiPrice:d.kospi?.price,
        vix:d.vix?.value||0,
        vixLevel:d.vix?.level||"-",
        nh:"-",ad:"-",
        sec:(d.sectors||[]).map(s=>[s.sym,s.r3m,s.r1m||0]),
        health:d.health||MKT_DEFAULT.health,
        loaded:true
      };
      setMKT(newMKT);
      try{
        localStorage.setItem('mkt_data',JSON.stringify(newMKT));
        const ts=new Date().toLocaleString("ko");
        localStorage.setItem('mkt_time',ts);
        setMktTime(ts);
      }catch(e){}
      log(`🌐 시장필터 완료! ${d.health?.mode}모드 (${d.health?.score}점) SPY:$${d.spy?.price} VIX:${d.vix?.value}`,"ok");
      setMktRt("done");
    }catch(e){
      log(`❌ 시장필터 실패: ${e.message}`,"er");
      setMktRt("error");
    }
    setTimeout(()=>setMktRt("idle"),4000);
  },[log,mktRt]);

  /* ============ 심리지수 갱신 ============ */
  const doSentiment=useCallback(async()=>{
    if(sentiRt==="fetching")return;
    setSentiRt("fetching");
    log("📊 심리지수 갱신 시작...","if");
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),35000);
      const resp=await fetch("/api/sentiment",{method:"GET",signal:controller.signal});
      clearTimeout(timer);
      if(!resp.ok){
        const txt=await resp.text().catch(()=>"");
        throw new Error("API "+resp.status+" "+txt.slice(0,100));
      }
      const json=await resp.json();
      if(!json.data)throw new Error("응답에 data 없음");
      const d={...json.data,loaded:true};
      setSENTI(d);
      try{
        localStorage.setItem('senti_data',JSON.stringify(d));
        const ts=new Date().toLocaleString("ko");
        localStorage.setItem('senti_time',ts);
        setSentiTime(ts);
      }catch(e){}
      const fg=d.fearGreed?.score;
      const pc=d.putCall?.ratio;
      log(`📊 심리지수 완료! F&G:${fg!=null?fg:'실패'}${d.fearGreed?.vixBased?' (VIX추정)':''} | P/C:${pc!=null?pc:'실패'}`,"ok");
      if(d.contrarian)log(`🧠 ${d.contrarian.signal}`,"if");
      setSentiRt("done");
    }catch(e){
      log(`❌ 심리지수 실패: ${e.message}`,"er");
      setSentiRt("error");
    }
    setTimeout(()=>setSentiRt("idle"),4000);
  },[log,sentiRt]);

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
  const bestN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars>=5).length,[filtered]);
  const strongN=useMemo(()=>filtered.filter(d=>getVerdict(d).stars===4).length,[filtered]);

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
    {id:'c6',engine:'VCP',label:'VCP 성숙?',auto:true,check:(s)=>vcpMt(s).includes("성숙")},
    {id:'c7',engine:'CF',label:'CF 중기+장기 양호?',auto:true,check:(s)=>cfM(s)>=2&&cfL(s)>=2},
    {id:'c8',engine:'시장',label:'시장필터 공격모드?',auto:true,check:()=>MKT.loaded&&MKT.health?.score>=70},
    {id:'c9',engine:'리스크',label:'손절가 설정(-7~8%)?',auto:false},
    {id:'c10',engine:'리스크',label:'투자금 5% 이하?',auto:false},
  ],[MKT]);

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
  const vcpC=m=>m.includes("성숙")?"#3fb950":m==="형성중"?"#d29922":"#f85149";
  const vcpI=m=>m.includes("성숙")?"🟢":m==="형성중"?"🟡":"🔴";

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
            {MKT.loaded && <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:5,background:MKT.health?.modeColor+"20",border:`1px solid ${MKT.health?.modeColor}44`,color:MKT.health?.modeColor}}>{MKT.health?.modeIcon} {MKT.health?.mode}</span>}
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
          {/* 헤더 + 갱신 버튼 */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontSize:18,fontWeight:800,color:"#58a6ff"}}>🌐 듀얼 모멘텀 시장 필터</div>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:10,color:"#484f58"}}>{mktTime!=='-'?`갱신: ${mktTime}`:''}</span>
              <button onClick={doMarketFilter} disabled={mktRt==="fetching"} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #58a6ff",background:mktRt==="fetching"?"#58a6ff25":"#58a6ff12",color:"#58a6ff",cursor:mktRt==="fetching"?"wait":"pointer",fontSize:12,fontWeight:700}}>
                {mktRt==="fetching"?"⏳ 분석중...":mktRt==="done"?"✅ 완료":"🌐 시장필터 갱신"}
              </button>
            </div>
          </div>

          {!MKT.loaded && <div style={{textAlign:"center",padding:20,color:"#484f58",fontSize:13}}>⏳ 시장필터를 실행하면 실시간 데이터를 가져옵니다.<br/><span style={{fontSize:11}}>SPY · VIX · KOSPI · 섹터 11개 ETF를 분석합니다 (약 15~20초)</span></div>}

          {MKT.loaded && <>
            {/* 모드 판정 대형 카드 */}
            <div style={{background:MKT.health?.modeColor+"12",border:`2px solid ${MKT.health?.modeColor}44`,borderRadius:10,padding:16,marginBottom:12,display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:44,lineHeight:1}}>{MKT.health?.modeIcon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:24,fontWeight:900,color:MKT.health?.modeColor}}>{MKT.health?.mode} 모드</div>
                <div style={{fontSize:13,color:"#e6edf3",marginTop:2}}>{MKT.health?.modeAction}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:32,fontWeight:900,color:MKT.health?.modeColor,fontFamily:"'JetBrains Mono'"}}>{MKT.health?.score}</div>
                <div style={{fontSize:10,color:"#484f58"}}>/100점</div>
              </div>
            </div>

            {/* 3열 그리드 */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:10,marginBottom:12}}>
              {/* SPY */}
              <div style={{background:"#161b22",borderRadius:8,padding:12}}>
                <div style={{fontSize:12,color:"#484f58",marginBottom:6,fontWeight:700}}>🇺🇸 S&P 500 (SPY)</div>
                <div style={{fontSize:18,fontWeight:900,fontFamily:"'JetBrains Mono'",color:"#e6edf3"}}>${MKT.spyPrice}</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginTop:6,fontSize:11}}>
                  <div>200MA: <b style={{color:MKT.spy200==="위"?"#3fb950":"#f85149"}}>{MKT.spy200} {MKT.spy200==="위"?"✅":"❌"}</b></div>
                  <div>200MA추세: <b style={{color:MKT.spy200Rising?"#3fb950":"#f85149"}}>{MKT.spy200Rising?"상승✅":"하락❌"}</b></div>
                  <div>12M: <b style={{color:MKT.spy12m>0?"#3fb950":"#f85149"}}>{MKT.spy12m>0?"+":""}{MKT.spy12m}%</b></div>
                  <div>6M: <b style={{color:MKT.spy6m>0?"#3fb950":"#f85149"}}>{MKT.spy6m>0?"+":""}{MKT.spy6m}%</b></div>
                  <div>3M: <b style={{color:MKT.spy3m>0?"#3fb950":"#f85149"}}>{MKT.spy3m>0?"+":""}{MKT.spy3m}%</b></div>
                </div>
              </div>
              {/* VIX */}
              <div style={{background:"#161b22",borderRadius:8,padding:12}}>
                <div style={{fontSize:12,color:"#484f58",marginBottom:6,fontWeight:700}}>📊 공포지수 (VIX)</div>
                <div style={{fontSize:18,fontWeight:900,fontFamily:"'JetBrains Mono'",color:MKT.vix<20?"#3fb950":MKT.vix<25?"#ffd600":MKT.vix<30?"#ff922b":"#f85149"}}>{MKT.vix}</div>
                <div style={{fontSize:11,color:"#8b949e",marginTop:4}}>수준: <b style={{color:MKT.vix<20?"#3fb950":MKT.vix<25?"#ffd600":"#f85149"}}>{MKT.vixLevel}</b></div>
                <div style={{marginTop:6,height:6,background:"#21262d",borderRadius:3,overflow:"hidden"}}>
                  <div style={{height:"100%",width:Math.min(MKT.vix/40*100,100)+"%",background:MKT.vix<20?"#3fb950":MKT.vix<25?"#ffd600":MKT.vix<30?"#ff922b":"#f85149",borderRadius:3}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#484f58",marginTop:2}}><span>0</span><span>15</span><span>20</span><span>25</span><span>30+</span></div>
              </div>
              {/* KOSPI */}
              <div style={{background:"#161b22",borderRadius:8,padding:12}}>
                <div style={{fontSize:12,color:"#484f58",marginBottom:6,fontWeight:700}}>🇰🇷 KOSPI</div>
                <div style={{fontSize:18,fontWeight:900,fontFamily:"'JetBrains Mono'",color:"#e6edf3"}}>{MKT.kospiPrice?MKT.kospiPrice.toLocaleString():"-"}</div>
                <div style={{fontSize:11,marginTop:4}}>200MA: <b style={{color:MKT.kospiAbove200?"#3fb950":"#f85149"}}>{MKT.kospiAbove200?"위 ✅":"아래 ❌"}</b></div>
                <div style={{fontSize:11}}>12M 수익률: <b style={{color:MKT.kospi12m>0?"#3fb950":"#f85149"}}>{MKT.kospi12m>0?"+":""}{MKT.kospi12m}%</b></div>
              </div>
            </div>

            {/* 건강도 체크리스트 */}
            {MKT.health?.details && <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#58a6ff",marginBottom:8}}>🩺 시장 건강도 체크리스트</div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:6}}>
                {[
                  ["SPY > 200MA",MKT.health.details.spyAbove200],
                  ["200MA 상승추세",MKT.health.details.spy200Rising],
                  ["골든크로스(50>200)",MKT.health.details.spyGoldenCross],
                  ["SPY 12M 양수",MKT.health.details.spy12mPositive],
                  ["VIX < 25",MKT.health.details.vixLow],
                  ["KOSPI > 200MA",MKT.health.details.kospiAbove200],
                  ["섹터 브레드스",MKT.health.details.sectorBreadth+" 상승"],
                ].map(([label,ok])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:6,background:ok?"#3fb95010":"#f8514910",border:`1px solid ${ok?"#3fb95022":"#f8514922"}`}}>
                    <span style={{fontSize:12}}>{ok?"✅":"❌"}</span>
                    <span style={{fontSize:11,color:ok?"#3fb950":"#f85149"}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>}

            {/* 섹터 순위 */}
            {(()=>{const secNm={XLK:"기술",XLC:"커뮤니케이션",XLI:"산업재",XLY:"임의소비",XLV:"헬스케어",XLU:"유틸리티",XLE:"에너지",XLF:"금융",XLB:"소재",XLP:"필수소비",XLRE:"부동산"};
            const sec3m=[...MKT.sec].sort((a,b)=>b[1]-a[1]);
            const sec1m=[...MKT.sec].sort((a,b)=>(b[2]||0)-(a[2]||0));
            const renderSec=(arr,idx)=>arr.map(([s,v3,v1],i)=>{const v=idx===1?v3:(v1||0);return(
              <span key={s} style={{padding:"3px 10px",borderRadius:8,fontSize:12,background:v>0?(i<3?"rgba(63,185,80,.15)":"rgba(63,185,80,.06)"):"rgba(248,81,73,.08)",border:"1px solid "+(v>0?(i<3?"#3fb950":"#3fb95044"):"#f8514933"),color:v>0?(i<3?"#3fb950":"#8b949e"):"#f85149",fontWeight:i<3?700:400}}>
                {i<3?["🥇","🥈","🥉"][i]+" ":""}{s}<span style={{fontSize:9,color:"#8b949e",marginLeft:2}}>{secNm[s]||""}</span> <span style={{fontFamily:"'JetBrains Mono'"}}>{v>0?"+":""}{v}%</span>
              </span>);});
            return <>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:13,color:"#484f58",marginBottom:6,fontWeight:700}}>📊 상대 모멘텀 섹터 순위 (3M 수익률)</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{renderSec(sec3m,1)}</div>
            </div>
            <div>
              <div style={{fontSize:13,color:"#484f58",marginBottom:6,fontWeight:700}}>📊 상대 모멘텀 섹터 순위 (1M 수익률)</div>
              <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>{renderSec(sec1m,2)}</div>
            </div>
            </>;})()}
          </>}

          {/* ═══════ 심리지수 섹션 (미국주식 전용) ═══════ */}
          <div style={{marginTop:14,borderTop:"1px solid #21262d",paddingTop:14}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <div style={{fontSize:16,fontWeight:800,color:"#f778ba"}}>🧠 시장 심리지수 <span style={{fontSize:10,color:"#484f58",fontWeight:400}}>(미국주식 전용)</span></div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:10,color:"#484f58"}}>{sentiTime!=='-'?sentiTime:''}</span>
                <button onClick={doSentiment} disabled={sentiRt==="fetching"} style={{padding:"5px 12px",borderRadius:6,border:"1px solid #f778ba",background:sentiRt==="fetching"?"#f778ba25":"#f778ba12",color:"#f778ba",cursor:sentiRt==="fetching"?"wait":"pointer",fontSize:11,fontWeight:700}}>
                  {sentiRt==="fetching"?"⏳ 수집중...":sentiRt==="done"?"✅":"🧠 심리지수 갱신"}
                </button>
              </div>
            </div>

            {/* 역발상 시그널 배너 */}
            {SENTI.contrarian && <div style={{background:SENTI.contrarian.color+"12",border:`2px solid ${SENTI.contrarian.color}44`,borderRadius:8,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
              <span style={{fontSize:28}}>{SENTI.contrarian.icon}</span>
              <div>
                <div style={{fontSize:14,fontWeight:800,color:SENTI.contrarian.color}}>역발상 시그널</div>
                <div style={{fontSize:12,color:"#e6edf3"}}>{SENTI.contrarian.signal}</div>
              </div>
            </div>}

            {/* 자동 수집 지표 3개 */}
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10,marginBottom:12}}>
              {/* CNN F&G */}
              <div style={{background:"#161b22",borderRadius:8,padding:12}}>
                <div style={{fontSize:11,color:"#484f58",marginBottom:6,fontWeight:700}}>📈 CNN Fear & Greed</div>
                {SENTI.fearGreed?.score!=null ? <>
                  <div style={{fontSize:28,fontWeight:900,fontFamily:"'JetBrains Mono'",color:SENTI.fearGreed.score<=25?"#3fb950":SENTI.fearGreed.score<=45?"#58a6ff":SENTI.fearGreed.score<=55?"#ffd600":SENTI.fearGreed.score<=75?"#ff922b":"#f85149",textAlign:"center"}}>{SENTI.fearGreed.score}</div>
                  <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:SENTI.fearGreed.score<=25?"#3fb950":SENTI.fearGreed.score<=45?"#58a6ff":SENTI.fearGreed.score<=55?"#ffd600":SENTI.fearGreed.score<=75?"#ff922b":"#f85149"}}>{SENTI.fearGreed.level}</div>
                  <div style={{marginTop:6,height:8,background:"linear-gradient(90deg,#3fb950,#ffd600,#f85149)",borderRadius:4,position:"relative"}}>
                    <div style={{position:"absolute",left:SENTI.fearGreed.score+"%",top:-3,width:3,height:14,background:"#fff",borderRadius:2,transform:"translateX(-50%)"}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#484f58",marginTop:2}}><span>극단공포</span><span>중립</span><span>극단탐욕</span></div>
                  {SENTI.fearGreed.vixBased && <div style={{fontSize:8,color:"#ff922b",marginTop:3,textAlign:"center"}}>⚠️ VIX({SENTI.fearGreed.vixValue}) 기반 추정</div>}
                  {SENTI.fearGreed.prev!=null && <div style={{fontSize:9,color:"#484f58",marginTop:4,textAlign:"center"}}>전일:{SENTI.fearGreed.prev}{SENTI.fearGreed.weekAgo!=null?' | 1주전:'+SENTI.fearGreed.weekAgo:''}{SENTI.fearGreed.monthAgo!=null?' | 1달전:'+SENTI.fearGreed.monthAgo:''}</div>}
                </> : <div style={{textAlign:"center",color:"#484f58",fontSize:11,padding:10}}>{SENTI.loaded?"❌ 수집 실패":"🧠 갱신 버튼을 눌러주세요"}{SENTI.fearGreed?.error?<div style={{fontSize:9,marginTop:4,color:"#f85149"}}>{SENTI.fearGreed.error}</div>:null}</div>}
              </div>

              {/* Put/Call Ratio */}
              <div style={{background:"#161b22",borderRadius:8,padding:12}}>
                <div style={{fontSize:11,color:"#484f58",marginBottom:6,fontWeight:700}}>📊 Put/Call Ratio</div>
                {SENTI.putCall?.ratio!=null ? <>
                  <div style={{fontSize:28,fontWeight:900,fontFamily:"'JetBrains Mono'",color:SENTI.putCall.ratio>=1.0?"#3fb950":SENTI.putCall.ratio>=0.85?"#ffd600":SENTI.putCall.ratio>=0.7?"#ff922b":"#f85149",textAlign:"center"}}>{SENTI.putCall.ratio}</div>
                  <div style={{textAlign:"center",fontSize:11,fontWeight:700,color:SENTI.putCall.ratio>=1.0?"#3fb950":SENTI.putCall.ratio>=0.85?"#ffd600":SENTI.putCall.ratio>=0.7?"#ff922b":"#f85149"}}>{SENTI.putCall.level}</div>
                  <div style={{marginTop:6,display:"flex",justifyContent:"space-between",fontSize:9,color:"#8b949e"}}>
                    <span>0.7↓ 낙관</span><span>0.85 중립</span><span>1.0↑ 공포</span>
                  </div>
                  {SENTI.putCall.vixCur && <div style={{fontSize:9,color:"#484f58",marginTop:4,textAlign:"center"}}>VIX:{SENTI.putCall.vixCur} (20일평균:{SENTI.putCall.vixAvg20||'-'})</div>}
                  {SENTI.putCall.note && <div style={{fontSize:8,color:"#ff922b",marginTop:2,textAlign:"center"}}>⚠️ {SENTI.putCall.note}</div>}
                </> : <div style={{textAlign:"center",color:"#484f58",fontSize:11,padding:10}}>{SENTI.loaded?"❌ 수집 실패":"🧠 갱신 필요"}</div>}
              </div>
            </div>

            {/* ── 종합 심리 판정 (자동수집만) ── */}
            {SENTI.loaded && (()=>{
              const scores=[];
              if(SENTI.fearGreed?.score!=null)scores.push({n:"F&G",v:SENTI.fearGreed.score,w:3});
              if(SENTI.putCall?.ratio!=null)scores.push({n:"P/C",v:SENTI.putCall.ratio>=1?20:SENTI.putCall.ratio>=0.85?40:SENTI.putCall.ratio>=0.7?60:80,w:2});
              if(scores.length===0)return null;
              const totalW=scores.reduce((a,s)=>a+s.w,0);
              const composite=Math.round(scores.reduce((a,s)=>a+s.v*s.w,0)/totalW);
              const cColor=composite<=25?"#3fb950":composite<=40?"#58a6ff":composite<=60?"#ffd600":composite<=75?"#ff922b":"#f85149";
              const cLabel=composite<=25?"극단적 공포 → 적극 매수":composite<=40?"공포 → 분할 매수":composite<=60?"중립 → 전략 유지":composite<=75?"탐욕 → 비중 축소":"극단적 탐욕 → 이익실현";
              return <div style={{marginTop:12,background:cColor+"12",border:`2px solid ${cColor}44`,borderRadius:10,padding:14}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:800,color:cColor}}>🧠 종합 심리 판정</div>
                    <div style={{fontSize:12,color:"#e6edf3",marginTop:2}}>{cLabel}</div>
                    <div style={{fontSize:9,color:"#484f58",marginTop:4}}>가중평균: {scores.map(s=>s.n).join(" + ")} ({scores.length}개 지표)</div>
                  </div>
                  <div style={{textAlign:"center"}}>
                    <div style={{fontSize:36,fontWeight:900,color:cColor,fontFamily:"'JetBrains Mono'"}}>{composite}</div>
                    <div style={{fontSize:9,color:"#484f58"}}>/100</div>
                  </div>
                </div>
                <div style={{marginTop:8,height:10,background:"linear-gradient(90deg,#3fb950,#58a6ff 25%,#ffd600 50%,#ff922b 75%,#f85149)",borderRadius:5,position:"relative"}}>
                  <div style={{position:"absolute",left:composite+"%",top:-4,width:4,height:18,background:"#fff",borderRadius:2,transform:"translateX(-50%)",boxShadow:"0 0 6px rgba(255,255,255,.5)"}}/>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:8,color:"#484f58",marginTop:3}}><span>극단공포(매수↑)</span><span>중립</span><span>극단탐욕(매도↓)</span></div>
              </div>;
            })()}
          </div>
        </div>
      </div>}

      {/* ============ 포지션 계산기 ============ */}
      {tab==="calc" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <div style={{fontSize:18,fontWeight:800,color:"#bc8cff",marginBottom:10}}>🧮 포지션 사이징 계산기</div>

          {/* 종목 검색 + 선택 */}
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#484f58",marginBottom:4,fontWeight:600}}>종목 선택 (선택하면 진입가·손절가 자동입력)</div>
            <input type="text" value={posCal.search||""} onChange={e=>setPosCal(p=>({...p,search:e.target.value}))} placeholder="🔍 종목명 또는 티커 검색..." style={{width:"100%",padding:"8px 10px",background:"#161b22",border:"1px solid #21262d",borderRadius:posCal.search?"6px 6px 0 0":"6px",color:"#e6edf3",fontSize:13,outline:"none"}}/>
            {posCal.search && <div style={{maxHeight:150,overflowY:"auto",background:"#161b22",border:"1px solid #21262d",borderTop:"none",borderRadius:"0 0 6px 6px"}}>
              {stocks.filter(d=>{const ql=(posCal.search||"").toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}).slice(0,10).map(d=>{
                const vd=getVerdict(d);
                return <div key={d.t} onClick={()=>{
                  const isKR=d.k;
                  const entryP=d.q[0]||vcpPv(d)||d.p||0;
                  const stopP=d.q[1]||(entryP*0.93);
                  const t1=d.q[2]||(entryP*1.15);
                  const t2=d.q[3]||(entryP*1.30);
                  setPosCal(p=>({...p,search:"",selStock:d,entry:+entryP.toFixed(isKR?0:2),stop:+stopP.toFixed(isKR?0:2),target1:+t1.toFixed(isKR?0:2),target2:+t2.toFixed(isKR?0:2),isKR}));
                }} style={{padding:"6px 10px",cursor:"pointer",borderBottom:"1px solid #21262d15",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onMouseOver={e=>e.currentTarget.style.background="#21262d"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                  <div>
                    <span style={{fontSize:12,fontWeight:600,color:"#e6edf3"}}>{d.k?"🇰🇷":"🇺🇸"} {d.n}</span>
                    <span style={{fontSize:10,color:"#484f58",marginLeft:4}}>{d.t}</span>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    <span style={{fontSize:11,fontWeight:700,color:vd.color}}>{vd.verdict}</span>
                    <span style={{fontSize:11,fontFamily:"'JetBrains Mono'",color:"#8b949e"}}>{d.p?fP(d.p,d.k):"-"}</span>
                  </div>
                </div>;
              })}
            </div>}
          </div>

          {/* 선택된 종목 정보 카드 */}
          {posCal.selStock && (()=>{
            const s=posCal.selStock;
            const vd=getVerdict(s);
            const dm=getDualMomentum(s);
            const pivot=vcpPv(s);
            const proxPct=vcpPx(s);
            return <div style={{background:vd.color+"08",border:`1px solid ${vd.color}33`,borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                <div>
                  <span style={{fontSize:16,fontWeight:800,color:"#e6edf3"}}>{s.k?"🇰🇷":"🇺🇸"} {s.n}</span>
                  <span style={{fontSize:11,color:"#484f58",marginLeft:6}}>{s.t} · {s.s}</span>
                </div>
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <span style={{fontSize:13,fontWeight:800,color:vd.color}}>{vd.verdict} {vd.totalPt}점</span>
                  <button onClick={()=>setPosCal(p=>({...p,selStock:null,entry:0,stop:0,target1:0,target2:0}))} style={{padding:"2px 8px",borderRadius:4,border:"1px solid #484f58",background:"transparent",color:"#484f58",cursor:"pointer",fontSize:10}}>✕</button>
                </div>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))",gap:6,fontSize:11}}>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>현재가</div>
                  <div style={{fontWeight:700,fontFamily:"'JetBrains Mono'",color:"#e6edf3"}}>{s.p?fP(s.p,s.k):"-"}</div>
                </div>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>VCP피봇</div>
                  <div style={{fontWeight:700,fontFamily:"'JetBrains Mono'",color:"#58a6ff"}}>{pivot?fP(pivot,s.k):"-"}</div>
                </div>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>피봇근접</div>
                  <div style={{fontWeight:700,color:proxPct<3?"#3fb950":proxPct<5?"#ffd600":"#8b949e"}}>{proxPct!=null?proxPct+"%":"-"}</div>
                </div>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>SEPA</div>
                  <div style={{fontWeight:700,color:seTt(s)>=8?"#3fb950":seTt(s)>=7?"#d29922":"#f85149"}}>{seTt(s)}/8</div>
                </div>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>VCP</div>
                  <div style={{fontWeight:700,color:vcpMt(s).includes("성숙")?"#3fb950":"#d29922"}}>{vcpMt(s)}</div>
                </div>
                <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                  <div style={{color:"#484f58",fontSize:9}}>DM</div>
                  <div style={{fontWeight:700,color:dm.signalColor}}>{dm.signal}</div>
                </div>
              </div>
              {/* 자동입력 안내 */}
              <div style={{marginTop:8,fontSize:10,color:"#8b949e"}}>
                💡 진입: {s.q[0]?fP(s.q[0],s.k):"피봇/현재가"} | 손절: {s.q[1]?fP(s.q[1],s.k):"-7%"} | 1차: {s.q[2]?fP(s.q[2],s.k):"+15%"} | 2차: {s.q[3]?fP(s.q[3],s.k):"+30%"}
                {s.q[4]?` | 설정R:R ${s.q[4]}:1`:""}
              </div>
            </div>;
          })()}

          {/* 입력 필드 6개 */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr 1fr 1fr 1fr",gap:8}}>
            {[
              ["계좌"+(posCal.isKR?"(₩)":"($)"),"acct"],
              ["리스크(%)","risk"],
              ["진입가","entry"],
              ["손절가","stop"],
              ["1차목표","target1"],
              ["2차목표","target2"]
            ].map(([l,k])=>
              <div key={k}><div style={{fontSize:12,color:k.includes("target")?"#3fb950":"#484f58",marginBottom:2,fontWeight:k.includes("target")?700:400}}>{l}</div>
                <input type="number" value={posCal[k]} onChange={e=>setPosCal(p=>({...p,[k]:+e.target.value||0}))}
                  style={{width:"100%",padding:"6px 8px",borderRadius:5,border:"1px solid "+(k.includes("target")?"#3fb95033":"#21262d"),background:k.includes("target")?"#3fb95008":"#161b22",color:"#e6edf3",fontSize:15,outline:"none",fontFamily:"'JetBrains Mono'"}}/></div>
            )}
          </div>

          {/* 퀵버튼 행 */}
          {posCal.entry>0 && <div style={{display:"flex",gap:12,marginTop:6,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#f85149",fontWeight:600}}>손절:</span>
              {[-5,-7,-8,-10].map(pct=>{
                const val=+(posCal.entry*(1+pct/100)).toFixed(posCal.isKR?0:2);
                return <button key={pct} onClick={()=>setPosCal(p=>({...p,stop:val}))} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(posCal.stop===val?"#f85149":"#21262d"),background:posCal.stop===val?"#f8514920":"#161b22",color:posCal.stop===val?"#f85149":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600}}>{pct}%</button>;
              })}
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#3fb950",fontWeight:600}}>1차:</span>
              {[10,15,20,25].map(pct=>{
                const val=+(posCal.entry*(1+pct/100)).toFixed(posCal.isKR?0:2);
                return <button key={pct} onClick={()=>setPosCal(p=>({...p,target1:val}))} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(posCal.target1===val?"#3fb950":"#21262d"),background:posCal.target1===val?"#3fb95020":"#161b22",color:posCal.target1===val?"#3fb950":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600}}>+{pct}%</button>;
              })}
            </div>
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <span style={{fontSize:10,color:"#58a6ff",fontWeight:600}}>2차:</span>
              {[25,30,40,50].map(pct=>{
                const val=+(posCal.entry*(1+pct/100)).toFixed(posCal.isKR?0:2);
                return <button key={pct} onClick={()=>setPosCal(p=>({...p,target2:val}))} style={{padding:"3px 7px",borderRadius:4,border:"1px solid "+(posCal.target2===val?"#58a6ff":"#21262d"),background:posCal.target2===val?"#58a6ff20":"#161b22",color:posCal.target2===val?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600}}>+{pct}%</button>;
              })}
            </div>
          </div>}

          {/* ═══ 결과 ═══ */}
          {(()=>{
            const{acct,risk,entry,stop,target1,target2,isKR}=posCal;
            if(!entry||!stop||entry<=stop)return <div style={{marginTop:10,padding:16,background:"#161b22",borderRadius:8,textAlign:"center",color:"#484f58",fontSize:13}}>진입가와 손절가를 입력하면 계산됩니다</div>;
            const cur=isKR?"₩":"$";
            const fN=v=>isKR?cur+Math.round(v).toLocaleString():cur+v.toLocaleString(undefined,{maximumFractionDigits:0});
            const ra=acct*(risk/100);
            const ps=entry-stop;
            const sh=Math.floor(ra/ps);
            const sz=sh*entry;
            const ml=sh*ps;
            const pc=(sz/acct*100);
            const stopPct=((stop-entry)/entry*100);

            // 목표가 계산
            const t1Pct=target1>entry?((target1-entry)/entry*100):0;
            const t2Pct=target2>entry?((target2-entry)/entry*100):0;
            const t1Profit=target1>entry?sh*(target1-entry):0;
            const t2Profit=target2>entry?sh*(target2-entry):0;
            const rr1=target1>entry&&ps>0?(target1-entry)/ps:0;
            const rr2=target2>entry&&ps>0?(target2-entry)/ps:0;

            // 분할매도 시나리오: 1차에서 50% 매도, 나머지 2차
            const halfSh=Math.floor(sh/2);
            const restSh=sh-halfSh;
            const splitProfit=target1>entry&&target2>entry?(halfSh*(target1-entry)+restSh*(target2-entry)):0;

            return <>
              {/* 기본 포지션 */}
              <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(3,1fr)":"repeat(6,1fr)",gap:6,marginTop:10}}>
                {[
                  ["매수수량",sh+"주","#bc8cff"],
                  ["투자규모",fN(sz),"#58a6ff"],
                  ["비중",pc.toFixed(1)+"%",pc>20?"#f85149":pc>10?"#ffd600":"#3fb950"],
                  ["최대손실",fN(ml),"#f85149"],
                  ["손절폭",stopPct.toFixed(1)+"%","#ff922b"],
                  ["손익비(1차)",rr1?rr1.toFixed(1)+":1":"-",rr1>=3?"#3fb950":rr1>=2?"#ffd600":"#f85149"],
                ].map(([l,v,c])=>
                  <div key={l} style={{background:"#161b22",borderRadius:6,padding:8,textAlign:"center"}}>
                    <div style={{fontSize:10,color:"#484f58"}}>{l}</div>
                    <div style={{fontSize:16,fontWeight:800,color:c,fontFamily:"'JetBrains Mono'"}}>{v}</div>
                  </div>
                )}
              </div>

              {/* 목표가 이익 분석 */}
              {(target1>entry||target2>entry) && <div style={{background:"#161b22",borderRadius:8,padding:12,marginTop:10,border:"1px solid #3fb95022"}}>
                <div style={{fontSize:12,fontWeight:800,color:"#3fb950",marginBottom:10}}>🎯 목표가 이익 분석</div>

                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
                  {/* 1차 목표 */}
                  {target1>entry && <div style={{background:"#0d1117",borderRadius:8,padding:12,border:"1px solid #3fb95033"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#3fb950"}}>🎯 1차 목표</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>{fN(target1)}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>상승폭</div>
                        <div style={{fontSize:14,fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>+{t1Pct.toFixed(1)}%</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>예상이익</div>
                        <div style={{fontSize:14,fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>{fN(t1Profit)}</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>손익비</div>
                        <div style={{fontSize:14,fontWeight:800,color:rr1>=3?"#3fb950":rr1>=2?"#ffd600":"#f85149",fontFamily:"'JetBrains Mono'"}}>{rr1.toFixed(1)}:1</div>
                      </div>
                    </div>
                  </div>}

                  {/* 2차 목표 */}
                  {target2>entry && <div style={{background:"#0d1117",borderRadius:8,padding:12,border:"1px solid #58a6ff33"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#58a6ff"}}>🚀 2차 목표</span>
                      <span style={{fontSize:14,fontWeight:800,color:"#58a6ff",fontFamily:"'JetBrains Mono'"}}>{fN(target2)}</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>상승폭</div>
                        <div style={{fontSize:14,fontWeight:800,color:"#58a6ff",fontFamily:"'JetBrains Mono'"}}>+{t2Pct.toFixed(1)}%</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>예상이익</div>
                        <div style={{fontSize:14,fontWeight:800,color:"#58a6ff",fontFamily:"'JetBrains Mono'"}}>{fN(t2Profit)}</div>
                      </div>
                      <div style={{textAlign:"center"}}>
                        <div style={{fontSize:9,color:"#484f58"}}>손익비</div>
                        <div style={{fontSize:14,fontWeight:800,color:rr2>=3?"#3fb950":rr2>=2?"#ffd600":"#f85149",fontFamily:"'JetBrains Mono'"}}>{rr2.toFixed(1)}:1</div>
                      </div>
                    </div>
                  </div>}
                </div>

                {/* 리스크:리워드 비주얼 바 */}
                {target1>entry && <div style={{marginTop:12}}>
                  <div style={{fontSize:10,color:"#484f58",marginBottom:4,fontWeight:600}}>리스크 : 리워드 시각화</div>
                  <div style={{position:"relative",height:32,background:"#21262d",borderRadius:6,overflow:"hidden"}}>
                    {/* 손실 영역 (왼쪽) */}
                    <div style={{position:"absolute",left:0,top:0,height:"100%",width:Math.min(Math.abs(stopPct)/(Math.abs(stopPct)+(target2>entry?t2Pct:t1Pct))*100,50)+"%",background:"linear-gradient(90deg,#f85149,#f8514966)",borderRadius:"6px 0 0 6px",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#fff",textShadow:"0 0 4px #000"}}>{stopPct.toFixed(1)}%</span>
                    </div>
                    {/* 1차 목표 영역 */}
                    <div style={{position:"absolute",left:Math.min(Math.abs(stopPct)/(Math.abs(stopPct)+(target2>entry?t2Pct:t1Pct))*100,50)+"%",top:0,height:"100%",width:t1Pct/(Math.abs(stopPct)+(target2>entry?t2Pct:t1Pct))*100+"%",background:"linear-gradient(90deg,#3fb95066,#3fb950)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#fff",textShadow:"0 0 4px #000"}}>+{t1Pct.toFixed(0)}%</span>
                    </div>
                    {/* 2차 목표 영역 */}
                    {target2>entry&&t2Pct>t1Pct && <div style={{position:"absolute",left:(Math.min(Math.abs(stopPct)/(Math.abs(stopPct)+t2Pct)*100,50)+t1Pct/(Math.abs(stopPct)+t2Pct)*100)+"%",top:0,height:"100%",width:(t2Pct-t1Pct)/(Math.abs(stopPct)+t2Pct)*100+"%",background:"linear-gradient(90deg,#58a6ff66,#58a6ff)",borderRadius:"0 6px 6px 0",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{fontSize:10,fontWeight:700,color:"#fff",textShadow:"0 0 4px #000"}}>+{t2Pct.toFixed(0)}%</span>
                    </div>}
                    {/* 진입점 마커 */}
                    <div style={{position:"absolute",left:Math.min(Math.abs(stopPct)/(Math.abs(stopPct)+(target2>entry?t2Pct:t1Pct))*100,50)+"%",top:0,height:"100%",width:2,background:"#fff",zIndex:1}}/>
                  </div>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:9,color:"#484f58",marginTop:2}}>
                    <span>손절 {fN(stop)}</span>
                    <span>진입 {fN(entry)}</span>
                    {target2>entry?<span>2차 {fN(target2)}</span>:<span>1차 {fN(target1)}</span>}
                  </div>
                </div>}

                {/* 분할매도 시나리오 */}
                {target1>entry&&target2>entry && <div style={{marginTop:10,background:"#0d1117",borderRadius:8,padding:10,border:"1px solid #ffd60022"}}>
                  <div style={{fontSize:11,fontWeight:700,color:"#ffd600",marginBottom:6}}>💡 분할매도 시나리오 (1차 50% + 2차 50%)</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:8,fontSize:11}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{color:"#484f58",fontSize:9}}>1차 매도</div>
                      <div style={{fontWeight:700,color:"#3fb950"}}>{halfSh}주 × {fN(target1)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{color:"#484f58",fontSize:9}}>2차 매도</div>
                      <div style={{fontWeight:700,color:"#58a6ff"}}>{restSh}주 × {fN(target2)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{color:"#484f58",fontSize:9}}>합산 이익</div>
                      <div style={{fontWeight:800,color:"#ffd600",fontFamily:"'JetBrains Mono'",fontSize:14}}>{fN(splitProfit)}</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{color:"#484f58",fontSize:9}}>평균 손익비</div>
                      <div style={{fontWeight:800,color:splitProfit/ml>=3?"#3fb950":splitProfit/ml>=2?"#ffd600":"#f85149",fontFamily:"'JetBrains Mono'",fontSize:14}}>{(splitProfit/ml).toFixed(1)}:1</div>
                    </div>
                  </div>
                </div>}
              </div>}

              {/* 리스크 경고 */}
              <div style={{marginTop:8,display:"grid",gap:4}}>
                {(()=>{
                  const warns=[];
                  if(stopPct<-10)warns.push({t:"⚠️ 손절폭 "+stopPct.toFixed(1)+"% → -7~8% 권장",c:"#ff922b"});
                  if(pc>20)warns.push({t:"🚨 비중 "+pc.toFixed(1)+"% → 최대 15~20% 권장",c:"#f85149"});
                  if(rr1>0&&rr1<2)warns.push({t:"⚠️ 1차 손익비 "+rr1.toFixed(1)+":1 → 최소 2:1 이상 권장",c:"#ff922b"});
                  if(rr1>=3)warns.push({t:"✅ 1차 손익비 "+rr1.toFixed(1)+":1 — 우수",c:"#3fb950"});
                  if(rr2>=4)warns.push({t:"🎯 2차 손익비 "+rr2.toFixed(1)+":1 — 탁월한 기회",c:"#3fb950"});
                  if(pc<=10)warns.push({t:"✅ 비중 "+pc.toFixed(1)+"% — 적정",c:"#3fb950"});
                  return warns.map((w,i)=><div key={i} style={{padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,background:w.c+"12",border:`1px solid ${w.c}33`,color:w.c}}>{w.t}</div>);
                })()}
              </div>
            </>;
          })()}

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

            {/* 최근 상승 전환 알림 */}
            {(()=>{
              const now=Date.now();
              const recentTrans=[];
              stocks.filter(d=>watchlist.includes(d.t)).forEach(d=>{
                const h=gradeHistory[d.t];
                if(!h||!h.length)return;
                const last=h[h.length-1];
                const daysAgo=Math.floor((now-new Date(last.date).getTime())/86400000);
                if(daysAgo>30)return;
                const isUp=last.to.pt>last.from.pt;
                const transRet=last.price&&d.p?((d.p-last.price)/last.price*100).toFixed(1):null;
                recentTrans.push({d,last,daysAgo,isUp,transRet});
              });
              if(recentTrans.length===0)return null;
              const ups=recentTrans.filter(x=>x.isUp);
              const downs=recentTrans.filter(x=>!x.isUp);
              return <div style={{marginBottom:12}}>
                {ups.length>0 && <div style={{background:"#3fb95008",border:"1px solid #3fb95033",borderRadius:8,padding:"10px 14px",marginBottom:8}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#3fb950",marginBottom:6}}>🔄 최근 상승 전환 ({ups.length}종목, 30일 이내)</div>
                  <div style={{display:"grid",gap:4}}>
                    {ups.map(({d:s,last:l,daysAgo:da,transRet:tr})=>(
                      <div key={s.t} onClick={()=>{setDetailStock(s);setShowDetail(true);}} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#0d1117",borderRadius:6,cursor:"pointer"}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:700}}>{s.k?'🇰🇷':'🇺🇸'} {s.n}</span>
                          <span style={{fontSize:9,color:"#484f58",marginLeft:4}}>{l.date.slice(5)} ({da}일전)</span>
                          <div style={{fontSize:10,marginTop:1}}>
                            <span style={{color:"#3fb950"}}>{l.from.grade}</span>
                            <span style={{color:"#ffd43b",margin:"0 3px"}}>→</span>
                            <span style={{color:"#ff1744",fontWeight:700}}>{l.to.grade}</span>
                          </div>
                        </div>
                        {tr&&<div style={{fontSize:14,fontWeight:900,color:Number(tr)>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{tr>0?'+':''}{tr}%</div>}
                      </div>
                    ))}
                  </div>
                </div>}
                {downs.length>0 && <div style={{background:"#f8514908",border:"1px solid #f8514922",borderRadius:8,padding:"10px 14px"}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#f85149",marginBottom:6}}>⬇ 최근 하락 전환 ({downs.length}종목)</div>
                  <div style={{display:"grid",gap:4}}>
                    {downs.map(({d:s,last:l,daysAgo:da,transRet:tr})=>(
                      <div key={s.t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#0d1117",borderRadius:6,cursor:"pointer"}} onClick={()=>{setDetailStock(s);setShowDetail(true);}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:700}}>{s.k?'🇰🇷':'🇺🇸'} {s.n}</span>
                          <span style={{fontSize:9,color:"#484f58",marginLeft:4}}>{l.date.slice(5)}</span>
                          <div style={{fontSize:10}}>
                            <span style={{color:"#3fb950"}}>{l.from.grade}</span>
                            <span style={{color:"#f85149",margin:"0 3px"}}>↓</span>
                            <span style={{color:"#f85149",fontWeight:700}}>{l.to.grade}</span>
                          </div>
                        </div>
                        {tr&&<div style={{fontSize:14,fontWeight:900,color:"#f85149",fontFamily:"'JetBrains Mono'"}}>{tr}%</div>}
                      </div>
                    ))}
                  </div>
                </div>}
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
            {/* 총 요약 — 원화/달러 분리 */}
            {(()=>{
              let krBuy=0,krCur=0,usBuy=0,usCur=0;
              portfolio.forEach(p=>{const s=stocks.find(d=>d.t===p.ticker);if(s&&s.p){
                if(s.k){krBuy+=p.buyPrice*p.qty;krCur+=s.p*p.qty;}
                else{usBuy+=p.buyPrice*p.qty;usCur+=s.p*p.qty;}
              }});
              const krPnl=krCur-krBuy, usPnl=usCur-usBuy;
              const krPct=krBuy>0?((krCur/krBuy-1)*100):0;
              const usPct=usBuy>0?((usCur/usBuy-1)*100):0;
              const hasKR=krBuy>0, hasUS=usBuy>0;
              /* 경고 종목 카운트 */
              const alertItems=portfolio.filter(p=>{
                const s=stocks.find(d=>d.t===p.ticker);
                if(!s||!s.p)return false;
                const sl=calcStops(p,s.p);
                return sl.status==='이탈❗'||sl.status==='임박⚠️';
              });
              const SumRow=({label,flag,buy,cur,pnl,pct,unit})=>(
                <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{fontSize:12,fontWeight:700,color:flag==='🇰🇷'?'#ff922b':'#4dabf7',minWidth:50}}>{flag} {label}</div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>매수금액</div><div style={{fontSize:13,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{unit}{buy.toLocaleString()}</div></div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>평가금액</div><div style={{fontSize:13,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{unit}{Math.round(cur).toLocaleString()}</div></div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>손익</div><div style={{fontSize:13,fontWeight:700,color:pnl>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pnl>=0?"+":""}{Math.round(pnl).toLocaleString()}</div></div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>수익률</div><div style={{fontSize:13,fontWeight:700,color:pct>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pct>=0?"+":""}{pct.toFixed(2)}%</div></div>
                </div>
              );
              return <div style={{padding:"10px 14px",background:"linear-gradient(135deg,#0d1117,#161b22)",borderRadius:8,marginBottom:14,border:"1px solid #21262d"}}>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {hasKR&&<SumRow label="원화" flag="🇰🇷" buy={krBuy} cur={krCur} pnl={krPnl} pct={krPct} unit="₩"/>}
                  {hasUS&&<SumRow label="달러" flag="🇺🇸" buy={usBuy} cur={usCur} pnl={usPnl} pct={usPct} unit="$"/>}
                  {hasKR&&hasUS&&<div style={{borderTop:"1px solid #21262d",paddingTop:6,display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
                    <div style={{fontSize:10,color:"#484f58"}}>※ 통화가 달라 합산 불가 — 각각 확인하세요</div>
                  </div>}
                </div>
                {alertItems.length>0 && <div style={{padding:"4px 12px",background:"#f8514920",border:"1px solid #f8514966",borderRadius:6,marginTop:8}}>
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
          <Chip n={bestN} label="🔥최강" color="#ff1744"/>
          <Chip n={strongN} label="매수" color="#00e676"/>
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
            <TH c>성장/재무</TH>
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
                      <span onClick={e=>{e.stopPropagation();toggleWatch(d.t);}} style={{fontSize:isMobile?9:10,marginRight:isMobile?1:2,cursor:"pointer",opacity:watchlist.includes(d.t)?1:0.25,transition:"opacity .2s",userSelect:"none"}} title={watchlist.includes(d.t)?"워치리스트 해제":"워치리스트 등록"}>{watchlist.includes(d.t)?'⭐':'☆'}</span>
                      <span style={{fontSize:10,marginRight:2}}>{d.k?'🇰🇷':'🇺🇸'}</span>
                      <span onClick={e=>{e.stopPropagation();handleStockClick(d);}} style={{fontWeight:vd.stars>=5?700:500,cursor:"pointer",borderBottom:"1px dashed "+(vd.stars>=5?"#ff1744":"#484f58"),fontSize:isMobile?11:13,color:vd.stars>=5?"#ff1744":undefined}}>{d.n}</span>
                      {isMobile&&<div style={{fontSize:8,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{d.t}</div>}
                      {!isMobile&&<span style={{fontSize:10,color:"#484f58",marginLeft:3,fontFamily:"'JetBrains Mono'"}}>{d.t}</span>}
                      {(()=>{const h=gradeHistory[d.t];if(!h||!h.length)return null;const last=h[h.length-1];const daysAgo=Math.floor((Date.now()-new Date(last.date).getTime())/86400000);if(daysAgo>90)return null;const isUp=last.to.pt>last.from.pt;const transRet=last.price&&d.p?((d.p-last.price)/last.price*100).toFixed(1):null;return <div style={{fontSize:7,color:isUp?'#ff922b':'#f85149',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{isUp?'🔄':'⬇'} {last.date.slice(5)} {last.from.grade.slice(-2)}→{last.to.grade.slice(-2)} {daysAgo}일전{transRet&&isUp?` (${transRet>0?'+':''}${transRet}%)`:''}</div>;})()}
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
      {showDetail && <StockDetailModal key={detailStock?.t} stock={detailStock} onClose={()=>setShowDetail(false)} isWatched={watchlist.includes(detailStock?.t)} onToggleWatch={toggleWatch} gradeHistory={gradeHistory} onCalcPosition={(s)=>{
        const entryP=s.q[0]||vcpPv(s)||s.p||0;
        const stopP=s.q[1]||(entryP*0.93);
        const t1=s.q[2]||(entryP*1.15);
        const t2=s.q[3]||(entryP*1.30);
        setPosCal(p=>({...p,search:"",selStock:s,entry:+entryP.toFixed(s.k?0:2),stop:+stopP.toFixed(s.k?0:2),target1:+t1.toFixed(s.k?0:2),target2:+t2.toFixed(s.k?0:2),isKR:s.k}));
        setTab("calc");
      }}/>}

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
