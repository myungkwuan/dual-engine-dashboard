import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

import D from "./data";

/* ===== 캐시 버전 태그 ===== */
// 배점/로직 변경 시 이 값을 올리면 구버전 캐시 자동 무효화
const SCHEMA_VERSION = "v1.5.3"; // 형식: vMAJOR.MINOR.PATCH

/* ===== 유틸 ===== */
const fP=(v,k)=>k?`₩${Math.round(v).toLocaleString()}`:`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MKT_DEFAULT={spy12m:0,spy200:"조회전",kospi12m:0,vix:0,nh:"-",ad:"-",
  sec:[["XLK",0,0],["XLC",0,0],["XLI",0,0],["XLY",0,0],["XLV",0,0],["XLU",0,0],["XLE",0,0],["XLF",0,0],["XLB",0,0],["XLP",0,0],["XLRE",0,0]],
  health:{score:0,mode:"조회전",modeColor:"#484f58",modeIcon:"⏳",modeAction:"시장필터를 먼저 실행하세요",
    riskState:"unknown",riskColor:"#484f58",riskLabel:"⏳ 조회전",canBuy:true,maxPositionPct:100,
    krRiskState:"unknown",krRiskColor:"#484f58",krRiskLabel:"⏳ 조회전",krCanBuy:true,krMaxPositionPct:100},
  spy:{},vixData:{},kospi:{},loaded:false,
  // v2: KR/US 분리 직접 접근 필드
  krRiskState:"unknown",krRiskColor:"#484f58",krRiskLabel:"⏳ 조회전",krCanBuy:true,krMaxPositionPct:100,
  riskState:"unknown",riskColor:"#484f58",riskLabel:"⏳ 조회전",canBuy:true,maxPositionPct:100};

/* 데이터 접근자 */
const mfTd=d=>d.m[1];const mfTs=d=>d.m[0];const mfAl=d=>d.m[2];
const seV=d=>d.e[0];const seSt=d=>d.e[1];const seTt=d=>d.e[2];const seRs=d=>d.e[3];
const vcpMt=d=>d.v[6];const vcpPv=d=>d.v[4];const vcpPx=d=>d.v[5];
const fundGr=d=>d.d[4];const cfS=d=>d.x[0];const cfM=d=>d.x[1];const cfL=d=>d.x[2];
const cfLbl=(v)=>v>=3?"강함":v>=2?"보통":"약함";
const cfClr=(v)=>v>=3?"#3fb950":v>=2?"#d29922":"#f85149";

/* ===== 섹터 추세 차트 (최상단 독립 컴포넌트 — 훅 규칙 준수) ===== */
const SECTOR_COLORS=[
  "#ff1744","#ff6d00","#ffd600","#00e676","#00b0ff",
  "#d500f9","#f06292","#80cbc4","#ffb74d","#aed581",
  "#4fc3f7","#ce93d8","#ef9a9a","#80deea","#ffe082",
  "#c5e1a5","#b39ddb","#ff8a65","#90caf9","#a5d6a7","#fff176"
];

/* 등급 → 색상 */
const VERDICT_COLOR=v=>{
  if(!v)return"#484f58";
  if(v.includes("최강"))return"#ff6b6b";
  if(v.includes("매수"))return"#3fb950";
  if(v.includes("관심"))return"#58a6ff";
  if(v.includes("관망"))return"#ffd600";
  return"#f85149";
};

function SectorChart({trendData,isMobile,onSectorNav,market}){
  const[hoveredSector,setHoveredSector]=useState(null);
  const[selectedSector,setSelectedSector]=useState(null);

  if(!trendData||!trendData.data||trendData.data.length===0)
    return <div style={{padding:20,textAlign:"center",color:"#484f58",fontSize:13}}>데이터 없음</div>;

  const{data,sectors,ranking}=trendData;
  const fmtDate=d=>d?d.slice(5):'';

  /* 범례 클릭 → 메인탭 이동 */
  const handleSectorClick=s=>{
    if(onSectorNav) onSectorNav(s, market);
  };

  /* ── 차트 크기 ── */
  const W=isMobile?340:700, H=isMobile?250:340;
  const PAD={top:16,right:isMobile?62:84,bottom:32,left:isMobile?36:44};
  const innerW=W-PAD.left-PAD.right, innerH=H-PAD.top-PAD.bottom;

  /* ── Y축 범위 ── */
  const allVals=data.flatMap(pt=>sectors.map(s=>pt[s]??null).filter(v=>v!==null));
  const yMin=allVals.length?Math.floor(Math.min(...allVals)-0.5):-5;
  const yMax=allVals.length?Math.ceil(Math.max(...allVals)+0.5):5;
  const yRange=yMax-yMin||1;
  const xScale=i=>(i/(data.length-1||1))*innerW;
  const yScale=v=>innerH-((v-yMin)/yRange)*innerH;
  const yTicks=[];
  const step=yRange<=8?1:yRange<=16?2:yRange<=40?5:10;
  for(let v=Math.ceil(yMin/step)*step;v<=yMax;v+=step)yTicks.push(v);

  return <div>
    {/* SVG 라인 차트 */}
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
    <svg width={W} height={H} style={{display:"block",margin:"0 auto"}}>
      <g transform={`translate(${PAD.left},${PAD.top})`}>
        {/* 배경 격자 */}
        {yTicks.map(v=>(
          <g key={v}>
            <line x1={0} y1={yScale(v)} x2={innerW} y2={yScale(v)}
              stroke={v===0?"#ffffff30":"#21262d"} strokeWidth={v===0?1.5:1}
              strokeDasharray={v===0?"5,4":""}/>
            <text x={-4} y={yScale(v)+4} textAnchor="end" fontSize={isMobile?8:10} fill="#484f58">{v}%</text>
          </g>
        ))}

        {/* 섹터 라인 */}
        {sectors.map((s,si)=>{
          const color=SECTOR_COLORS[si%SECTOR_COLORS.length];
          const isHov=hoveredSector===s;
          let pathD='';
          data.forEach((pt,i)=>{
            if(pt[s]==null)return;
            const x=xScale(i),y=yScale(pt[s]);
            const prev=data[i-1];
            if(i===0||prev==null||prev[s]==null)pathD+=`M${x},${y}`;
            else pathD+=`L${x},${y}`;
          });
          if(!pathD)return null;
          const lastPt=data[data.length-1];
          const lastVal=lastPt?.[s];
          const lastX=xScale(data.length-1);
          const lastY=lastVal!=null?yScale(lastVal):null;
          const opacity=hoveredSector&&!isHov?0.15:1;
          return <g key={s}>
            <path d={pathD} fill="none" stroke={color}
              strokeWidth={isHov?3:1.5} opacity={opacity}
              style={{transition:"all .18s"}}/>
            {lastY!=null&&<>
              <circle cx={lastX} cy={lastY} r={isHov?4:2}
                fill={color} opacity={opacity}/>
              <text x={lastX+6} y={lastY+4} fontSize={isMobile?8:9} fill={color}
                opacity={hoveredSector&&!isHov?0.1:1} fontWeight={isHov?800:400}>
                {lastVal>=0?"+":""}{lastVal?.toFixed(1)}%
              </text>
            </>}
          </g>;
        })}

        {/* X축 날짜 */}
        {data.map((pt,i)=>(
          (i===0||i===data.length-1||i%2===0)&&
          <text key={i} x={xScale(i)} y={innerH+20} textAnchor="middle"
            fontSize={isMobile?8:10} fill="#484f58">
            {fmtDate(pt.date)}
          </text>
        ))}
        <line x1={0} y1={innerH} x2={innerW} y2={innerH} stroke="#21262d" strokeWidth={1}/>
      </g>
    </svg>
    </div>

    {/* 범례 + 수익률 순위 */}
    <div style={{marginTop:10,display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"1fr 1fr 1fr",gap:4}}>
      {(ranking||[]).map(({sector,ret})=>{
        const colorIdx=sectors.indexOf(sector);
        const color=SECTOR_COLORS[colorIdx%SECTOR_COLORS.length];
        const retColor=ret>0?"#3fb950":ret<0?"#f85149":"#484f58";
        const isHov=hoveredSector===sector;
        return <div key={sector}
          onClick={()=>handleSectorClick(sector)}
          onMouseEnter={()=>setHoveredSector(sector)}
          onMouseLeave={()=>setHoveredSector(null)}
          style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",
            borderRadius:6,cursor:onSectorNav?"pointer":"default",
            background:isHov?color+"18":"#161b22",
            border:"1px solid "+(isHov?color+"66":"#21262d")+"",
            transition:"all .15s",userSelect:"none"}}>
          <div style={{width:14,height:3,borderRadius:2,background:color,flexShrink:0}}/>
          <div style={{flex:1,fontSize:isMobile?9:10,color:isHov?"#e6edf3":"#8b949e",
            fontWeight:isHov?700:400,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sector}</div>
          <div style={{fontSize:isMobile?9:11,fontWeight:700,
            fontFamily:"'JetBrains Mono'",color:retColor,flexShrink:0}}>
            {ret>=0?"+":""}{ret.toFixed(1)}%
          </div>
        </div>;
      })}
    </div>
    {onSectorNav&&<div style={{fontSize:9,color:"#484f58",marginTop:4,textAlign:"right"}}>
      섹터 클릭 → 메인탭 해당 섹터 바로 이동
    </div>}
  </div>;
}

/* ===== 듀얼모멘텀 강화 분석 ===== */
// v2: SPY 실시간 벤치마크 (시장필터 갱신 시 업데이트됨)
// getDualMomentum은 전역 함수라 MKT state를 직접 못 읽음 → 이 변수로 브릿지
let _SPY_BENCH = { b3: 4.2, b6: 8.7 };

function getDualMomentum(d) {
  const r3m = d.r[0], r6m = d.r[1], secRank = d.r[2];
  // 실시간 SPY 수익률 사용 (시장필터 갱신 전엔 기본값 유지)
  const spyBench3 = _SPY_BENCH.b3;
  const spyBench6 = _SPY_BENCH.b6;

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
  const vcpScore = vm === "성숙🔥" ? 10 : vm === "돌파✅" ? 9 : vm.includes("성숙") ? 8 : vm === "돌파" ? 7 : vm === "형성중" ? 5 : 2;
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
    : vm === "돌파✅" ? 10                  // 수축 후 돌파 완료 (좋은 돌파)
    : vm.includes("성숙") ? 11             // 성숙이지만 거래량 수축 미확인
    : vm === "돌파" ? 7                     // 돌파했으나 수축 불명확
    : vm === "형성중" ? 3                   // 수축 진행중 → 아직 매수근거 약함
    : 1;                                    // 미형성 → 거의 0

  /* ④ MF 펀더멘탈 (10점) - 회사 실적이 좋은가?
     ETF는 펀더멘탈 없음 → 자금유입강도로 대체 (거래량비율 기반) */
  const isETF = d.s === 'ETF';
  const volData = d._volData;
  let mfPt;
  if (isETF && volData) {
    // ETF: 자금유입강도 (5일평균거래량 ÷ 50일평균거래량)
    const vr = volData.volRatio || 1;
    mfPt = vr >= 2.0 ? 10   // 자금유입 폭발
      : vr >= 1.5 ? 8       // 강한 유입
      : vr >= 1.2 ? 6       // 소폭 유입
      : vr >= 0.8 ? 4       // 보통
      : vr >= 0.5 ? 2       // 소폭 유출
      : 0;                   // 자금이탈
  } else {
    mfPt = mfScore >= 85 ? 10
      : mfScore >= 75 ? 8
      : mfScore >= 65 ? 6
      : mfScore >= 55 ? 4
      : mfScore >= 40 ? 2
      : 0;
  }

  /* ⑤ CF 현금흐름 (5점) - 돈을 실제로 벌고 있나?
     ETF는 현금흐름 없음 → 추세안정성으로 대체 (상승+안정=높은점수) */
  let cfPt;
  if (isETF && volData) {
    // ETF: 추세안정성 (가격방향 + 52주위치 조합)
    const pChg = volData.priceChg5d || 0;
    const pos = volData.positionPct || 50;
    if (pChg > 2 && pos >= 40 && pos <= 85) cfPt = 5;       // 안정 상승 (중간대에서 꾸준히 오름)
    else if (pChg > 0 && pos >= 30) cfPt = 4;                 // 소폭 상승
    else if (pChg >= -1 && pos >= 30 && pos <= 80) cfPt = 3;  // 보합 안정
    else if (pChg >= -3) cfPt = 2;                             // 소폭 하락
    else cfPt = 0;                                              // 급락 불안정
  } else {
    const cfTotal = cfS(d) + cfM(d) + cfL(d);
    cfPt = hasFCF && cfTotal >= 8 ? 5
      : hasFCF && cfTotal >= 5 ? 3
      : hasFCF ? 2
      : 0;
  }

  /* ⑥ 거래량 (12점) - 큰손이 사고 있나 팔고 있나?
     범위: -5 ~ +12 (매도신호는 반드시 감점!)
     고점에서 거래량 터지며 하락 = 세력이탈 → 무조건 마이너스 */
  let volPt = 6; // 기본 중립 6점
  if (volData) {
    if (volData.signalType === 'sell' && volData.surgeDay) volPt = -5;     // 고점이탈+급등일 = 세력탈출! 최악
    else if (volData.signalType === 'sell') volPt = -3;                     // 분배경고/급락주의
    else if (volData.signalType === 'caution') volPt = 2;                   // 변곡점/추세약화
    else if (volData.signalType === 'neutral') volPt = 6;                   // 중립
    else if (volData.volDryup && vm.includes("성숙")) volPt = 10;          // VCP 성숙 + 거래량 수축
    else if (volData.signalType === 'buy') volPt = volData.surgeDay ? 12 : 9; // 매집/돌파
  }

  /* ⑦ 교차검증 (±5점) - 엔진들이 같은 말을 하는가? */
  let crossPt = 0;
  const strongCount = [
    sepaPt >= 22,           // SEPA 강함 (7/8+)
    dmPt >= 14,             // DM 양호 (BUY+)
    vcpPt >= 10,            // VCP 성숙 또는 돌파
    mfPt >= 6,              // MF 65+
  ].filter(Boolean).length;

  const weakCount = [
    sepaPt <= 4,            // SEPA 약함 (4/8 이하)
    dmPt <= 3,              // DM 약함 (SELL~)
    vcpPt <= 1,             // VCP 미형성
    mfPt <= 2,              // MF 55 미만
    volPt <= 0,             // 거래량 매도신호 ← 추가!
  ].filter(Boolean).length;

  if (strongCount >= 4) crossPt = 5;        // 올그린 → +5
  else if (strongCount >= 3) crossPt = 3;   // 3개 강 → +3
  else if (strongCount >= 2) crossPt = 1;   // 2개 강 → +1

  if (weakCount >= 3) crossPt -= 5;         // 3개+ 약함 → -5
  else if (weakCount >= 2) crossPt -= 3;    // 2개 약함 → -3
  else if (weakCount >= 1 && strongCount <= 1) crossPt -= 1; // 약점 있고 강점도 부족

  // 당일 급락 + 거래량 매도 = 세력이탈 추가 감점
  const todayDrop = d.c <= -5;             // 당일 -5% 이하 급락
  if (todayDrop && volPt <= 0) crossPt -= 3; // 급락+매도거래량 동시 → -3 추가

  const totalPt_raw = sepaPt + dmPt + vcpPt + mfPt + cfPt + volPt + crossPt;

  /* ── v1.5: Gate 실패 페널티 ── */
  const gate = d._gate;
  let gatePenalty = 0;
  let gateLabel = null;
  if (gate && !gate.passed) {
    if (!gate.G1 && !gate.G2) { gatePenalty = 20; gateLabel = '⛔G1+G2실패'; }
    else if (!gate.G1)        { gatePenalty = 15; gateLabel = '⛔G1실패(추세이탈)'; }
    else if (!gate.G2)        { gatePenalty = 10; gateLabel = '⛔G2실패(200일하락)'; }
    else if (!gate.G3)        { gatePenalty = 8;  gateLabel = '⛔G3실패(모멘텀음수)'; }
  }

  /* ── v1.5: Risk Penalty ── */
  const riskPenalty = d._riskPenalty || 0;

  let totalPt = Math.max(0, Math.min(totalPt_raw - gatePenalty - riskPenalty, 100));

  /* ── v1.5: MF 하위등급 clamp ── */
  // 펀더멘탈 미충족(F등급, mfScore<60) → 최대 64점
  if (!isETF && mfGrade === 'F') totalPt = Math.min(totalPt, 64);
  // CF 단기·중기·장기 모두 약함 → 최대 69점
  if (!isETF) {
    const cfAllWeak = cfS(d) <= 1 && cfM(d) <= 1 && cfL(d) <= 1;
    if (cfAllWeak) totalPt = Math.min(totalPt, 69);
  }

  let verdict, color, stars;
  if (totalPt >= 85) { verdict = '\u{1F525}최강'; color = '#ff1744'; stars = 5; }      // v1.5: 80→85
  else if (totalPt >= 65) { verdict = '\u{1F7E2}매수'; color = '#00e676'; stars = 4; }
  else if (totalPt >= 50) { verdict = '\u{1F535}관심'; color = '#448aff'; stars = 3; }
  else if (totalPt >= 35) { verdict = '\u{1F7E1}관망'; color = '#ffd600'; stars = 2; }
  else { verdict = '\u26D4위험'; color = '#78909c'; stars = 1; }

  return { verdict, color, stars, totalPt, details: { mfGrade, mfScore, sepaLevel, vcpScore, hasFCF, dm, sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt, crossPt, gatePenalty, gateLabel, riskPenalty } };
}

/* ===== AI 분석 텍스트 생성 ===== */
function genAnalysis(d) {
  const v = getVerdict(d);
  const dm = v.details.dm;
  const lines = [];
  const st = seTt(d), vm = vcpMt(d), vol = d._volData;
  const {sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt, crossPt, gatePenalty, gateLabel, riskPenalty} = v.details;

  /* ── 한줄 요약 ── */
  const good = [], bad = [];
  if (sepaPt >= 22) good.push('추세↑'); else if (sepaPt <= 9) bad.push('추세↓');
  if (dmPt >= 14) good.push('모멘텀↑'); else if (dmPt <= 3) bad.push('모멘텀↓');
  if (vcpPt >= 10) good.push('타이밍↑'); else if (vcpPt <= 1) bad.push('패턴없음');
  if (volPt >= 9) good.push('매집↑'); else if (volPt <= 0) bad.push('세력이탈!'); else if (volPt <= 3) bad.push('매도압력');
  if (mfPt >= 6) good.push('실적↑'); else if (mfPt <= 2) bad.push('실적↓');

  let summary = '';
  if (v.stars >= 5) summary = `모든 조건이 갖춰진 최고 상태! 추세·모멘텀·패턴·실적 모두 강력.`;
  else if (v.stars >= 4) summary = good.length >= 3 ? `${good.join('+')} 동시 강세. 매수 조건 충족.` : `핵심 지표 양호. 추가 확인 후 매수 가능.`;
  else if (v.stars >= 3) summary = good.length ? `${good.join(',')}은 좋으나 ${bad.length?bad.join(',')+'이 약해':'일부 부족'}. 지켜볼 종목.` : `뚜렷한 강점 없이 보통 수준.`;
  else if (v.stars >= 2) summary = bad.length ? `${bad.join(',')} 약점. 아직 사기엔 이름.` : `전반적으로 힘이 부족. 대기.`;
  else summary = `${bad.length?bad.join(',')+' 등 ':''}여러 약점. 지금은 피하는 게 안전.`;
  lines.push(`💬 ${summary}`);

  /* ── 점수 한줄 ── */
  lines.push(`📊 ${v.totalPt}점 | SEPA ${sepaPt}/30 · DM ${dmPt}/23 · VCP ${vcpPt}/15 · MF ${mfPt}/10 · CF ${cfPt}/5 · 거래량 ${volPt}/12${crossPt?(' · 교차'+(crossPt>0?'+':'')+crossPt):''}${gatePenalty?(' · Gate'+(-gatePenalty)):''}${riskPenalty?(' · Risk'+(-riskPenalty)):''}`);
  /* ── v1.5: Gate 경고 ── */
  if (gateLabel) lines.push(`🚧 Gate 실패 (${-gatePenalty}pt): ${gateLabel}. 매수 조건 미충족.`);
  /* ── v1.5: Risk 경고 ── */
  if (riskPenalty > 0 && d._riskReasons?.length) lines.push(`⚠️ 위험 요소 (-${riskPenalty}pt): ${d._riskReasons.join(' / ')}`);
  /* ── v1.5: Execution Tag ── */
  if (d._execTag) {
    const tagMap = { 'BUY NOW':'🟢 지금 매수 가능 구간 (BUY NOW)', 'BUY ON BREAKOUT':'🔵 돌파 시 매수 (BUY ON BREAKOUT)', 'WATCH':'🟡 추가 관찰 필요 (WATCH)', 'AVOID':'🔴 진입 회피 (AVOID)' };
    lines.push(tagMap[d._execTag] || `🏷️ ${d._execTag}`);
  }

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
  else if (vm === "돌파✅") lines.push(`🚀 타이밍: 수축 완료 후 피봇 돌파! 건강한 돌파. 눌림목에서 매수 기회.`);
  else if (vm === "돌파") lines.push(`🚀 타이밍: 피봇을 넘었으나 사전 수축이 불명확. 돌파 강도 확인 필요.`);
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

  /* ── 실적/자금유입 (간략) ── */
  const isETF = d.s === 'ETF';
  if (isETF) {
    if (mfPt >= 8) lines.push(`💰 자금유입: 거래량 폭발! 기관자금 대량 유입 중.`);
    else if (mfPt >= 6) lines.push(`💰 자금유입: 거래량 증가. 자금 유입 확인.`);
    else if (mfPt >= 4) lines.push(`💰 자금유입: 보통 수준. 특이 사항 없음.`);
    else if (mfPt >= 1) lines.push(`📉 자금유출: 거래량 감소. 자금 빠져나가는 중.`);
    else lines.push(`🚨 자금이탈: 거래량 급감. 관심도 급락.`);
  } else {
    if (mfPt >= 8) lines.push(`✅ 실적: 우량! 매출·이익 성장 + 재무건전성 양호.`);
    else if (mfPt >= 6) lines.push(`✅ 실적: 양호. 대체로 괜찮지만 일부 개선 여지.`);
    else if (mfPt >= 4) lines.push(`⚠️ 실적: 보통. 펀더멘탈만으로는 확신 어려움.`);
    else if (mfPt >= 1) lines.push(`⚠️ 실적: 약함. 실적 뒷받침 부족.`);
  }
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
    { label: 'VCP', value: vcpMt(stock).includes("성숙") ? 80 : vcpMt(stock).includes("돌파") ? 70 : vcpMt(stock) === "형성중" ? 50 : 20, max: 100 },
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
  const isETF = stock.s === 'ETF';
  const volD = stock._volData;
  const etfVR = volD ? volD.volRatio : 1;

  const mfInterp = isETF
    ? (etfVR >= 2.0
      ? { signal: '자금유입 폭발', color: '#00ff88', icon: '🟢',
          desc: `거래량비율 ${etfVR}x로 평소의 2배 이상! 기관·펀드 자금이 대량 유입되는 중. ETF로의 강한 자금쏠림 확인.`,
          action: '✅ 자금 유입 최강! 추세 추종 매수 적극 권장' }
      : etfVR >= 1.5
      ? { signal: '강한 자금유입', color: '#3fb950', icon: '🔵',
          desc: `거래량비율 ${etfVR}x로 평소 대비 50%+ 증가. 시장 관심 집중되고 있으며 기관 매수세 유입 신호.`,
          action: '🔵 자금 유입 확인. 추세와 함께 매수 가능' }
      : etfVR >= 0.8
      ? { signal: '자금흐름 보통', color: '#d29922', icon: '🟡',
          desc: `거래량비율 ${etfVR}x로 평소 수준. 특별한 자금 유입/유출 없이 시장과 동행.`,
          action: '🟡 자금 중립. 다른 엔진 신호에 의존' }
      : { signal: '자금유출 경고', color: '#f85149', icon: '🔴',
          desc: `거래량비율 ${etfVR}x로 평소의 절반 수준. 투자자 관심 급감, 자금 이탈 중.`,
          action: '⛔ 자금 유출 중. 매수 금지 구간' })
    : mfScore >= 80
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
    : vcpMaturity === '돌파✅'
    ? { signal: 'VCP 수축 후 돌파 완료!', color: '#3fb950', icon: '🟢',
        desc: `변동성 수축(${vcpT1}%→${vcpT2}%) 완료 후 피봇 ${fP(vcpPv(stock),stock.k)}을 돌파! 건강한 돌파 패턴. 추세 지속 가능성 높음.`,
        action: '✅ 돌파 확인! 눌림목 매수 또는 추가매수 구간' }
    : vcpMaturity === '돌파'
    ? { signal: '피봇 돌파 (수축 불명확)', color: '#58a6ff', icon: '🔵',
        desc: `피봇 ${fP(vcpPv(stock),stock.k)}을 넘어섰으나 사전 수축 패턴이 교과서적이지 않음. 돌파 강도와 거래량을 확인해야 함.`,
        action: '🔵 돌파 후 눌림목에서 진입 검토. 거래량 동반 확인 필수' }
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
  const etfPChg = volD ? volD.priceChg5d : 0;
  const etfPos = volD ? volD.positionPct : 50;
  const cfInterp = isETF
    ? (etfPChg > 2 && etfPos >= 40
      ? { signal: '안정적 상승추세', color: '#3fb950', icon: '🟢',
          desc: `5일 가격변화 +${etfPChg}%, 52주 위치 ${etfPos}%. 중간대에서 꾸준히 상승중. 변동성 낮고 방향성 확실.`,
          action: '✅ 안정적 상승. 추세 추종 매수 적합' }
      : etfPChg > 0
      ? { signal: '소폭 상승', color: '#58a6ff', icon: '🔵',
          desc: `5일 가격변화 +${etfPChg}%, 52주 위치 ${etfPos}%. 소폭 상승세이나 추세 강도는 보통.`,
          action: '🔵 방향 긍정적. 추가 확인 후 매수' }
      : etfPChg >= -2
      ? { signal: '보합/소폭 조정', color: '#d29922', icon: '🟡',
          desc: `5일 가격변화 ${etfPChg}%, 52주 위치 ${etfPos}%. 큰 방향성 없이 횡보 또는 소폭 조정.`,
          action: '🟡 방향 불확실. 관망' }
      : { signal: '하락 불안정', color: '#f85149', icon: '🔴',
          desc: `5일 가격변화 ${etfPChg}%, 52주 위치 ${etfPos}%. 하락 추세 진입 또는 급락 구간.`,
          action: '⛔ 불안정. 매수 금지' })
    : hasFCF && cfTotal >= 7
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
        desc: `RS ${dm.rsScore}/100으로 전체 시장 상위 ${100-dm.rsScore}%에 위치. 3M 수익률 ${dm.r3m>0?'+':''}${dm.r3m}%(SPY 대비 ${(dm.r3m-_SPY_BENCH.b3).toFixed(1)}%p 초과). 기관·스마트머니가 집중 매수하는 리더 종목.`,
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
    <div style={{marginTop:'8px',padding:'8px 10px',background:interp.color+'08',border:"1px solid "+(interp.color)+"22",borderRadius:'6px'}}>
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
            <div style={{padding:'8px 14px',borderRadius:'10px',background:verdict.color+'20',border:"2px solid "+(verdict.color)+"",textAlign:'center'}}>
              <div style={{fontSize:'16px',fontWeight:900,color:verdict.color,whiteSpace:'nowrap'}}>{verdict.verdict}</div>
              <div style={{fontSize:'9px',color:'#666'}}>{'⭐'.repeat(verdict.stars)}</div>
            </div>
            {/* v1.5: Execution Tag */}
            {stock._execTag && (()=>{
              const tagStyle={
                'BUY NOW':{bg:'#00e67620',border:'#00e676',color:'#00e676',label:'🟢 BUY NOW'},
                'BUY ON BREAKOUT':{bg:'#448aff20',border:'#448aff',color:'#448aff',label:'🔵 돌파매수'},
                'WATCH':{bg:'#ffd60020',border:'#ffd600',color:'#ffd600',label:'🟡 WATCH'},
                'AVOID':{bg:'#f8514920',border:'#f85149',color:'#f85149',label:'🔴 AVOID'},
              }[stock._execTag]||{bg:'#ffffff10',border:'#666',color:'#aaa',label:stock._execTag};
              return <div style={{padding:'3px 10px',borderRadius:'6px',background:tagStyle.bg,border:"1px solid "+(tagStyle.border)+"",fontSize:'10px',fontWeight:800,color:tagStyle.color,whiteSpace:'nowrap'}}>{tagStyle.label}</div>;
            })()}
            {/* v1.5: Gate 실패 표시 */}
            {verdict.details.gateLabel && <div style={{padding:'2px 8px',borderRadius:'5px',background:'#f8514918',border:'1px solid #f85149',fontSize:'9px',fontWeight:700,color:'#f85149',whiteSpace:'nowrap'}}>{verdict.details.gateLabel}</div>}
            <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
              <span style={{padding:'3px 8px',borderRadius:'5px',background:dm.signalColor+'20',border:"1px solid "+(dm.signalColor)+"44",fontSize:'10px',fontWeight:700,color:dm.signalColor,whiteSpace:'nowrap'}}>{dm.signal}</span>
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

            {/* 엔진1: MF 레이더 / ETF 자금유입 */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              {stock.s==='ETF' ? (<>
                <div style={{fontSize:'12px',fontWeight:700,color:'#4dabf7',marginBottom:'10px'}}>◈ 엔진1: 자금유입강도 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 기관이 사들이고 있나?</span></div>
                <div style={{textAlign:'center',padding:'14px 0'}}>
                  <div style={{fontSize:'32px'}}>{etfVR>=2?'🔥':etfVR>=1.5?'💰':etfVR>=0.8?'➡️':'📉'}</div>
                  <div style={{fontSize:'22px',fontWeight:900,color:etfVR>=1.5?'#3fb950':etfVR>=0.8?'#ffd600':'#f85149',marginTop:'6px'}}>{etfVR}x</div>
                  <div style={{fontSize:'10px',color:'#8b949e',marginTop:'2px'}}>5일 / 50일 거래량 비율</div>
                </div>
                <div style={{display:'flex',gap:'8px',justifyContent:'center',margin:'10px 0'}}>
                  <div style={{textAlign:'center',padding:'6px 10px',background:'#0a1628',borderRadius:'6px',flex:1}}>
                    <div style={{fontSize:'9px',color:'#666'}}>50일 평균</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:'#e6edf3'}}>{volD?(volD.avgVol50/1000).toFixed(0)+'K':'N/A'}</div>
                  </div>
                  <div style={{textAlign:'center',padding:'6px 10px',background:'#0a1628',borderRadius:'6px',flex:1}}>
                    <div style={{fontSize:'9px',color:'#666'}}>최근 5일</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:etfVR>=1.2?'#3fb950':'#e6edf3'}}>{volD?(volD.avgVol5/1000).toFixed(0)+'K':'N/A'}</div>
                  </div>
                </div>
              </>) : (<>
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
              </>)}
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
                <div style={{padding:'8px 10px',background:dm.signalColor+'10',borderRadius:'6px',textAlign:'center',border:"1px solid "+(dm.signalColor)+"33"}}>
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
                  {vcpMt(stock).includes("성숙")?'✅':vcpMt(stock).includes("돌파")?'🚀':vcpMt(stock)==="형성중"?'⏳':'❌'}
                </div>
                <div style={{fontSize:'14px',fontWeight:700,color:vcpMt(stock).includes("성숙")?'#00ff88':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',marginTop:'4px'}}>
                  {vcpMt(stock)} ({verdict.details.vcpScore}/10)
                </div>
                <div style={{margin:'8px auto',width:'80%',height:'6px',background:'#1a1a2e',borderRadius:'3px',overflow:'hidden'}}>
                  <div style={{width:`${(verdict.details.vcpScore/10)*100}%`,height:'100%',background:vcpMt(stock).includes("성숙")?'#00ff88':vcpMt(stock).includes("돌파")?'#3fb950':vcpMt(stock)==="형성중"?'#ffd43b':'#ff6b6b',borderRadius:'3px'}}/>
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

            {/* 엔진4: CF / ETF 추세안정성 */}
            <div style={{background:'#080818',borderRadius:'10px',padding:'14px'}}>
              {stock.s==='ETF' ? (<>
                <div style={{fontSize:'12px',fontWeight:700,color:'#ff922b',marginBottom:'10px'}}>◈ 엔진4: 추세안정성 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 안정적으로 오르고 있나?</span></div>
                <div style={{textAlign:'center',padding:'10px 0'}}>
                  <div style={{fontSize:'32px'}}>{etfPChg>2?'📈':etfPChg>0?'➡️':etfPChg>=-2?'📉':'🔻'}</div>
                  <div style={{fontSize:'14px',fontWeight:700,color:etfPChg>0?'#3fb950':etfPChg>=-2?'#ffd600':'#f85149',marginTop:'4px'}}>{etfPChg>0?'+':''}{etfPChg}%</div>
                  <div style={{fontSize:'10px',color:'#8b949e',marginTop:'2px'}}>5일 가격변화</div>
                </div>
                <div style={{display:'flex',gap:'8px',justifyContent:'center',margin:'10px 0'}}>
                  <div style={{textAlign:'center',padding:'6px 10px',background:'#0a1628',borderRadius:'6px',flex:1}}>
                    <div style={{fontSize:'9px',color:'#666'}}>52주 위치</div>
                    <div style={{fontSize:'14px',fontWeight:700,color:etfPos>=60?'#3fb950':etfPos>=30?'#ffd600':'#f85149'}}>{etfPos}%</div>
                  </div>
                  <div style={{textAlign:'center',padding:'6px 10px',background:'#0a1628',borderRadius:'6px',flex:1}}>
                    <div style={{fontSize:'9px',color:'#666'}}>안정성</div>
                    <div style={{fontSize:'12px',fontWeight:700,color:verdict.details.cfPt>=4?'#3fb950':verdict.details.cfPt>=2?'#ffd600':'#f85149'}}>{verdict.details.cfPt>=4?'안정':verdict.details.cfPt>=2?'보통':'불안'}</div>
                  </div>
                </div>
              </>) : (<>
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
              </>)}
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
            <div style={{background:sigBg,border:"1px solid "+(sigClr)+"44",borderRadius:'8px',padding:'10px',marginBottom:'10px',textAlign:'center'}}>
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

          {/* 보조지표 — 매수 확신도 */}
          {stock._indicators && (()=>{
            const ind=stock._indicators;
            const bb=ind.bb, macd=ind.macd, obv=ind.obv;
            const bbIcon=bb.signal==='squeeze'?'🟢':bb.signal==='narrow'?'🟡':'⚪';
            const bbLabel=bb.signal==='squeeze'?'스퀴즈!':bb.signal==='narrow'?'수축중':bb.signal==='normal'?'보통':'확대';
            const bbDesc=bb.signal==='squeeze'?`주가 변동폭이 6개월 중 가장 좁아졌어요(${bb.width}%). 이건 스프링을 꽉 누르고 있는 상태와 같아서, 곧 위 또는 아래로 크게 움직일 가능성이 높아요. 추세가 상승이면 폭발적 상승이 기대되는 최적의 매수 타이밍이에요.`
              :bb.signal==='narrow'?`주가 변동폭이 점점 줄어드는 중이에요(${bb.width}%, 최소 대비 ${bb.ratio}배). 아직 완전한 스퀴즈는 아니지만 에너지가 모이고 있어요. 변동폭이 더 줄어들면 큰 움직임이 올 수 있으니 주시하세요.`
              :bb.signal==='normal'?`주가 변동폭이 평소 수준이에요(${bb.width}%). 특별한 에너지 축적이 없는 상태라서, 볼린저 밴드만으로는 매수/매도 판단이 어려워요. 다른 지표를 함께 확인하세요.`
              :`주가 변동폭이 크게 벌어져 있어요(${bb.width}%). 이미 큰 움직임이 진행된 후이거나, 변동성이 높은 불안정한 구간이에요. 이런 때는 새로 매수하기보다 기존 보유 시 리스크 관리에 집중하세요.`;
            const macdIcon=macd.signal==='golden'?'🟢':macd.signal==='bullish'?'🟢':macd.signal==='recovering'?'🟡':macd.signal==='dead'?'🔴':macd.signal==='bearish'?'🔴':'⚪';
            const macdLabel=macd.signal==='golden'?'골든크로스!':macd.signal==='bullish'?`상승 ${macd.crossDays}일차`:macd.signal==='recovering'?'반등 시작!':macd.signal==='dead'?'데드크로스!':macd.signal==='bearish'?`하락 ${macd.crossDays}일차`:'중립';
            const macdDesc=macd.signal==='golden'?'단기 흐름이 장기 흐름을 위로 돌파했어요! 이건 하락세가 끝나고 상승으로 전환된다는 가장 대표적인 매수 신호예요. 특히 거래량이 동반되면 신뢰도가 더 높아요.'
              :macd.signal==='bullish'?`골든크로스가 발생한 후 ${macd.crossDays}일째 상승 흐름이 유지되고 있어요. 상승 초반이면 매수 기회, 10일 이상 지속됐으면 추세의 힘이 줄어들 수 있으니 과열 여부를 체크하세요.`
              :macd.signal==='recovering'?`아직 완전한 상승 전환은 아니지만, 하락의 힘이 빠지고 있어요! MACD 막대(히스토그램)가 점점 줄어들면서 반등이 시작되는 신호예요. 곧 골든크로스가 나올 수 있으니 주시하세요. 조금만 더 오르면 본격 상승 전환!`
              :macd.signal==='dead'?'단기 흐름이 장기 흐름을 아래로 뚫었어요! 이건 상승세가 꺾이고 하락으로 전환된다는 대표적인 매도 신호예요. 보유 중이라면 손절이나 비중 축소를 검토하세요.'
              :macd.signal==='bearish'?`데드크로스가 발생한 후 ${macd.crossDays}일째 하락 흐름이 지속되고 있어요. 아직 하락 추세가 끝나지 않았으니, 새로 매수하기보다는 바닥 확인 후 진입하는 게 안전해요.`
              :'MACD와 시그널이 거의 같은 위치에 있어서 방향이 불확실해요. 이런 때는 섣불리 매매하지 말고, 골든크로스나 데드크로스가 나올 때까지 기다리는 게 좋아요.';
            const obvIcon=obv.signal==='accumulation'?'🟢':obv.signal==='confirm'?'🟢':obv.signal==='recovering'?'🟡':obv.signal==='distribution'?'🔴':obv.signal==='confirm_down'?'🔴':'⚪';
            const obvLabel=obv.signal==='accumulation'?'스마트머니 매집!':obv.signal==='confirm'?'상승 확인':obv.signal==='recovering'?'반등 감지!':obv.signal==='distribution'?'스마트머니 이탈!':obv.signal==='confirm_down'?'하락 확인':'중립';
            const obvDesc=obv.signal==='accumulation'?'주가는 큰 변화 없이 횡보하는데, 거래량 기반 자금흐름(OBV)은 꾸준히 올라가고 있어요. 이건 기관이나 큰손이 눈에 띄지 않게 조용히 물량을 모으고 있다는 뜻이에요. 이후 주가가 따라 오를 가능성이 높아요!'
              :obv.signal==='confirm'?'주가도 오르고 거래량 기반 자금흐름(OBV)도 같이 오르고 있어요. 돈이 실제로 들어오면서 주가를 밀어올리는 건강한 상승이에요. 이런 흐름이면 상승 추세가 더 이어질 가능성이 높아요.'
              :obv.signal==='recovering'?'20일 전체로 보면 아직 하락 흐름이지만, 최근 5일 동안 거래량과 주가가 모두 반등하기 시작했어요! 바닥을 찍고 돌아서는 초기 신호일 수 있어요. 본격적인 상승 전환이 확인되면 매수 기회!'
              :obv.signal==='distribution'?'주가는 아직 버티고 있지만, 거래량 기반 자금흐름(OBV)이 내려가고 있어요. 이건 큰손들이 슬금슬금 물량을 팔고 빠져나가는 신호예요. 주가가 뒤늦게 무너질 수 있으니 주의하세요!'
              :obv.signal==='confirm_down'?'주가도 내리고 거래량 기반 자금흐름(OBV)도 같이 내리고 있어요. 실제로 돈이 빠져나가면서 주가가 떨어지는 확실한 하락 추세예요. 반등을 기대하기보다 관망하는 게 안전해요.'
              :'거래량과 주가의 방향이 특별한 패턴을 보이지 않아요. OBV만으로는 큰손의 움직임을 판단하기 어려운 상태이니 다른 지표를 함께 확인하세요.';
            const greenCount=[bb.signal==='squeeze',['golden','bullish','recovering'].includes(macd.signal),['accumulation','confirm','recovering'].includes(obv.signal)].filter(Boolean).length;
            const confidenceLabel=greenCount>=3?'매수 확신 높음!':greenCount>=2?'매수 신호 양호':greenCount>=1?'일부 긍정 신호':'매수 신호 부족';
            const confidenceColor=greenCount>=3?'#3fb950':greenCount>=2?'#58a6ff':greenCount>=1?'#ffd600':'#f85149';
            const rows=[
              {name:'볼린저',icon:bbIcon,label:bbLabel,desc:bbDesc,color:bb.signal==='squeeze'?'#3fb950':bb.signal==='narrow'?'#ffd600':'#484f58'},
              {name:'MACD',icon:macdIcon,label:macdLabel,desc:macdDesc,color:['golden','bullish'].includes(macd.signal)?'#3fb950':macd.signal==='recovering'?'#ffd600':['dead','bearish'].includes(macd.signal)?'#f85149':'#484f58'},
              {name:'OBV',icon:obvIcon,label:obvLabel,desc:obvDesc,color:['accumulation','confirm'].includes(obv.signal)?'#3fb950':obv.signal==='recovering'?'#ffd600':['distribution','confirm_down'].includes(obv.signal)?'#f85149':'#484f58'},
            ];
            return <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px',border:'1px solid #1a1a2e'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'#e599f7'}}>◈ 보조 지표 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 매수 확신도 체크</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:confidenceColor,padding:'2px 8px',borderRadius:4,background:confidenceColor+'15'}}>{greenCount>=3?'🟢🟢🟢':greenCount>=2?'🟢🟢':greenCount>=1?'🟢':''} {confidenceLabel}</div>
              </div>
              {rows.map((r,i)=>(
                <div key={i} style={{display:'flex',alignItems:'flex-start',gap:8,padding:'6px 0',borderBottom:i<2?'1px solid #1a1a2e':'none'}}>
                  <div style={{fontSize:'16px',lineHeight:1}}>{r.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{fontSize:'11px',fontWeight:700,color:'#ccc'}}>{r.name}</span>
                      <span style={{fontSize:'10px',fontWeight:700,color:r.color}}>{r.label}</span>
                    </div>
                    <div style={{fontSize:'9px',color:'#8b949e',marginTop:1,lineHeight:1.3}}>{r.desc}</div>
                  </div>
                </div>
              ))}
            </div>;
          })()}

          {/* AI 분석 */}
          <div style={{background:'linear-gradient(135deg,#0a0a2e,#0d1830)',borderRadius:'10px',padding:'16px',border:'1px solid #1a2a4a'}}>
            <div style={{fontSize:'12px',fontWeight:700,color:'#f778ba',marginBottom:'12px'}}>🤖 AI 종합 분석</div>
            
            {/* 막대그래프 시각화 */}
            {(()=>{
              const {sepaPt,dmPt,vcpPt,mfPt,cfPt,volPt,crossPt}=verdict.details;
              const isETF = stock.s === 'ETF';
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
                  tag:vcpPt>=15?'지금!':vcpPt>=11?'거의':vcpPt>=10?'돌파!':vcpPt>=7?'돌파':vcpPt>=3?'기다려':'없음',
                  tagC:vcpPt>=10?'#3fb950':vcpPt>=3?'#ffd600':'#f85149',
                  desc:vcpPt>=15?'에너지 압축 완료!':vcpPt>=11?'패턴 거의 완성':vcpPt>=10?'수축 후 돌파 성공':vcpPt>=7?'피봇 돌파':vcpPt>=3?'만들어가는 중':'매수패턴 없음'},
                {name:isETF?'자금유입':'실적',sub:isETF?'VOL→MF':'MF',pt:mfPt,max:10,color:'#4dabf7',
                  tag:isETF?(mfPt>=8?'폭발':mfPt>=6?'유입':mfPt>=4?'보통':'유출'):(mfPt>=8?'우량':mfPt>=6?'양호':mfPt>=4?'보통':'약함'),
                  tagC:mfPt>=6?'#3fb950':mfPt>=4?'#ffd600':'#f85149',
                  desc:isETF?(mfPt>=8?'기관자금 대량유입':mfPt>=6?'거래량 증가중':mfPt>=4?'특이사항 없음':'자금 빠져나감'):(mfPt>=8?'매출·이익 성장':mfPt>=6?'대체로 괜찮음':mfPt>=4?'평균 수준':'실적 부족')},
                {name:isETF?'안정성':'현금',sub:isETF?'STAB':'CF',pt:cfPt,max:5,color:'#ff922b',
                  tag:isETF?(cfPt>=4?'안정':cfPt>=3?'보통':'불안'):(cfPt>=5?'좋음':cfPt>=3?'양호':cfPt>=2?'보통':'없음'),
                  tagC:cfPt>=3?'#3fb950':cfPt>=2?'#ffd600':'#f85149',
                  desc:isETF?(cfPt>=4?'안정적 상승추세':cfPt>=3?'보합 안정':cfPt>=2?'소폭 하락':'급락 불안정'):(cfPt>=5?'돈 잘 벌고 있음':cfPt>=3?'대체로 양수':cfPt>=2?'일부 약함':'현금 부족')},
                {name:'거래량',sub:'VOL',pt:volPt,max:12,color:'#ffa94d',
                  tag:volPt>=10?'매집!':volPt>=7?'양호':volPt>=4?'보통':volPt>=0?'주의':'세력이탈!',
                  tagC:volPt>=9?'#3fb950':volPt>=4?'#ffd600':volPt>=0?'#ff922b':'#f85149',
                  desc:volPt>=10?'큰손 매집 감지':volPt>=7?'건강한 거래량':volPt>=4?'특이사항 없음':volPt>=0?'변곡점 주의':'고점 거래량 폭발! 위험'},
              ];
              return <div style={{marginBottom:'14px'}}>
                {bars.map((b,i)=>{
                  const pct=Math.min(Math.abs(b.pt)/b.max*100,100);
                  const isNeg=b.pt<0;
                  return <div key={i} style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'6px'}}>
                    <div style={{width:'52px',fontSize:'10px',color:'#8b949e',textAlign:'right',lineHeight:1.2,flexShrink:0}}>
                      <div style={{color:'#ccc',fontWeight:600}}>{b.name}</div>
                      <div style={{fontSize:'8px'}}>{b.sub}</div>
                    </div>
                    <div style={{flex:1,height:'18px',background:isNeg?'#f8514915':'#161b22',borderRadius:'4px',position:'relative',overflow:'hidden',border:'1px solid '+(isNeg?'#f8514966':'#21262d')}}>
                      <div style={{width:pct+'%',height:'100%',background:isNeg?'linear-gradient(90deg,#f85149,#f8514988)':`linear-gradient(90deg,${b.color}88,${b.color})`,borderRadius:'3px',transition:'width 0.5s ease'}}/>
                      <div style={{position:'absolute',top:0,left:'6px',height:'100%',display:'flex',alignItems:'center',fontSize:'9px',color:isNeg?'#f85149':'#fff',fontWeight:600,textShadow:'0 0 3px #000'}}>{b.pt}/{b.max}</div>
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
  /* 보유종목 추가 검색 */
  const[pfAddSearch,setPfAddSearch]=useState('');
  const[pfAddOpen,setPfAddOpen]=useState(false);
  const[pfAddSelected,setPfAddSelected]=useState(null); // 선택된 종목 객체
  /* 자산관리
     calcData : 숫자값 → 계산/표시 전용 (localStorage 동기화)
     draftVals: 문자열값 → input 표시 전용 (onChange만 반영, blur시 calcData에 반영)
     분리 이유: onChange→calcData시 리렌더→포커스 날아감(모바일 키보드 닫힘) 방지 */
  const ADEF={cashKRW:0,cashUSD:0,fundKRW:0,fundUSD:0,otherKRW:0,otherUSD:0,fxRate:1380,memo:''};
  const _assetInit=()=>{try{const s=localStorage.getItem('asset_data');return s?{...ADEF,...JSON.parse(s)}:ADEF;}catch(e){return ADEF;}};
  const _draftInit=()=>{const d=_assetInit();return{cashKRW:d.cashKRW?String(d.cashKRW):'',cashUSD:d.cashUSD?String(d.cashUSD):'',fundKRW:d.fundKRW?String(d.fundKRW):'',fundUSD:d.fundUSD?String(d.fundUSD):'',otherKRW:d.otherKRW?String(d.otherKRW):'',otherUSD:d.otherUSD?String(d.otherUSD):'',fxRate:String(d.fxRate||1380),memo:d.memo||''};};
  const[calcData,setCalcData]=useState(_assetInit);
  const[draftVals,setDraftVals]=useState(_draftInit);
  const aRefs=useRef({});
  /* onDraftChange: input 표시(draftVals) + 계산(calcData) 동시 업데이트
     → 타이핑 즉시 전체자산현황 반영. value=draftVals이므로 리렌더해도 포커스 안 날아감 */
  const onDraftChange=useCallback((k,v)=>{
    setDraftVals(p=>({...p,[k]:v}));
    if(k!=='memo'){
      const num=Number(String(v).replace(/[^0-9.]/g,''))||0;
      setCalcData(p=>({...p,[k]:num}));
    } else {
      setCalcData(p=>({...p,[k]:v}));
    }
  },[]);
  /* onDraftBlur: blur시 localStorage만 저장 (calcData는 이미 onChange에서 최신) */
  const onDraftBlur=useCallback((k,v)=>{
    const num=(k==='memo')?v:(Number(String(v).replace(/[^0-9.]/g,''))||0);
    setCalcData(p=>{const n={...p,[k]:num};try{localStorage.setItem('asset_data',JSON.stringify(n));}catch(e){}return n;});
  },[]);
  const saveAsset=onDraftBlur; /* 하위 호환 */
  // v2: 거래 로그
  const[tradeLog,setTradeLog]=useState(()=>{
    try{const s=localStorage.getItem('trade_log');return s?JSON.parse(s):[];}catch(e){return[];}
  });
  const[sellModal,setSellModal]=useState(null); // {portIdx, stock, buyPrice, qty, name, ticker, isKR, score, execTag}
  // 등급 변화 히스토리
  const[gradeHistory,setGradeHistory]=useState(()=>{
    try{const s=localStorage.getItem('grade_history');return s?JSON.parse(s):{} }catch(e){return{};}
  });
  // 분석 상태
  const[anaRt,setAnaRt]=useState("idle");
  const[anaProg,setAnaProg]=useState(0);
  const[anaTime,setAnaTime]=useState(()=>{
    try{return localStorage.getItem('ana_time')||'-';}catch(e){return'-';}
  });
  const[isV1Cache,setIsV1Cache]=useState(false); // 구버전 캐시 감지
  const anaBusy=useRef(false);
  const busy=useRef(false);
  const autoRef=useRef(null);
  /* 듀얼모멘텀 필터 */
  const[dmFilter,setDmFilter]=useState("all");
  /* 시장필터 실시간 데이터 */
  const[MKT,setMKT]=useState(()=>{
    try{
      const c=localStorage.getItem('mkt_data');
      if(c){
        const parsed=JSON.parse(c);
        if(parsed.spy3m!=null) _SPY_BENCH.b3=parsed.spy3m;
        if(parsed.spy6m!=null) _SPY_BENCH.b6=parsed.spy6m;
        if(parsed.krRiskState==null) parsed.krRiskState="unknown";
        if(parsed.krRiskColor==null) parsed.krRiskColor="#484f58";
        if(parsed.krRiskLabel==null) parsed.krRiskLabel="⏳ 재조회 필요";
        if(parsed.krCanBuy==null) parsed.krCanBuy=true;
        if(parsed.krMaxPositionPct==null) parsed.krMaxPositionPct=100;
        return parsed;
      }
      return MKT_DEFAULT;
    }catch(e){return MKT_DEFAULT;}
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
  /* 섹터 추세 데이터 */
  const[TREND,setTREND]=useState(()=>{
    try{const c=localStorage.getItem('sector_trend');return c?JSON.parse(c):{loaded:false};}catch(e){return{loaded:false};}
  });
  const[trendRt,setTrendRt]=useState("idle");
  const[trendTime,setTrendTime]=useState(()=>{try{return localStorage.getItem('sector_trend_time')||'-';}catch(e){return'-';}});
  const[trendMarket,setTrendMarket]=useState("us"); /* 섹터추세 KR/US 탭 */
  /* localStorage에서 마지막 분석 결과 로드 */
  useEffect(()=>{
    try{
      const cached=localStorage.getItem('ana_data');
      if(cached){
        const parsed=JSON.parse(cached);
        // ── 버전 태그 검사 ──
        const savedVer = localStorage.getItem('ana_schema_ver');
        const savedTs  = localStorage.getItem('ana_time') || '-';
        if(savedVer && savedVer !== SCHEMA_VERSION){
          setIsV1Cache(true);
          log(`⚠️ 캐시 버전 불일치 (저장: ${savedVer} → 현재: ${SCHEMA_VERSION}) — 재분석 필요`,"er");
          return;
        }
        // ── 구버전 gate 필드 없는 캐시 감지 (fallback) ──
        const sampleKeys=Object.keys(parsed).slice(0,3);
        const isOldCache=sampleKeys.length>0 && !parsed[sampleKeys[0]]?.gate;
        if(isOldCache){ setIsV1Cache(true); return; }
        setStocks(prev=>prev.map(d=>{
          const a=parsed[d.t];
          if(!a)return d;
          return {...d,
            e:a.e||d.e,
            r:[a.r?a.r[0]:d.r[0], a.r?a.r[1]:d.r[1], d.r[2]],
            v:a.v||d.v,
            _volData:a.volData||null,
            _indicators:a.indicators||null,
            _gate:a.gate||null,
            _riskPenalty:a.riskPenalty||0,
            _riskReasons:a.riskReasons||[],
            _execTag:a.execTag||null,
          };
        }));
        log(`📂 분석 캐시 로드 [${SCHEMA_VERSION}] (${savedTs})`,"ok");
      }
    }catch(e){}
  },[]);

  const log=useCallback((msg,c="if")=>{
    setLogs(p=>[{ts:new Date().toLocaleTimeString("ko"),msg,c},...p].slice(0,80));
  },[]);

  /* watchlist localStorage 동기화 */
  useEffect(()=>{try{localStorage.setItem('watchlist',JSON.stringify(watchlist));}catch(e){}},[watchlist]);
  useEffect(()=>{try{localStorage.setItem('portfolio',JSON.stringify(portfolio));}catch(e){}},[portfolio]);
  useEffect(()=>{try{localStorage.setItem('trade_log',JSON.stringify(tradeLog));}catch(e){}},[tradeLog]);

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
    const data=JSON.stringify({w:watchlist,p:portfolio,gh:gradeHistory,tl:tradeLog,ad:calcData,ts:Date.now()});
    const code=btoa(unescape(encodeURIComponent(data)));
    navigator.clipboard.writeText(code).then(()=>setSyncMsg('✅ 코드 복사 완료! (워치+보유+자산+거래로그 포함)')).catch(()=>{
      setSyncInput(code);setSyncMsg('📋 아래 코드를 복사하세요:');
    });
    setTimeout(()=>setSyncMsg(''),5000);
  },[watchlist,portfolio,gradeHistory,tradeLog,calcData]);

  const doImport=useCallback(()=>{
    try{
      const json=JSON.parse(decodeURIComponent(escape(atob(syncInput.trim()))));
      if(json.w)setWatchlist(json.w);
      if(json.p)setPortfolio(json.p);
      if(json.gh){setGradeHistory(json.gh);try{localStorage.setItem('grade_history',JSON.stringify(json.gh));}catch(e){}}
      if(json.tl){setTradeLog(json.tl);try{localStorage.setItem('trade_log',JSON.stringify(json.tl));}catch(e){}}
      if(json.ad){
        setCalcData(p=>({...p,...json.ad}));
        /* draftVals도 동기화 → input에 즉시 반영 */
        setDraftVals({
          cashKRW:json.ad.cashKRW?String(json.ad.cashKRW):'',
          cashUSD:json.ad.cashUSD?String(json.ad.cashUSD):'',
          fundKRW:json.ad.fundKRW?String(json.ad.fundKRW):'',
          fundUSD:json.ad.fundUSD?String(json.ad.fundUSD):'',
          otherKRW:json.ad.otherKRW?String(json.ad.otherKRW):'',
          otherUSD:json.ad.otherUSD?String(json.ad.otherUSD):'',
          fxRate:String(json.ad.fxRate||1380),
          memo:json.ad.memo||''
        });
        try{localStorage.setItem('asset_data',JSON.stringify(json.ad));}catch(e){}
      }
      const parts=[`워치${(json.w||[]).length}개`,`보유${(json.p||[]).length}개`];
      if(json.ad)parts.push('자산금액');
      if(json.tl)parts.push(`거래로그${json.tl.length}건`);
      setSyncMsg('✅ 가져오기 완료! '+parts.join(' + '));
      setSyncInput('');
    }catch(e){setSyncMsg('❌ 잘못된 코드입니다.');}
    setTimeout(()=>setSyncMsg(''),5000);
  },[syncInput,aRefs]);

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
        _indicators: a.indicators,
        _gate: a.gate||null,
        _riskPenalty: a.riskPenalty||0,
        _riskReasons: a.riskReasons||[],
        _execTag: a.execTag||null,
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
      localStorage.setItem('ana_schema_ver', SCHEMA_VERSION); // 버전 태그 저장
      const timeStr=new Date().toLocaleString("ko");
      localStorage.setItem('ana_time',timeStr);
      setAnaTime(timeStr);
      setIsV1Cache(false); // 새 분석 완료 → 구버전 배너 해제
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
        kospi6m:d.kospi?.r6m||0,
        kospi3m:d.kospi?.r3m||0,
        kospiAbove200:d.kospi?.above200,
        kospiAbove50:d.kospi?.above50,
        kospiSma200:d.kospi?.sma200,
        kospiSma50:d.kospi?.sma50,
        kospiSma200Rising:d.kospi?.sma200Rising,
        kospiPrice:d.kospi?.price,
        vix:d.vix?.value||0,
        vixLevel:d.vix?.level||"-",
        nh:"-",ad:"-",
        sec:(d.sectors||[]).map(s=>[s.sym,s.r3m,s.r1m||0]),
        health:d.health||MKT_DEFAULT.health,
        // v2: US Risk State (SPY/VIX 기반)
        riskState:d.health?.riskState||"unknown",
        riskColor:d.health?.riskColor||"#484f58",
        riskLabel:d.health?.riskLabel||"⏳",
        canBuy:d.health?.canBuy!==false,
        maxPositionPct:d.health?.maxPositionPct??100,
        // v2: KR Risk State (KOSPI 기반 — 한국 종목 전용)
        krRiskState:d.health?.krRiskState||"unknown",
        krRiskColor:d.health?.krRiskColor||"#484f58",
        krRiskLabel:d.health?.krRiskLabel||"⏳",
        krCanBuy:d.health?.krCanBuy!==false,
        krMaxPositionPct:d.health?.krMaxPositionPct??100,
        loaded:true
      };
      setMKT(newMKT);
      // v2: 전역 SPY 벤치마크 실시간 업데이트 → getDualMomentum에 반영
      if (d.spy?.r3m != null) _SPY_BENCH.b3 = d.spy.r3m;
      if (d.spy?.r6m != null) _SPY_BENCH.b6 = d.spy.r6m;
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

  /* ============ 섹터 추세 갱신 ============ */
  const doSectorTrend=useCallback(async()=>{
    if(trendRt==="fetching")return;
    setTrendRt("fetching");
    log("📊 섹터 주간 추세 갱신 시작 (한국+미국)","if");
    try{
      // stocks 데이터에서 score 포함해서 전달
      const payload=stocks.map(d=>{
        const vd=getVerdict(d);
        return {t:d.t,n:d.n,k:!!d.k,s:d.s,score:vd.totalPt,verdict:vd.verdict};
      });
      const resp=await fetch("/api/sectorTrend",{
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({stocks:payload}),
        signal:AbortSignal.timeout(120000)
      });
      if(!resp.ok)throw new Error("API "+resp.status);
      const json=await resp.json();
      if(!json.kr||!json.us)throw new Error("No data");
      const newTREND={...json,loaded:true};
      setTREND(newTREND);
      try{
        localStorage.setItem('sector_trend',JSON.stringify(newTREND));
        const ts=new Date().toLocaleString("ko");
        localStorage.setItem('sector_trend_time',ts);
        setTrendTime(ts);
      }catch(e){}
      log(`📊 섹터 추세 완료! 한국 ${json.kr.sectors?.length}섹터, 미국 ${json.us.sectors?.length}섹터`,"ok");
      setTrendRt("done");
    }catch(e){
      log(`❌ 섹터 추세 실패: ${e.message}`,"er");
      setTrendRt("error");
    }
    setTimeout(()=>setTrendRt("idle"),4000);
  },[log,trendRt,stocks]);

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
          {d.s==='ETF' ? (<>
            <div style={{fontSize:14,fontWeight:700,color:"#39d353",marginBottom:4}}>자금유입</div>
            <IR l="비율" v={(d._volData?.volRatio||1)+"x"} c={(d._volData?.volRatio||1)>=1.5?"#3fb950":"#d29922"}/>
            <IR l="5일변화" v={(d._volData?.priceChg5d>0?"+":"")+(d._volData?.priceChg5d||0)+"%"} c={(d._volData?.priceChg5d||0)>0?"#3fb950":"#f85149"}/>
            <IR l="52주위치" v={(d._volData?.positionPct||0)+"%"} c={(d._volData?.positionPct||0)>=50?"#3fb950":"#d29922"}/>
          </>) : (<>
            <div style={{fontSize:14,fontWeight:700,color:"#39d353",marginBottom:4}}>멀티팩터</div>
            <IR l="종합" v={(mfTs(d)).toFixed(2)} c={mfTs(d)>=2?"#3fb950":"#d29922"}/>
            <IR l="방향" v={mfTd(d)+(mfAl(d)?" ⚡":"")} c={mfTd(d)==="매수"?"#3fb950":"#f85149"}/>
            <IR l="펀더" v={(d.f||0)+"점"} c={d.f>=80?"#3fb950":"#d29922"}/>
          </>)}
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
    <div style={{background:"#06080d",color:"#e6edf3",minHeight:"100vh",fontFamily:"'Noto Sans KR',system-ui,sans-serif",overflowX:"hidden"}} suppressHydrationWarning>
      {/* Header */}
      <div className="dash-header" style={{background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",borderBottom:"1px solid #21262d",padding:"12px 20px"}}>
        <div style={{maxWidth:1800,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h1 className="dash-title" style={{fontSize:22,fontWeight:900,background:"linear-gradient(135deg,#58a6ff,#bc8cff,#f778ba)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>{isMobile?("⚡ 듀얼엔진 ("+D.length+")"):("⚡ 듀얼 엔진 프로 — MF × SEPA × 듀얼모멘텀 ("+D.length+"종목)")}</h1>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            {MKT.loaded && <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:5,background:MKT.health?.modeColor+"20",border:"1px solid "+(MKT.health?.modeColor)+"44",color:MKT.health?.modeColor}}>{MKT.health?.modeIcon} {MKT.health?.mode}</span>}
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
        {/* 캐시 버전 불일치 / 구버전 캐시 감지 배너 */}
        {isV1Cache && anaRt!=="fetching" && <div style={{marginTop:4,padding:"8px 14px",background:"linear-gradient(90deg,#2d1b0020,#3d2b1020)",border:"1px solid #ff922b55",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:11,color:"#ff922b"}}>
            ⚡ <b>스키마 업데이트 ({SCHEMA_VERSION})</b> — 저장된 분석 결과가 현재 로직과 다릅니다. 정확한 점수를 위해 <b>재분석</b>을 실행하세요.
          </div>
          <button onClick={()=>setIsV1Cache(false)} style={{background:"transparent",border:"none",color:"#484f58",cursor:"pointer",fontSize:13,padding:"0 4px",flexShrink:0}}>✕</button>
        </div>}
      </div>

      {showLog && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px",background:"#06080d"}}><div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:6,padding:"6px 10px",maxHeight:100,overflowY:"auto",fontFamily:"'JetBrains Mono'",fontSize:12}}>{logs.map((l,i)=><div key={i} style={{padding:"1px 0"}}><span style={{color:"#484f58",marginRight:4}}>{l.ts}</span><span style={{color:l.c==="ok"?"#3fb950":l.c==="er"?"#f85149":"#58a6ff"}}>{l.msg}</span></div>)}</div></div>}

      {/* Tab Nav */}
      <div className="tab-nav" style={{maxWidth:1800,margin:"6px auto",padding:"0 20px"}}>
        <div style={{display:"flex",gap:4,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2,scrollbarWidth:"none"}}>
          {[["main",isMobile?"📊":"📊 메인"],["watch",isMobile?("👁"+watchlist.length):("👁 워치("+watchlist.length+")")],["port",isMobile?"💼":"💼 보유종목"],["asset",isMobile?"💰":"💰 자산관리"],["filter",isMobile?"🌐":"🌐 시장필터"],["calc",isMobile?"🧮":"🧮 포지션"],["check",isMobile?"✅":"✅ 체크리스트"],["guide",isMobile?"📖":"📖 가이드"]].map(([k,l])=>
            <Tb key={k} label={l} active={tab===k} onClick={()=>setTab(k)}/>
          )}
        </div>
      </div>

      {/* ============ 시장필터 탭 ============ */}
      {tab==="filter" && <div style={{maxWidth:1800,margin:"0 auto",background:"#06080d",padding:"6px 20px"}}>
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
            <div style={{background:MKT.health?.modeColor+"12",border:"2px solid "+(MKT.health?.modeColor)+"44",borderRadius:10,padding:16,marginBottom:12,display:"flex",alignItems:"center",gap:16}}>
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
                {/* v2: DM 벤치마크 적용 현황 */}
                <div style={{marginTop:8,padding:"4px 8px",background:"#bc8cff12",borderRadius:5,border:"1px solid #bc8cff22",fontSize:10,color:"#bc8cff"}}>
                  📐 DM벤치 (실시간 적용 중)<br/>
                  <span style={{fontFamily:"'JetBrains Mono'",fontSize:11}}>
                    3M: <b>{MKT.spy3m!=null?MKT.spy3m.toFixed(1):"4.2"}%</b>
                    &nbsp;·&nbsp;6M: <b>{MKT.spy6m!=null?MKT.spy6m.toFixed(1):"8.7"}%</b>
                  </span>
                  <span style={{color:"#484f58",marginLeft:4}}>{MKT.spy3m!=null?"✅ 실시간":"⏳ 기본값"}</span>
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
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginTop:6,fontSize:11}}>
                  <div>200MA: <b style={{color:MKT.kospiAbove200?"#3fb950":"#f85149"}}>{MKT.kospiAbove200?"위 ✅":"아래 ❌"}</b></div>
                  <div>200MA추세: <b style={{color:MKT.kospiSma200Rising?"#3fb950":"#f85149"}}>{MKT.kospiSma200Rising?"상승✅":"하락❌"}</b></div>
                  <div>50MA: <b style={{color:MKT.kospiAbove50?"#3fb950":"#f85149"}}>{MKT.kospiAbove50!=null?(MKT.kospiAbove50?"위 ✅":"아래 ❌"):"조회중"}</b></div>
                  <div>12M: <b style={{color:MKT.kospi12m>0?"#3fb950":"#f85149"}}>{MKT.kospi12m>0?"+":""}{MKT.kospi12m}%</b></div>
                  <div>6M: <b style={{color:(MKT.kospi6m||0)>0?"#3fb950":"#f85149"}}>{(MKT.kospi6m||0)>0?"+":""}{MKT.kospi6m||"-"}%</b></div>
                  <div>3M: <b style={{color:(MKT.kospi3m||0)>0?"#3fb950":"#f85149"}}>{(MKT.kospi3m||0)>0?"+":""}{MKT.kospi3m||"-"}%</b></div>
                </div>
                {/* KR Risk State 뱃지 */}
                <div style={{marginTop:8,padding:"4px 8px",background:(MKT.krRiskColor||"#484f58")+"15",borderRadius:5,border:"1px solid "+(MKT.krRiskColor||"#484f58")+"33",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,fontWeight:800,color:MKT.krRiskColor||"#484f58"}}>{MKT.krRiskLabel||"⏳ 조회전"}</span>
                  <span style={{fontSize:10,color:"#8b949e"}}>최대 {MKT.krMaxPositionPct??100}%</span>
                </div>
              </div>
            </div>

            {/* 건강도 체크리스트 */}
            {MKT.health?.details && <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#58a6ff",marginBottom:8}}>🩺 시장 건강도 체크리스트</div>
              {/* v2: US / KR Risk State 분리 표시 */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:8}}>
                {MKT.riskLabel && <div style={{padding:"6px 10px",background:(MKT.riskColor||"#484f58")+"15",border:"1px solid "+(MKT.riskColor||"#484f58")+"44",borderRadius:6}}>
                  <div style={{fontSize:10,color:"#8b949e",marginBottom:2}}>🇺🇸 미국 (SPY/VIX)</div>
                  <div style={{fontSize:12,fontWeight:800,color:MKT.riskColor||"#484f58"}}>{MKT.riskLabel}</div>
                  <div style={{fontSize:10,color:"#8b949e"}}>최대 {MKT.maxPositionPct??100}%</div>
                </div>}
                {MKT.krRiskLabel && <div style={{padding:"6px 10px",background:(MKT.krRiskColor||"#484f58")+"15",border:"1px solid "+(MKT.krRiskColor||"#484f58")+"44",borderRadius:6}}>
                  <div style={{fontSize:10,color:"#8b949e",marginBottom:2}}>🇰🇷 한국 (KOSPI)</div>
                  <div style={{fontSize:12,fontWeight:800,color:MKT.krRiskColor||"#484f58"}}>{MKT.krRiskLabel}</div>
                  <div style={{fontSize:10,color:"#8b949e"}}>최대 {MKT.krMaxPositionPct??100}%</div>
                </div>}
              </div>
              <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:6}}>
                {[
                  ["SPY > 200MA",MKT.health.details.spyAbove200],
                  ["SPY > 50MA",MKT.health.details.spyAbove50],
                  ["200MA 상승추세",MKT.health.details.spy200Rising],
                  ["골든크로스(50>200)",MKT.health.details.spyGoldenCross],
                  ["SPY 12M 양수",MKT.health.details.spy12mPositive],
                  ["VIX < 25",MKT.health.details.vixLow],
                  ["KOSPI > 200MA",MKT.health.details.kospiAbove200],
                  ["KOSPI > 50MA",MKT.health.details.kospiAbove50],
                  ["KOSPI 골든크로스",MKT.health.details.kospiGoldenCross],
                  ["섹터 브레드스",MKT.health.details.sectorBreadth+" 상승"],
                ].map(([label,ok])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:6,padding:"4px 8px",borderRadius:6,background:ok?"#3fb95010":"#f8514910",border:"1px solid "+(ok?"#3fb95022":"#f8514922")+""}}>
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
            {SENTI.contrarian && <div style={{background:SENTI.contrarian.color+"12",border:"2px solid "+(SENTI.contrarian.color)+"44",borderRadius:8,padding:12,marginBottom:12,display:"flex",alignItems:"center",gap:12}}>
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
              return <div style={{marginTop:12,background:cColor+"12",border:"2px solid "+(cColor)+"44",borderRadius:10,padding:14}}>
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

        {/* ============ 섹터 주간 수익률 추세 ============ */}
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14,marginTop:10}}>
          {/* 헤더 + 갱신 버튼 */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#ffd43b"}}>📊 섹터별 주간 수익률 추세</div>
              <div style={{fontSize:10,color:"#484f58",marginTop:2}}>
                섹터당 점수 TOP 3 종목 평균 · 최근 10거래일 기준
                {trendTime!=='-'&&<span style={{marginLeft:8}}>갱신: {trendTime}</span>}
              </div>
            </div>
            <button onClick={doSectorTrend} disabled={trendRt==="fetching"}
              style={{padding:"6px 14px",borderRadius:6,border:"1px solid #ffd43b",
                background:trendRt==="fetching"?"#ffd43b25":"#ffd43b12",
                color:"#ffd43b",cursor:trendRt==="fetching"?"wait":"pointer",
                fontSize:12,fontWeight:700,whiteSpace:"nowrap"}}>
              {trendRt==="fetching"?"⏳ 분석중...":trendRt==="done"?"✅ 완료":"📊 추세 갱신"}
            </button>
          </div>

          {!TREND.loaded && <div style={{textAlign:"center",padding:30,color:"#484f58",fontSize:13}}>
            ⏳ 추세 갱신 버튼을 누르면 한국/미국 섹터별 10거래일 수익률을 가져옵니다.<br/>
            <span style={{fontSize:11}}>섹터당 점수 TOP 3 종목을 자동 선정합니다 (약 1~2분)</span>
          </div>}

          {TREND.loaded && <div>
            <div style={{display:"flex",gap:8,marginBottom:12}}>
              {[["kr","🇰🇷 한국"],["us","🇺🇸 미국"]].map(([k,l])=>(
                <button key={k} onClick={()=>setTrendMarket(k)}
                  style={{padding:"6px 16px",borderRadius:6,fontSize:12,fontWeight:700,cursor:"pointer",
                    border:"1px solid "+(trendMarket===k?"#ffd43b":"#21262d"),
                    background:trendMarket===k?"#ffd43b15":"#161b22",
                    color:trendMarket===k?"#ffd43b":"#8b949e"}}>
                  {l}
                </button>
              ))}
              <span style={{fontSize:10,color:"#484f58",alignSelf:"center",marginLeft:4}}>
                {trendMarket==="kr"
                  ?`${TREND.kr?.sectors?.length||0}개 섹터 · ${TREND.kr?.dates?.length||0}거래일`
                  :`${TREND.us?.sectors?.length||0}개 섹터 · ${TREND.us?.dates?.length||0}거래일`}
              </span>
            </div>
            <SectorChart
              trendData={trendMarket==="kr"?TREND.kr:TREND.us}
              isMobile={isMobile}
              market={trendMarket}
              onSectorNav={(s,mkt)=>{setMk(mkt);setSec(s);}}/>
          </div>}
        </div>
      </div>}

      {/* ============ 포지션 계산기 ============ */}
      {tab==="calc" && <div style={{maxWidth:1800,margin:"0 auto",background:"#06080d",padding:"6px 20px"}}>
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
            return <div style={{background:vd.color+"08",border:"1px solid "+(vd.color)+"33",borderRadius:8,padding:12,marginBottom:12}}>
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

            // v2: 종목 국적에 따라 KR/US 시장 상태 분리 적용
            const isKRStock = posCal.selStock?.k || posCal.isKR;
            const activeMktPct = isKRStock ? (MKT.krMaxPositionPct??100) : (MKT.maxPositionPct??100);
            const activeMktState = isKRStock ? (MKT.krRiskState||"unknown") : (MKT.riskState||"unknown");
            const activeMktColor = isKRStock ? (MKT.krRiskColor||"#484f58") : (MKT.riskColor||"#484f58");
            const activeMktLabel = isKRStock ? (MKT.krRiskLabel||"") : (MKT.riskLabel||"");
            const mktMult = activeMktPct / 100;
            const selScore=posCal.selStock?getVerdict(posCal.selStock).totalPt:0;
            const scoreMult=selScore>=85?1.0:selScore>=75?0.75:selScore>=65?0.5:0;
            const recPct=+(pc*mktMult*scoreMult).toFixed(1);
            const recSh=Math.floor(recPct/100*acct/entry);
            const recSz=recSh*entry;

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
              {/* v2: 시장 상태 × 점수 기반 권장 포지션 — KR/US 분리 적용 */}
              {MKT.loaded && <div style={{marginTop:10,padding:"10px 14px",background:activeMktColor+"12",border:"1px solid "+(activeMktColor)+"44",borderRadius:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                    <span style={{fontSize:11,color:"#484f58"}}>{isKRStock?"🇰🇷 한국주식":"🇺🇸 미국주식"}</span>
                    <span style={{fontSize:12,fontWeight:800,color:activeMktColor}}>{activeMktLabel||"시장상태"}</span>
                    <span style={{fontSize:11,color:"#8b949e"}}>배수 {(mktMult*100).toFixed(0)}% × 점수 {(scoreMult*100).toFixed(0)}%</span>
                  </div>
                  {scoreMult===0 && <span style={{fontSize:11,fontWeight:700,color:"#f85149"}}>🚫 점수 부족 — 매수 금지</span>}
                  {mktMult===0 && <span style={{fontSize:11,fontWeight:700,color:"#f85149"}}>🚫 {isKRStock?"KOSPI":"SPY"} 위험 — 매수 금지</span>}
                </div>
                {mktMult===0&&<div style={{marginTop:4,fontSize:10,color:"#ff8a80"}}>{isKRStock?"KOSPI가 200일선 아래이거나 50일선 아래입니다.":"SPY가 200일선 아래이거나 VIX≥30입니다."} 현금 보유를 권장합니다.</div>}
                {mktMult>0 && scoreMult>0 && <div style={{marginTop:8,display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6}}>
                  <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#484f58"}}>권장 수량</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#bc8cff",fontFamily:"'JetBrains Mono'"}}>{recSh}주</div>
                  </div>
                  <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#484f58"}}>권장 투자금</div>
                    <div style={{fontSize:16,fontWeight:800,color:"#58a6ff",fontFamily:"'JetBrains Mono'"}}>{fN(recSz)}</div>
                  </div>
                  <div style={{background:"#0d1117",borderRadius:6,padding:"6px 8px",textAlign:"center"}}>
                    <div style={{fontSize:9,color:"#484f58"}}>권장 비중</div>
                    <div style={{fontSize:16,fontWeight:800,color:recPct>20?"#f85149":recPct>10?"#ffd600":"#3fb950",fontFamily:"'JetBrains Mono'"}}>{recPct}%</div>
                  </div>
                </div>}
              </div>}

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
                  return warns.map((w,i)=><div key={i} style={{padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,background:w.c+"12",border:"1px solid "+(w.c)+"33",color:w.c}}>{w.t}</div>);
                })()}
              </div>
            </>;
          })()}

        </div>
      </div>}

      {/* ============ 체크리스트 탭 ============ */}
      {tab==="check" && <div style={{maxWidth:1800,margin:"0 auto",background:"#06080d",padding:"6px 20px"}}>
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
              return(<div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:6,background:isChecked?"#0d2818":"#1a1a1a",border:"1px solid "+(isChecked?"#00ff8833":"#222")+"",cursor:item.auto?"default":"pointer",opacity:!selectedChkStock&&item.auto?0.5:1}}
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
            return(<div style={{marginTop:12,padding:14,borderRadius:8,background:color+'15',border:"2px solid "+(color)+"33",textAlign:"center"}}>
              <div style={{fontSize:22,fontWeight:800,color}}>{total}/10</div>
              <div style={{fontSize:13,fontWeight:600,color,marginTop:2}}>{msg}</div>
            </div>);
          })()}
        </div>
      </div>}

      {/* ============ 워치리스트 탭 ============ */}
      {tab==="watch" && <div style={{maxWidth:1800,margin:"0 auto",background:"#06080d",padding:"6px 20px"}}>
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

            {/* 🚀 상승 전환 신호 */}
            {(()=>{
              const turnUp=stocks.filter(d=>watchlist.includes(d.t)).filter(d=>{
                const vd=getVerdict(d);
                if(vd.totalPt>=80)return false; // 이미 최강은 제외
                const ind=d._indicators;
                const vol=d._volData;
                let bullCount=0;
                if(vol&&vol.signalType==='buy')bullCount++;
                if(ind&&['golden','bullish','recovering'].includes(ind.macd.signal))bullCount++;
                if(ind&&['accumulation','confirm','recovering'].includes(ind.obv.signal))bullCount++;
                return bullCount>=2; // 3개 중 2개 이상 매수 신호
              });
              if(turnUp.length===0)return null;
              return <div style={{background:"#3fb95012",border:"1px solid #3fb95044",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#3fb950",marginBottom:4}}>🚀 상승 전환 신호 ({turnUp.length}종목)</div>
                <div style={{fontSize:9,color:"#69db7c",marginBottom:8}}>거래량·MACD·OBV 중 2개 이상 매수 신호 — 매수 타이밍 근접!</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {turnUp.map(d=>{
                    const ind=d._indicators;const vol=d._volData;const vd=getVerdict(d);
                    const tags=[];
                    if(vol&&vol.signalType==='buy')tags.push(vol.signal||'거래량🟢');
                    if(ind&&ind.macd.signal==='golden')tags.push('골든크로스🟢');
                    else if(ind&&ind.macd.signal==='bullish')tags.push('MACD상승🟢');
                    else if(ind&&ind.macd.signal==='recovering')tags.push('MACD반등🟡');
                    if(ind&&ind.obv.signal==='accumulation')tags.push('스마트머니매집🟢');
                    else if(ind&&ind.obv.signal==='confirm')tags.push('OBV상승🟢');
                    else if(ind&&ind.obv.signal==='recovering')tags.push('OBV반등🟡');
                    return <div key={d.t} onClick={()=>{setDetailStock(d);setShowDetail(true);}}
                      style={{padding:"5px 10px",background:"#3fb95010",borderRadius:6,cursor:"pointer",border:"1px solid #3fb95033"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <span style={{fontSize:11,fontWeight:700,color:"#69db7c"}}>{d.n}</span>
                        <span style={{fontSize:10,fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>{vd.totalPt}</span>
                      </div>
                      <div style={{fontSize:8,color:"#3fb950",marginTop:2}}>{tags.join(' · ')}</div>
                    </div>;
                  })}
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
                      <td style={{padding:"4px 6px",textAlign:"center",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:70}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                          <span style={{fontSize:12,fontWeight:800,color:vd.color}}>{vd.verdict}</span>
                          <span style={{fontSize:10,color:"#484f58",fontFamily:"'JetBrains Mono'",fontWeight:700}}>{vd.totalPt}</span>
                        </div>
                        {d._execTag && (()=>{const tC={'BUY NOW':'#00e676','BUY ON BREAKOUT':'#448aff','WATCH':'#ffd600','AVOID':'#f85149'}[d._execTag]||'#aaa';const tL={'BUY NOW':'⚡NOW','BUY ON BREAKOUT':'📈BRK','WATCH':'👀WATCH','AVOID':'🚫AVOID'}[d._execTag]||d._execTag;return <div style={{fontSize:8,fontWeight:700,color:tC,marginTop:1,whiteSpace:'nowrap'}}>{tL}</div>;})()}
                        {vd.details.gateLabel && <div style={{fontSize:7,color:'#f85149',marginTop:1,fontWeight:700,whiteSpace:'nowrap'}}>{vd.details.gateLabel}</div>}
                        {!vd.details.gateLabel && vd.details.riskPenalty>0 && <div style={{fontSize:7,color:'#ff922b',marginTop:1,fontWeight:600}}>⚠️Risk-{vd.details.riskPenalty}</div>}
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
      {tab==="port" && <div style={{maxWidth:1800,margin:"0 auto",background:"#06080d",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#bc8cff",fontSize:16,marginBottom:12,marginTop:0}}>💼 보유종목</h3>

          {/* 종목 검색 추가 폼 */}
          {(()=>{
            const addResults = pfAddSearch.trim().length>=1
              ? stocks.filter(d=>
                  d.n.toLowerCase().includes(pfAddSearch.toLowerCase()) ||
                  d.t.toLowerCase().includes(pfAddSearch.toLowerCase())
                ).slice(0,8)
              : [];
            const vd = pfAddSelected ? getVerdict(pfAddSelected) : null;
            return (
              <div style={{marginBottom:14,background:"#161b22",borderRadius:10,border:"1px solid #21262d",padding:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#8b949e",marginBottom:8}}>➕ 종목 추가</div>

                {/* 검색 인풋 */}
                <div style={{position:"relative",marginBottom:pfAddSelected?10:0}}>
                  <input
                    placeholder="🔍 종목명 또는 티커로 검색 (예: 삼성, AAPL)"
                    value={pfAddSearch}
                    onChange={e=>{setPfAddSearch(e.target.value);setPfAddOpen(true);if(!e.target.value)setPfAddSelected(null);}}
                    onFocus={()=>setPfAddOpen(true)}
                    style={{padding:"9px 14px",borderRadius:8,border:"1px solid "+(pfAddSelected?"#bc8cff":"#21262d"),background:"#0d1117",color:"#e6edf3",fontSize:13,width:"100%",outline:"none",boxSizing:"border-box"}}
                  />

                  {/* 드롭다운 */}
                  {pfAddOpen && addResults.length>0 && (
                    <div style={{position:"absolute",top:"100%",left:0,right:0,background:"#161b22",border:"1px solid #30363d",borderRadius:8,zIndex:100,marginTop:2,boxShadow:"0 8px 24px rgba(0,0,0,.5)",maxHeight:280,overflowY:"auto"}}>
                      {addResults.map(d=>{
                        const dv=getVerdict(d);
                        return (
                          <div key={d.t}
                            onClick={()=>{
                              setPfAddSelected(d);
                              setPfAddSearch(d.n+" ("+d.t+")");
                              setPfAddOpen(false);
                              setPfForm(p=>({...p,ticker:d.t,buyPrice:d.p?+(d.p.toFixed(d.k?0:2)):0}));
                            }}
                            style={{padding:"9px 14px",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center",borderBottom:"1px solid #21262d22"}}
                            onMouseEnter={e=>e.currentTarget.style.background="#21262d"}
                            onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                          >
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:11}}>{d.k?"🇰🇷":"🇺🇸"}</span>
                              <div>
                                <div style={{fontSize:13,fontWeight:600,color:"#e6edf3"}}>{d.n}</div>
                                <div style={{fontSize:10,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{d.t} · {d.s}</div>
                              </div>
                            </div>
                            <div style={{textAlign:"right"}}>
                              <div style={{fontSize:12,fontWeight:700,color:dv.color}}>{dv.verdict}</div>
                              <div style={{fontSize:11,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{d.p?fP(d.p,d.k):"-"}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 선택된 종목 정보 + 매수가·수량 입력 */}
                {pfAddSelected && vd && (
                  <div style={{background:"#0d1117",borderRadius:8,padding:"10px 12px",border:"1px solid "+(vd.color)+"33"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                      <div>
                        <span style={{fontSize:14,fontWeight:700,color:"#e6edf3"}}>{pfAddSelected.k?"🇰🇷":"🇺🇸"} {pfAddSelected.n}</span>
                        <span style={{fontSize:11,color:"#484f58",marginLeft:6,fontFamily:"'JetBrains Mono'"}}>{pfAddSelected.t}</span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <span style={{fontSize:12,fontWeight:800,color:vd.color}}>{vd.verdict} {vd.totalPt}점</span>
                        <div style={{fontSize:11,color:"#8b949e",fontFamily:"'JetBrains Mono'"}}>{pfAddSelected.p?fP(pfAddSelected.p,pfAddSelected.k):"-"}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:10,color:"#484f58"}}>매수가</span>
                        <input type="number" value={pfForm.buyPrice||''} onChange={e=>setPfForm(p=>({...p,buyPrice:e.target.value}))}
                          style={{padding:"6px 10px",borderRadius:6,border:"1px solid #30363d",background:"#161b22",color:"#e6edf3",fontSize:13,width:120,fontFamily:"'JetBrains Mono'",outline:"none"}}/>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:2}}>
                        <span style={{fontSize:10,color:"#484f58"}}>수량</span>
                        <input type="number" value={pfForm.qty||''} onChange={e=>setPfForm(p=>({...p,qty:e.target.value}))}
                          style={{padding:"6px 10px",borderRadius:6,border:"1px solid #30363d",background:"#161b22",color:"#e6edf3",fontSize:13,width:80,fontFamily:"'JetBrains Mono'",outline:"none"}}/>
                      </div>
                      {pfForm.buyPrice>0 && pfForm.qty>0 && (
                        <div style={{display:"flex",flexDirection:"column",gap:2}}>
                          <span style={{fontSize:10,color:"#484f58"}}>예상 손절가</span>
                          <span style={{padding:"6px 10px",fontSize:13,fontWeight:700,color:"#ff922b",fontFamily:"'JetBrains Mono'"}}>{fP(+(pfForm.buyPrice*0.93).toFixed(pfAddSelected.k?0:2),pfAddSelected.k)}</span>
                        </div>
                      )}
                      <button
                        onClick={()=>{
                          if(!pfForm.ticker||!pfForm.buyPrice||!pfForm.qty)return;
                          addPortfolio(pfForm.ticker,pfForm.buyPrice,pfForm.qty,0);
                          setPfForm({ticker:'',buyPrice:0,qty:0,stopLoss:0});
                          setPfAddSelected(null);
                          setPfAddSearch('');
                        }}
                        disabled={!pfForm.buyPrice||!pfForm.qty}
                        style={{padding:"8px 20px",borderRadius:6,border:"1px solid #bc8cff",background:(!pfForm.buyPrice||!pfForm.qty)?"#21262d":"#bc8cff25",color:(!pfForm.buyPrice||!pfForm.qty)?"#484f58":"#bc8cff",cursor:(!pfForm.buyPrice||!pfForm.qty)?"not-allowed":"pointer",fontSize:13,fontWeight:700,marginTop:16,alignSelf:"flex-end"}}>
                        ✅ 추가
                      </button>
                      <button onClick={()=>{setPfAddSelected(null);setPfAddSearch('');setPfForm({ticker:'',buyPrice:0,qty:0,stopLoss:0});}}
                        style={{padding:"8px 12px",borderRadius:6,border:"1px solid #21262d",background:"transparent",color:"#484f58",cursor:"pointer",fontSize:12,marginTop:16,alignSelf:"flex-end"}}>
                        취소
                      </button>
                    </div>
                    <div style={{fontSize:10,color:"#484f58",marginTop:8}}>손절가 자동계산: 진입 -7% / 트레일링 최고가 -9%</div>
                  </div>
                )}
              </div>
            );
          })()}

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
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:flag==='🇰🇷'?'#ff922b':'#4dabf7',marginBottom:6}}>{flag} {label}</div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"4px 12px"}}>
                    <div><div style={{fontSize:9,color:"#484f58"}}>매수금액</div><div style={{fontSize:13,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{unit}{buy.toLocaleString()}</div></div>
                    <div><div style={{fontSize:9,color:"#484f58"}}>평가금액</div><div style={{fontSize:13,fontWeight:700,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{unit}{Math.round(cur).toLocaleString()}</div></div>
                    <div><div style={{fontSize:9,color:"#484f58"}}>손익</div><div style={{fontSize:13,fontWeight:700,color:pnl>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pnl>=0?"+":""}{Math.round(pnl).toLocaleString()}</div></div>
                    <div><div style={{fontSize:9,color:"#484f58"}}>수익률</div><div style={{fontSize:13,fontWeight:700,color:pct>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pct>=0?"+":""}{pct.toFixed(2)}%</div></div>
                  </div>
                </div>
              );
              return <div style={{padding:"10px 14px",background:"linear-gradient(135deg,#0d1117,#161b22)",borderRadius:8,marginBottom:14,border:"1px solid #21262d"}}>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {hasKR&&<SumRow label="원화" flag="🇰🇷" buy={krBuy} cur={krCur} pnl={krPnl} pct={krPct} unit="₩"/>}
                  {hasKR&&hasUS&&<div style={{borderTop:"1px solid #21262d"}}/>}
                  {hasUS&&<SumRow label="달러" flag="🇺🇸" buy={usBuy} cur={usCur} pnl={usPnl} pct={usPct} unit="$"/>}
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

            {/* ⚠️ 보유종목 하락 전환 경고 */}
            {(()=>{
              const holdTurn=portfolio.filter(p=>{
                const s=stocks.find(d=>d.t===p.ticker);
                if(!s)return false;
                const ind=s._indicators;const vol=s._volData;
                let wc=0;
                if(vol&&vol.signalType==='sell')wc++;
                if(ind&&['dead','bearish'].includes(ind.macd.signal))wc++;
                if(ind&&['distribution','confirm_down'].includes(ind.obv.signal))wc++;
                return wc>=2;
              }).map(p=>({p,s:stocks.find(d=>d.t===p.ticker)})).filter(x=>x.s);
              if(holdTurn.length===0)return null;
              return <div style={{background:"linear-gradient(135deg,#f8514912,#ff922b08)",border:"1px solid #f8514944",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#ff922b",marginBottom:4}}>⚠️ 하락 전환 경고 ({holdTurn.length}종목)</div>
                <div style={{fontSize:9,color:"#ffa94d",marginBottom:8}}>보유중인 종목에서 하락 전환 신호 감지! 비중 축소 또는 손절 검토하세요.</div>
                {holdTurn.map(({p,s})=>{
                  const ind=s._indicators;const vol=s._volData;const pct=p.buyPrice>0?((s.p/p.buyPrice-1)*100):0;
                  const tags=[];
                  if(vol&&vol.signalType==='sell')tags.push(vol.signal||'거래량🔴');
                  if(ind&&['dead','bearish'].includes(ind.macd.signal))tags.push(ind.macd.signal==='dead'?'MACD 데드크로스🔴':'MACD 하락중🔴');
                  if(ind&&['distribution','confirm_down'].includes(ind.obv.signal))tags.push(ind.obv.signal==='distribution'?'큰손 이탈🔴':'OBV 하락🔴');
                  return <div key={s.t} onClick={()=>{setDetailStock(s);setShowDetail(true);}} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 10px",background:"#f8514908",borderRadius:6,marginBottom:4,cursor:"pointer",border:"1px solid #f8514922"}}>
                    <div style={{flex:1}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#ff8a80"}}>{s.n}</span>
                      <span style={{fontSize:10,color:pct>=0?"#3fb950":"#f85149",marginLeft:6,fontFamily:"'JetBrains Mono'"}}>{pct>=0?"+":""}{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{fontSize:8,color:"#f85149"}}>{tags.join(' · ')}</div>
                  </div>;
                })}
              </div>;
            })()}

            {/* 미국 / 한국 분리 */}
            {["us","kr"].map(market=>{
              const items=portfolio.filter(p=>{const s=stocks.find(d=>d.t===p.ticker);return s?(market==="us"?!s.k:s.k):false;});
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
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#3fb950",fontSize:11,whiteSpace:"nowrap"}}>매도규칙</th>
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
                      <td style={{padding:"4px 6px",textAlign:"center",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:70}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3}}>
                          <span style={{fontSize:11,fontWeight:800,color:vd.color}}>{vd.verdict}</span>
                          <span style={{fontSize:9,color:"#484f58",fontFamily:"'JetBrains Mono'",fontWeight:700}}>{vd.totalPt}</span>
                        </div>
                        {s._execTag && (()=>{const tC={'BUY NOW':'#00e676','BUY ON BREAKOUT':'#448aff','WATCH':'#ffd600','AVOID':'#f85149'}[s._execTag]||'#aaa';const tL={'BUY NOW':'⚡NOW','BUY ON BREAKOUT':'📈BRK','WATCH':'👀WATCH','AVOID':'🚫AVOID'}[s._execTag]||s._execTag;return <div style={{fontSize:7,fontWeight:700,color:tC,marginTop:1,whiteSpace:'nowrap'}}>{tL}</div>;})()}
                        {vd.details.gateLabel && <div style={{fontSize:7,color:'#f85149',marginTop:1,fontWeight:700,whiteSpace:'nowrap'}}>{vd.details.gateLabel}</div>}
                        {!vd.details.gateLabel && vd.details.riskPenalty>0 && <div style={{fontSize:7,color:'#ff922b',marginTop:1}}>⚠️-{vd.details.riskPenalty}</div>}
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
                      {/* 매도 규칙 */}
                      <td style={{padding:"4px 6px",textAlign:"center",minWidth:90}}>
                        {(()=>{
                          const tp1=+(p.buyPrice*1.12).toFixed(s.k?0:2);
                          const pct=p.buyPrice>0?((s.p/p.buyPrice-1)*100):0;
                          const hitTp1=s.p>=tp1;
                          const rules=[];
                          if(pct<=-7)rules.push({t:'❌ Hard Stop',c:'#f85149'});
                          else if(hitTp1)rules.push({t:'💰 +12% 익절',c:'#3fb950'});
                          else rules.push({t:`🎯 +12%: ${fP(tp1,s.k)}`,c:'#484f58'});
                          // MACD 데드크로스 경고
                          if(s._indicators?.macd?.signal==='dead'||s._indicators?.macd?.signal==='bearish')
                            rules.push({t:'⚠️ MACD↓',c:'#ff922b'});
                          return <div>{rules.map((r,i)=><div key={i} style={{fontSize:9,fontWeight:700,color:r.c,lineHeight:1.4}}>{r.t}</div>)}</div>;
                        })()}
                      </td>
                      <td style={{padding:"4px 6px",textAlign:"center",display:"flex",flexDirection:"column",gap:3,alignItems:"center",justifyContent:"center"}}>
                        {/* 매도 기록 버튼 */}
                        <button onClick={()=>{
                          const vd=getVerdict(s);
                          setSellModal({portIdx:globalIdx,stock:s,buyPrice:p.buyPrice,qty:p.qty,name:s.n,ticker:s.t,isKR:s.k,score:vd.totalPt,execTag:s._execTag||null,buyDate:p.buyDate||null});
                        }} style={{padding:"2px 6px",borderRadius:3,border:"1px solid #3fb95033",background:"#3fb95012",color:"#3fb950",cursor:"pointer",fontSize:10,whiteSpace:"nowrap"}}>📝 매도</button>
                        <button onClick={()=>removePortfolio(globalIdx)} style={{padding:"2px 6px",borderRadius:3,border:"1px solid #f8514933",background:"transparent",color:"#f85149",cursor:"pointer",fontSize:10}}>✕</button>
                      </td>
                    </tr>;
                  })}</tbody>
                </table>
                </div>
              </div>;
            })}
          </>}
        </div>

        {/* ============ v2: 거래 로그 ============ */}
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14,marginTop:12}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:6}}>
            <div style={{fontSize:16,fontWeight:800,color:"#58a6ff"}}>📋 거래 로그 ({tradeLog.length}건)</div>
            <div style={{display:"flex",gap:6}}>
              {tradeLog.length>0 && <button onClick={()=>{
                const hd="날짜,종목,티커,매수가,매도가,수량,수익률(%),손익,보유일,점수,사유,시장상태";
                const rows=tradeLog.map(l=>[l.date,l.name,l.ticker,l.buyPrice,l.sellPrice,l.qty,(l.pct||0).toFixed(2),Math.round(l.pnl||0),l.days||"",l.score||"",l.reason||"",l.mktState||""].join(","));
                const csv="\uFEFF"+hd+"\n"+rows.join("\n");
                const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));
                a.download="trade_log_"+(new Date().toISOString().slice(0,10))+".csv";a.click();
              }} style={{padding:"4px 10px",borderRadius:5,border:"1px solid #58a6ff44",background:"#58a6ff12",color:"#58a6ff",cursor:"pointer",fontSize:11,fontWeight:700}}>📥 CSV</button>}
              {tradeLog.length>0 && <button onClick={()=>{if(window.confirm("거래 로그를 모두 삭제할까요?"))setTradeLog([]);}} style={{padding:"4px 10px",borderRadius:5,border:"1px solid #f8514933",background:"transparent",color:"#f85149",cursor:"pointer",fontSize:11}}>전체삭제</button>}
            </div>
          </div>
          {tradeLog.length===0 ? <div style={{textAlign:"center",color:"#484f58",fontSize:12,padding:20}}>보유종목에서 <b style={{color:"#3fb950"}}>📝 매도</b> 버튼을 누르면 거래가 자동 기록됩니다</div> : <>
            {/* ── 전체 요약 4칸 ── */}
            {(()=>{
              const wins=tradeLog.filter(l=>(l.pct||0)>0).length;const total=tradeLog.length;
              const avgPct=total>0?(tradeLog.reduce((s,l)=>s+(l.pct||0),0)/total):0;
              const avgDays=total>0?(tradeLog.reduce((s,l)=>s+(l.days||0),0)/total):0;
              const winRate=total>0?(wins/total*100):0;
              const totalPnl=tradeLog.reduce((s,l)=>s+(l.pnl||0),0);
              return <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:10}}>
                {[["승률",winRate.toFixed(0)+"%",winRate>=50?"#3fb950":"#f85149"],["평균수익",(avgPct>=0?"+":"")+avgPct.toFixed(1)+"%",avgPct>=0?"#3fb950":"#f85149"],["평균보유",Math.round(avgDays)+"일","#8b949e"],["총손익",(totalPnl>=0?"+":"")+Math.round(totalPnl).toLocaleString(),totalPnl>=0?"#3fb950":"#f85149"]
                ].map(([l,v,c])=><div key={l} style={{background:"#161b22",borderRadius:6,padding:"6px 10px",textAlign:"center"}}><div style={{fontSize:9,color:"#484f58"}}>{l}</div><div style={{fontSize:15,fontWeight:800,color:c,fontFamily:"'JetBrains Mono'"}}>{v}</div></div>)};
              </div>;
            })()}

            {/* ── 성과 분류 분석 ── */}
            {(()=>{
              // 공통 통계 헬퍼
              const grpStats = (items) => {
                if(!items.length) return null;
                const wins = items.filter(l=>(l.pct||0)>0).length;
                const avgPct = items.reduce((s,l)=>s+(l.pct||0),0)/items.length;
                const totalPnl = items.reduce((s,l)=>s+(l.pnl||0),0);
                return { n:items.length, wr:(wins/items.length*100), avgPct, totalPnl };
              };
              const StatRow = ({label, color, stats, bg}) => {
                if(!stats) return null;
                const pColor = stats.avgPct>=0?"#3fb950":"#f85149";
                return <div style={{display:"grid",gridTemplateColumns:"1fr auto auto auto auto",gap:6,alignItems:"center",padding:"5px 8px",borderRadius:6,background:bg||"#161b22",marginBottom:4}}>
                  <div style={{fontSize:11,fontWeight:700,color:color||"#8b949e",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{label}</div>
                  <div style={{textAlign:"right",minWidth:28}}><span style={{fontSize:9,color:"#484f58"}}>건</span><span style={{fontSize:12,fontWeight:700,color:"#8b949e",fontFamily:"'JetBrains Mono'",marginLeft:2}}>{stats.n}</span></div>
                  <div style={{textAlign:"right",minWidth:44}}><span style={{fontSize:9,color:"#484f58"}}>승률</span><span style={{fontSize:12,fontWeight:700,color:stats.wr>=50?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'",marginLeft:2}}>{stats.wr.toFixed(0)}%</span></div>
                  <div style={{textAlign:"right",minWidth:52}}><span style={{fontSize:9,color:"#484f58"}}>평균</span><span style={{fontSize:12,fontWeight:700,color:pColor,fontFamily:"'JetBrains Mono'",marginLeft:2}}>{stats.avgPct>=0?"+":""}{stats.avgPct.toFixed(1)}%</span></div>
                  <div style={{textAlign:"right",minWidth:60}}><span style={{fontSize:9,color:"#484f58"}}>손익</span><span style={{fontSize:11,fontWeight:600,color:stats.totalPnl>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'",marginLeft:2}}>{stats.totalPnl>=0?"+":""}{Math.round(stats.totalPnl).toLocaleString()}</span></div>
                </div>;
              };

              // 1. 점수대별
              const scoreBands = [
                {label:"🔥 최강 (85점+)", min:85, max:999, color:"#ff1744"},
                {label:"🟢 매수 (65~84점)", min:65, max:84, color:"#3fb950"},
                {label:"🔵 관심 (50~64점)", min:50, max:64, color:"#58a6ff"},
                {label:"⚪ 기타 (~49점)", min:0, max:49, color:"#8b949e"},
              ];
              // 2. ExecTag별
              const tagBands = [
                {label:"⚡ BUY NOW", key:"BUY NOW", color:"#00e676"},
                {label:"📈 BUY ON BREAKOUT", key:"BUY ON BREAKOUT", color:"#448aff"},
                {label:"👀 WATCH", key:"WATCH", color:"#ffd600"},
                {label:"🚫 AVOID / 없음", key:null, color:"#f85149"},
              ];
              // 3. 시장상태별
              const mktBands = [
                {label:"🟢 Risk On", key:"risk_on", color:"#3fb950"},
                {label:"🟡 Neutral", key:"neutral", color:"#ffd600"},
                {label:"🟠 Risk Off", key:"risk_off", color:"#ff922b"},
                {label:"🔴 Defensive", key:"defensive", color:"#f85149"},
                {label:"❓ 미기록", key:"unknown", color:"#484f58"},
              ];
              // 4. 매도사유별
              const reasonBands = [
                {label:"Hard Stop (−7%)", key:"hard_stop(-7%)", color:"#f85149"},
                {label:"EMA21 이탈", key:"ema21_break", color:"#ff922b"},
                {label:"1차 익절 (+12%)", key:"partial_tp(+12%)", color:"#3fb950"},
                {label:"트레일링 손절", key:"trailing_stop", color:"#ffd600"},
                {label:"시간 손절", key:"time_stop", color:"#8b949e"},
                {label:"전량 매도", key:"full_exit", color:"#58a6ff"},
                {label:"기타", key:"기타", color:"#484f58"},
              ];

              return <div style={{marginBottom:12}}>
                <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
                  {/* 점수대별 */}
                  <div style={{background:"#0d1117",borderRadius:8,padding:10,border:"1px solid #21262d"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#bc8cff",marginBottom:8}}>📊 점수대별 성과</div>
                    {scoreBands.map(({label,min,max,color})=>{
                      const items=tradeLog.filter(l=>{const sc=l.score||0;return sc>=min&&sc<=max;});
                      return <StatRow key={label} label={label} color={color} stats={grpStats(items)}/>;
                    })}
                  </div>
                  {/* ExecTag별 */}
                  <div style={{background:"#0d1117",borderRadius:8,padding:10,border:"1px solid #21262d"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#ffd43b",marginBottom:8}}>🏷️ ExecTag별 성과</div>
                    {tagBands.map(({label,key,color})=>{
                      const items=key===null
                        ? tradeLog.filter(l=>!l.execTag||l.execTag==="AVOID")
                        : tradeLog.filter(l=>l.execTag===key);
                      return <StatRow key={label} label={label} color={color} stats={grpStats(items)}/>;
                    })}
                  </div>
                  {/* 시장상태별 */}
                  <div style={{background:"#0d1117",borderRadius:8,padding:10,border:"1px solid #21262d"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#58a6ff",marginBottom:8}}>🌐 시장상태별 성과</div>
                    {mktBands.map(({label,key,color})=>{
                      const items=tradeLog.filter(l=>(l.mktState||"unknown")===key);
                      return <StatRow key={label} label={label} color={color} stats={grpStats(items)}/>;
                    })}
                  </div>
                  {/* 매도사유별 */}
                  <div style={{background:"#0d1117",borderRadius:8,padding:10,border:"1px solid #21262d"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#ff922b",marginBottom:8}}>🚪 매도사유별 성과</div>
                    {reasonBands.map(({label,key,color})=>{
                      const items=tradeLog.filter(l=>(l.reason||"기타")===key);
                      return <StatRow key={label} label={label} color={color} stats={grpStats(items)}/>;
                    })}
                  </div>
                </div>

                {/* 인사이트 요약 */}
                {(()=>{
                  const total=tradeLog.length;
                  if(total<3) return <div style={{marginTop:8,padding:"6px 10px",background:"#161b22",borderRadius:6,fontSize:10,color:"#484f58",textAlign:"center"}}>💡 거래 3건 이상 쌓이면 인사이트가 표시됩니다 ({total}/3)</div>;
                  const insights=[];
                  // 최고 점수대
                  const bestBand=scoreBands.map(b=>{const it=tradeLog.filter(l=>{const sc=l.score||0;return sc>=b.min&&sc<=b.max;});const st=grpStats(it);return{...b,stats:st};}).filter(b=>b.stats&&b.stats.n>=2).sort((a,b)=>b.stats.avgPct-a.stats.avgPct)[0];
                  if(bestBand) insights.push({icon:"🏆",text:`점수대 "${bestBand.label}" 평균수익 ${bestBand.stats.avgPct.toFixed(1)}% — 가장 수익률 좋음`,color:bestBand.color});
                  // 최고 ExecTag
                  const bestTag=tagBands.map(b=>{const it=b.key===null?tradeLog.filter(l=>!l.execTag||l.execTag==="AVOID"):tradeLog.filter(l=>l.execTag===b.key);const st=grpStats(it);return{...b,stats:st};}).filter(b=>b.stats&&b.stats.n>=2).sort((a,b)=>b.stats.avgPct-a.stats.avgPct)[0];
                  if(bestTag) insights.push({icon:"🎯",text:`ExecTag "${bestTag.label}" 평균수익 ${bestTag.stats.avgPct.toFixed(1)}% — 최고 실행 타이밍`,color:bestTag.color});
                  // Risk On 대비
                  const riskOnItems=tradeLog.filter(l=>l.mktState==="risk_on");
                  const riskOffItems=tradeLog.filter(l=>l.mktState==="risk_off"||l.mktState==="defensive");
                  if(riskOnItems.length>=2&&riskOffItems.length>=2){
                    const roSt=grpStats(riskOnItems);const rfSt=grpStats(riskOffItems);
                    if(roSt.avgPct>rfSt.avgPct) insights.push({icon:"📈",text:`Risk On 평균 ${roSt.avgPct.toFixed(1)}% vs Risk Off ${rfSt.avgPct.toFixed(1)}% — 시장필터 유효`,color:"#3fb950"});
                    else insights.push({icon:"⚠️",text:`Risk Off에서도 평균 ${rfSt.avgPct.toFixed(1)}% — 시장필터 재검토 권장`,color:"#ffd600"});
                  }
                  // Hard stop 비율
                  const hardStops=tradeLog.filter(l=>l.reason==="hard_stop(-7%)");
                  if(hardStops.length>=2){const pct=(hardStops.length/total*100).toFixed(0);insights.push({icon:pct>=30?"🚨":"✅",text:`Hard Stop 비율 ${pct}% (${hardStops.length}/${total}건)${pct>=30?" — 진입 타이밍 재검토 필요":""}`,color:pct>=30?"#f85149":"#3fb950"});}
                  if(!insights.length) return null;
                  return <div style={{marginTop:8,background:"#161b22",borderRadius:8,padding:10,border:"1px solid #21262d"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#e6edf3",marginBottom:6}}>💡 자동 인사이트</div>
                    {insights.map((ins,i)=><div key={i} style={{fontSize:11,color:"#8b949e",marginBottom:4,display:"flex",gap:6,alignItems:"flex-start"}}><span>{ins.icon}</span><span style={{color:ins.color}}>{ins.text}</span></div>)}
                  </div>;
                })()}
              </div>;
            })()}

            {/* ── 거래 내역 테이블 ── */}
            <div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",fontSize:11,width:"100%"}}>
              <thead><tr style={{borderBottom:"2px solid #21262d"}}>
                {["날짜","종목","매수가","매도가","수익률","손익","보유일","점수","사유",""].map(h=><th key={h} style={{padding:"4px 8px",color:"#484f58",fontSize:10,whiteSpace:"nowrap"}}>{h}</th>)}
              </tr></thead>
              <tbody>{[...tradeLog].reverse().map((l,revI)=>{
                const origI=tradeLog.length-1-revI;const isWin=(l.pct||0)>0;
                return <tr key={revI} style={{borderBottom:"1px solid #21262d22",background:isWin?"#3fb95006":"#f8514906"}}>
                  <td style={{padding:"4px 8px",color:"#484f58",whiteSpace:"nowrap",fontSize:10}}>{l.date}</td>
                  <td style={{padding:"4px 8px",fontWeight:600,color:"#e6edf3",whiteSpace:"nowrap"}}>{l.isKR?"🇰🇷":"🇺🇸"} {l.name}<div style={{fontSize:9,color:"#484f58"}}>{l.ticker}</div></td>
                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:"#8b949e",fontSize:11}}>{l.isKR?"₩":"$"}{(l.buyPrice||0).toLocaleString()}</td>
                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:"#e6edf3",fontSize:11}}>{l.isKR?"₩":"$"}{(l.sellPrice||0).toLocaleString()}</td>
                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",fontWeight:800,color:isWin?"#3fb950":"#f85149"}}>{isWin?"+":""}{(l.pct||0).toFixed(2)}%</td>
                  <td style={{padding:"4px 8px",textAlign:"right",fontFamily:"'JetBrains Mono'",color:isWin?"#3fb950":"#f85149",fontSize:11}}>{isWin?"+":""}{Math.round(l.pnl||0).toLocaleString()}</td>
                  <td style={{padding:"4px 8px",textAlign:"center",color:"#8b949e"}}>{l.days||"-"}일</td>
                  <td style={{padding:"4px 8px",textAlign:"center",color:"#bc8cff"}}>{l.score||"-"}</td>
                  <td style={{padding:"4px 8px",color:"#484f58",fontSize:10,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason||"-"}</td>
                  <td><button onClick={()=>setTradeLog(p=>p.filter((_,j)=>j!==origI))} style={{padding:"1px 5px",borderRadius:3,border:"1px solid #f8514922",background:"transparent",color:"#f85149",cursor:"pointer",fontSize:9}}>✕</button></td>
                </tr>;
              })}</tbody>
            </table></div>
          </>}
        </div>
      </div>}

      {/* ============ v2: 매도 기록 모달 ============ */}
      {sellModal && (()=>{
        const m=sellModal;
        const SellModal=()=>{
          const [sellPrc,setSellPrc]=React.useState(m.stock?.p||m.buyPrice);
          const [sellReason,setSellReason]=React.useState('');
          const pct=m.buyPrice>0?((sellPrc/m.buyPrice-1)*100):0;
          const pnl=(sellPrc-m.buyPrice)*m.qty;
          const days=m.buyDate?Math.round((Date.now()-new Date(m.buyDate).getTime())/86400000):null;
          const cur=m.isKR?"₩":"$";
          const fM=v=>m.isKR?(cur+Math.round(v).toLocaleString()):(cur+v.toLocaleString(undefined,{maximumFractionDigits:2}));
          const reasons=["hard_stop(-7%)","ema21_break","partial_tp(+12%)","trailing_stop","time_stop","full_exit","기타"];
          return <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.8)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
            <div style={{background:"#0d1117",border:"1px solid #3fb95044",borderRadius:12,padding:20,width:"100%",maxWidth:420}}>
              <div style={{fontSize:16,fontWeight:800,color:"#3fb950",marginBottom:14}}>📝 매도 기록 — {m.isKR?"🇰🇷":"🇺🇸"} {m.name}</div>
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11,color:"#484f58",marginBottom:4}}>매도가</div>
                <input type="number" value={sellPrc} onChange={e=>setSellPrc(+e.target.value||0)}
                  style={{width:"100%",padding:"8px 10px",background:"#161b22",border:"1px solid #21262d",borderRadius:6,color:"#e6edf3",fontSize:16,outline:"none",fontFamily:"'JetBrains Mono'"}}/>
                <div style={{marginTop:4,display:"flex",gap:4,flexWrap:"wrap"}}>
                  {[[-7,"-7% 손절"],[12,"+12% 익절"],[20,"+20%"],[30,"+30%"]].map(([p,l])=>{
                    const v=+(m.buyPrice*(1+p/100)).toFixed(m.isKR?0:2);
                    return <button key={p} onClick={()=>setSellPrc(v)} style={{padding:"2px 7px",borderRadius:4,border:"1px solid #21262d",background:"#161b22",color:p>0?"#3fb950":"#f85149",cursor:"pointer",fontSize:10,fontWeight:600}}>{l}</button>;
                  })}
                  {m.stock?.p && <button onClick={()=>setSellPrc(m.stock.p)} style={{padding:"2px 7px",borderRadius:4,border:"1px solid #58a6ff33",background:"#58a6ff12",color:"#58a6ff",cursor:"pointer",fontSize:10,fontWeight:600}}>현재가</button>}
                </div>
              </div>
              <div style={{marginBottom:12}}>
                <div style={{fontSize:11,color:"#484f58",marginBottom:4}}>매도 사유</div>
                <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                  {reasons.map(r=><button key={r} onClick={()=>setSellReason(r)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid "+(sellReason===r?"#bc8cff":"#21262d"),background:sellReason===r?"#bc8cff18":"#161b22",color:sellReason===r?"#bc8cff":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600}}>{r}</button>)}
                </div>
              </div>
              <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:14}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
                  <div><div style={{fontSize:9,color:"#484f58"}}>수익률</div><div style={{fontSize:20,fontWeight:900,color:pct>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pct>=0?"+":""}{pct.toFixed(2)}%</div></div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>손익</div><div style={{fontSize:14,fontWeight:800,color:pct>=0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{pnl>=0?"+":""}{fM(Math.abs(pnl))}</div></div>
                  <div><div style={{fontSize:9,color:"#484f58"}}>보유일</div><div style={{fontSize:14,fontWeight:800,color:"#8b949e"}}>{days!=null?days+"일":"-"}</div></div>
                </div>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button onClick={()=>{
                  const log={date:new Date().toISOString().slice(0,10),name:m.name,ticker:m.ticker,isKR:m.isKR,
                    buyPrice:m.buyPrice,sellPrice:sellPrc,qty:m.qty,pct:+pct.toFixed(2),pnl:+pnl.toFixed(0),
                    days:days||0,score:m.score,execTag:m.execTag,reason:sellReason||"직접입력",mktState:MKT.riskState||"unknown"};
                  setTradeLog(p=>[...p,log]);
                  removePortfolio(m.portIdx);
                  setSellModal(null);
                }} style={{flex:1,padding:"10px",borderRadius:6,border:"none",background:"#3fb950",color:"#000",cursor:"pointer",fontSize:13,fontWeight:800}}>✅ 기록 저장 + 보유종목 제거</button>
                <button onClick={()=>setSellModal(null)} style={{padding:"10px 16px",borderRadius:6,border:"1px solid #21262d",background:"transparent",color:"#484f58",cursor:"pointer",fontSize:12}}>취소</button>
              </div>
            </div>
          </div>;
        };
        return <SellModal/>;
      })()}
      {tab==="main" && MKT.loaded && (()=>{
        const rs=MKT.riskState||"unknown";
        const rc=MKT.riskColor||"#484f58";
        const rl=MKT.riskLabel||"";
        const krs=MKT.krRiskState||"unknown";
        const krc=MKT.krRiskColor||"#484f58";
        const krl=MKT.krRiskLabel||"";
        const krMissing = !krl || krl==="⏳" || krl.includes("재조회") || krs==="unknown";
        const usWarning=(rs==="risk_off"||rs==="defensive");
        const krWarning=(krs==="risk_off"||krs==="defensive");
        const usPct=MKT.maxPositionPct??100;
        const krPct=MKT.krMaxPositionPct??100;
        const usMsg=rs==="defensive"?"🚫 신규매수 금지":rs==="risk_off"?"⛔ 신규매수 자제 (최대"+usPct+"%)":rs==="neutral"?"⚠️ 선별매수 (최대"+usPct+"%)":"✅ 정상매매 (최대"+usPct+"%)";
        const krMsg=krMissing?"조회 필요":krs==="defensive"?"🚫 신규매수 금지":krs==="risk_off"?"⛔ 신규매수 자제 (최대"+krPct+"%)":krs==="neutral"?"⚠️ 선별매수 (최대"+krPct+"%)":"✅ 정상매매 (최대"+krPct+"%)";
        return <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 6px"}}>
          {/* KR / US 분리 배너 */}
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:6}}>
            {/* 🇺🇸 US 배너 */}
            <div style={{padding:"8px 12px",background:rc+"14",border:"1px solid "+(rc)+"44",borderRadius:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,color:"#484f58"}}>🇺🇸</span>
                  <span style={{fontSize:13,fontWeight:900,color:rc}}>{rl}</span>
                </div>
                <span style={{fontSize:10,color:"#8b949e"}}>{usMsg}</span>
              </div>
              {usWarning && <div style={{marginTop:4,fontSize:10,color:"#ff8a80"}}>
                <b>지금 미국주식 매수 비추.</b> {rs==="defensive"?"SPY 200일선 아래 — 장기 하락":"SPY 50일선 아래 or VIX≥30"}
              </div>}
            </div>
            {/* 🇰🇷 KR 배너 */}
            <div style={{padding:"8px 12px",background:krMissing?"#21262d":krc+"14",border:"1px solid "+(krMissing?"#30363d":krc+"44")+"",borderRadius:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontSize:13,color:"#484f58"}}>🇰🇷</span>
                  <span style={{fontSize:13,fontWeight:900,color:krMissing?"#8b949e":krc}}>
                    {krMissing?"⏳ KR 데이터 없음":krl}
                  </span>
                </div>
                {krMissing
                  ? <button onClick={doMarketFilter} disabled={mktRt==="fetching"} style={{padding:"4px 10px",borderRadius:5,border:"1px solid #58a6ff",background:"#58a6ff18",color:"#58a6ff",cursor:"pointer",fontSize:11,fontWeight:700}}>
                      {mktRt==="fetching"?"조회중...":"🔄 지금 조회"}
                    </button>
                  : <span style={{fontSize:10,color:"#8b949e"}}>{krMsg}</span>
                }
              </div>
              {!krMissing && krWarning && <div style={{marginTop:4,fontSize:10,color:"#ff8a80"}}>
                <b>지금 한국주식 매수 비추.</b> {krs==="defensive"?"KOSPI 200일선 아래 — 장기 하락":"KOSPI 50일선 아래 or 글로벌 VIX≥30"}
              </div>}
            </div>
          </div>
          {/* 건강도 미니 */}
          <div style={{marginTop:4,display:"flex",alignItems:"center",gap:8,padding:"4px 8px"}}>
            <span style={{fontSize:10,color:"#484f58"}}>건강도 {MKT.health?.score}/100</span>
            <span style={{padding:"1px 6px",borderRadius:3,background:(MKT.health?.modeColor||"#484f58")+"20",border:"1px solid "+((MKT.health?.modeColor||"#484f58"))+"33",fontSize:10,fontWeight:700,color:MKT.health?.modeColor||"#484f58"}}>{MKT.health?.mode}모드</span>
            <span style={{fontSize:10,color:"#484f58"}}>VIX {MKT.vix}</span>
          </div>
        </div>;
      })()}

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

      {/* ============ AI 추천 ============ */}
      {tab==="main" && (()=>{
        const all=filtered.map(d=>({d,vd:getVerdict(d),dm:getDualMomentum(d)}));

        // 🔥 지금 사세요: 85+ (최강 기준 일치) & (거래량 매집 OR VCP 성숙/돌파)
        // BUG FIX: v1.5에서 최강 기준 80→85 올렸으나 buyNow는 80 유지됐던 것 수정
        const buyNow=all.filter(({vd,d})=>vd.totalPt>=85 && (vd.details.volPt>=9 || ['성숙🔥','성숙','돌파✅'].includes(vcpMt(d))))
          .sort((a,b)=>b.vd.totalPt-a.vd.totalPt).slice(0,5);

        // 👀 곧 터질: 60~84 & VCP 성숙 단계 & 피봇 아직 안 뚫림(0~10% 아래)
        // BUG FIX: Math.abs() → 피봇 위 종목 제외. vcpPx는 "피봇 대비 현재가" 이므로
        //   vcpPx < 0 = 피봇 아래(진짜 "곧 터질"), vcpPx > 0 = 이미 돌파
        //   허용: 피봇 -10% ~ +3% (돌파 직후 초기 포함, 단 +3% 초과는 이미 올라간 것)
        // 개선: '형성중' 제거 (VCP 초기 단계는 신뢰도 부족), '성숙'/'성숙🔥'만
        const soonBreak=all.filter(({vd,d})=>{
          const px=vcpPx(d);
          if(px==null)return false;
          return vd.totalPt>=60 && vd.totalPt<85 &&
            ['성숙','성숙🔥'].includes(vcpMt(d)) &&
            px>=-10 && px<=3; // 피봇 10% 아래 ~ 3% 위 허용 (돌파 초입 포함)
        }).sort((a,b)=>vcpPx(a.d)-vcpPx(b.d)).slice(0,5); // 피봇에 가장 가까운 순

        // 📈 조용한 강자: SEPA 7+/8 & DM 강세 & 아직 최강 미달 & 거래량 중립~매집
        // BUG FIX 1: 상한 80→85 (최강 기준과 일치, 80~84 orphan 구간 해소)
        // 개선: volPt 상한 8→9 (매집 시작 종목도 포함)
        const silent=all.filter(({vd,d,dm})=>
          seTt(d)>=7 && dm.signalScore>=7 &&
          vd.totalPt>=55 && vd.totalPt<85 &&
          vd.details.volPt>=4 && vd.details.volPt<=9
        ).sort((a,b)=>b.vd.totalPt-a.vd.totalPt).slice(0,5);

        // 🎯 보조지표 올그린: 볼린저 스퀴즈 + MACD 상승 + OBV 매집/상승확인
        const tripleGreen=all.filter(({d})=>{
          const ind=d._indicators;if(!ind)return false;
          const bbOk=ind.bb.signal==='squeeze';
          const macdOk=['golden','bullish'].includes(ind.macd.signal);
          const obvOk=['accumulation','confirm'].includes(ind.obv.signal);
          return bbOk&&macdOk&&obvOk;
        }).sort((a,b)=>b.vd.totalPt-a.vd.totalPt).slice(0,5);
        if(buyNow.length===0&&soonBreak.length===0&&silent.length===0&&tripleGreen.length===0)return null;
        const Card=({icon,title,color,items,getTag,getReason})=>(
          items.length===0?null:<div style={{flex:1,minWidth:isMobile?'100%':280,background:'linear-gradient(135deg,#0a0a1e,#0d1830)',borderRadius:10,padding:'12px 14px',border:"1px solid "+(color)+"33"}}>
            <div style={{fontSize:13,fontWeight:800,color,marginBottom:8}}>{icon} {title}</div>
            {items.map(({d,vd})=>(
              <div key={d.t} onClick={()=>{setDetailStock(d);setShowDetail(true);}} style={{padding:'6px 8px',marginBottom:4,background:'#161b2288',borderRadius:6,cursor:'pointer',border:'1px solid transparent',transition:'border .2s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=color+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:vd.stars>=5?'#ff1744':'#e6edf3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.n}</div>
                    <div style={{fontSize:9,color:'#484f58'}}>{d.s}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:900,color,fontFamily:"'JetBrains Mono'"}}>{vd.totalPt}</div>
                  <div style={{fontSize:8,padding:'2px 6px',borderRadius:4,background:color+'15',color,fontWeight:700,whiteSpace:'nowrap'}}>{getTag(d,vd)}</div>
                </div>
                <div style={{fontSize:9,color:'#8b949e',marginTop:3,lineHeight:1.3}}>{getReason(d,vd)}</div>
              </div>
            ))}
          </div>
        );
        return <div style={{maxWidth:1800,margin:'0 auto',padding:'0 20px 12px'}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <Card icon="🔥" title="지금 사세요" color="#ff1744" items={buyNow}
              getTag={(d,vd)=>{
                const vm=vcpMt(d);return vm.includes('성숙')?'VCP성숙':vm.includes('돌파')?'돌파완료':vd.details.volPt>=9?'매집중':'최강';
              }}
              getReason={(d,vd)=>{
                const parts=[];
                if(seTt(d)>=7) parts.push('추세 강함');
                const dm=getDualMomentum(d);
                if(dm.signalScore>=7) parts.push('시장보다 강함');
                if(vd.details.volPt>=9) parts.push('큰손 매집');
                const vm=vcpMt(d);
                if(vm.includes('성숙')) parts.push('터질 준비 완료');
                else if(vm.includes('돌파')) parts.push('돌파 확인');
                if(vd.details.mfPt>=8) parts.push('실적 우량');
                return parts.join(' · ')||'모든 엔진 강세';
              }}
            />
            <Card icon="👀" title="곧 터질 종목" color="#ffd600" items={soonBreak}
              getTag={(d)=>{
                const px=vcpPx(d);
                if(px==null)return '-';
                return px<=0?`피봇 ${Math.abs(px)}% 아래`:`피봇 돌파 +${px}%`;
              }}
              getReason={(d,vd)=>{
                const px=vcpPx(d);const vm=vcpMt(d);
                const base=vm==='성숙🔥'?'거래량까지 줄어들며 에너지 압축 중':
                  '변동성 수축 완료, 돌파 대기';
                const distTxt=px!=null&&px<0?`피봇까지 ${Math.abs(px)}% 남음`:px!=null&&px>0?`피봇 +${px}% 돌파 초입`:'피봇 근접';
                return `${base} · ${distTxt}`;
              }}
            />
            <Card icon="📈" title="조용한 강자" color="#00e676" items={silent}
              getTag={(d,vd)=>{
                const dm=getDualMomentum(d);return dm.signal==='STRONG BUY'?'STRONG BUY':seTt(d)===8?'SEPA 8/8':'추세+모멘텀';
              }}
              getReason={(d,vd)=>{
                const dm=getDualMomentum(d);
                const parts=[];
                parts.push(`SEPA ${seTt(d)}/8 상승추세`);
                if(dm.r3m>0) parts.push(`3M +${dm.r3m}% 수익`);
                parts.push('아직 주목 안 받는 중');
                return parts.join(' · ');
              }}
            />
            <Card icon="🎯" title="보조지표 올그린" color="#e599f7" items={tripleGreen}
              getTag={(d,vd)=>{
                return '🟢🟢🟢';
              }}
              getReason={(d,vd)=>{
                const ind=d._indicators;if(!ind)return '';
                const parts=[];
                parts.push(`볼린저 스퀴즈(${ind.bb.width}%) — 큰 움직임 임박`);
                parts.push(ind.macd.signal==='golden'?'MACD 골든크로스 — 상승 전환!':`MACD 상승 ${ind.macd.crossDays}일차`);
                parts.push(ind.obv.signal==='accumulation'?'OBV 매집 — 큰손이 몰래 사는 중':'OBV 상승확인 — 건강한 상승');
                return parts.join(' · ');
              }}
            />
          </div>
        </div>;
      })()}

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
            <TH c>신호</TH>
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
                    <td style={{textAlign:"center",padding:isMobile?"3px 4px":"4px 6px",background:vd.color+"12",borderLeft:`2px solid ${vd.color}`,minWidth:isMobile?50:80}}>
                      {/* 판정 + 점수 */}
                      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3,flexWrap:"nowrap"}}>
                        <span style={{fontSize:isMobile?10:12,fontWeight:800,color:vd.color,whiteSpace:"nowrap"}}>{vd.verdict}</span>
                        <span style={{fontSize:isMobile?8:10,color:"#484f58",fontFamily:"'JetBrains Mono'",fontWeight:700}}>{vd.totalPt}</span>
                      </div>
                      {/* ExecTag — 항상 표시 (모바일 포함) */}
                      {d._execTag && (()=>{
                        const tC={'BUY NOW':'#00e676','BUY ON BREAKOUT':'#448aff','WATCH':'#ffd600','AVOID':'#f85149'}[d._execTag]||'#aaa';
                        const tL={'BUY NOW':'⚡NOW','BUY ON BREAKOUT':'📈BRK','WATCH':'👀WATCH','AVOID':'🚫AVOID'}[d._execTag]||d._execTag;
                        return <div style={{fontSize:isMobile?7:8,fontWeight:700,color:tC,marginTop:1,whiteSpace:'nowrap',letterSpacing:'-0.3px'}}>{tL}</div>;
                      })()}
                      {/* Gate 실패 — gateLabel 전체 표시 */}
                      {vd.details.gateLabel && <div style={{fontSize:isMobile?6:7,color:'#f85149',marginTop:1,whiteSpace:'nowrap',fontWeight:700,letterSpacing:'-0.3px'}}>{vd.details.gateLabel}</div>}
                      {/* Risk Penalty — 있을 때만 */}
                      {!vd.details.gateLabel && vd.details.riskPenalty>0 && <div style={{fontSize:isMobile?6:7,color:'#ff922b',marginTop:1,whiteSpace:'nowrap',fontWeight:600}}>⚠️Risk-{vd.details.riskPenalty}</div>}
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
                    <td style={{padding:"6px 3px",textAlign:"center"}}>
                      {d._indicators ? (()=>{
                        const ind=d._indicators;
                        const bc=ind.bb.signal==='squeeze'?'#3fb950':ind.bb.signal==='narrow'?'#ffd600':'#333';
                        const mc=['golden','bullish'].includes(ind.macd.signal)?'#3fb950':ind.macd.signal==='recovering'?'#ffd600':['dead','bearish'].includes(ind.macd.signal)?'#f85149':'#333';
                        const oc=['accumulation','confirm'].includes(ind.obv.signal)?'#3fb950':ind.obv.signal==='recovering'?'#ffd600':['distribution','confirm_down'].includes(ind.obv.signal)?'#f85149':'#333';
                        return <div style={{display:'flex',gap:2,justifyContent:'center'}}>
                          <div title="볼린저" style={{width:isMobile?6:8,height:isMobile?6:8,borderRadius:'50%',background:bc}}/>
                          <div title="MACD" style={{width:isMobile?6:8,height:isMobile?6:8,borderRadius:'50%',background:mc}}/>
                          <div title="OBV" style={{width:isMobile?6:8,height:isMobile?6:8,borderRadius:'50%',background:oc}}/>
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

      {/* ============ 자산관리 탭 ============ */}
      {tab==="asset" && (()=>{
        /* calcData 기반 계산 — onChange에서 즉시 업데이트되므로 타이핑과 동시에 반영 */
        const D=calcData;
        const fx=D.fxRate||1380;
        /* 보유종목 KR/US 평가금액 자동 계산 */
        let portKRW=0,portUSD=0;
        portfolio.forEach(p=>{
          const s=stocks.find(d=>d.t===p.ticker);
          if(s&&s.p){if(s.k)portKRW+=s.p*p.qty;else portUSD+=s.p*p.qty;}
        });
        /* 자산 항목 */
        const items=[
          {label:"🇺🇸 미국주식",krw:portUSD*fx,      usd:portUSD,       color:"#4dabf7",auto:true},
          {label:"🇰🇷 한국주식",krw:portKRW,          usd:portKRW/fx,    color:"#ff922b",auto:true},
          {label:"📦 펀드/연금", krw:D.fundKRW+D.fundUSD*fx,  usd:D.fundUSD+D.fundKRW/fx,  color:"#bc8cff",auto:false},
          {label:"💵 현금(예비군)",krw:D.cashKRW+D.cashUSD*fx,usd:D.cashUSD+D.cashKRW/fx,  color:"#ffd43b",auto:false},
          {label:"🏠 기타자산",  krw:D.otherKRW+D.otherUSD*fx,usd:D.otherUSD+D.otherKRW/fx,color:"#8b949e",auto:false},
        ];
        const totalKRW=items.reduce((a,i)=>a+i.krw,0);
        /* 투자 여력 */
        const cashKRW=D.cashKRW+D.cashUSD*fx;
        const usCapacity=Math.max(0,cashKRW*(MKT.maxPositionPct??100)/100-portUSD*fx);
        const krCapacity=Math.max(0,cashKRW*(MKT.krMaxPositionPct??100)/100-portKRW);
        /* 섹터 분산 */
        const secMap={};
        portfolio.forEach(p=>{
          const s=stocks.find(d=>d.t===p.ticker);
          if(!s||!s.p)return;
          const v=s.k?s.p*p.qty:s.p*p.qty*fx;
          secMap[s.s]=(secMap[s.s]||0)+v;
        });
        const secTotal=Object.values(secMap).reduce((a,b)=>a+b,0);
        const secList=Object.entries(secMap).sort((a,b)=>b[1]-a[1]);
        const SC=["#4dabf7","#3fb950","#ffd43b","#ff922b","#bc8cff","#58a6ff","#f85149","#8b949e","#ff6b81","#00e676"];
        /* ─ 입력 헬퍼: 컴포넌트 함수 사용 금지 ─
           NI/ARow를 컴포넌트로 정의하면 렌더마다 새 함수 참조 →
           React가 언마운트/리마운트 → 포커스 날아감 → 모바일 키보드 닫힘
           해결: 인라인 JSX + useRef로 DOM 직접 관리 */
        /* 공통 input 스타일 */
        const iSt={padding:"8px 10px",borderRadius:6,border:"1px solid #30363d",background:"#0d1117",color:"#e6edf3",fontSize:14,fontFamily:"'JetBrains Mono'",outline:"none",width:"100%",boxSizing:"border-box"};
        /* 입력 그룹: ₩ / $ 2열 그리드 + 아래 환산값 풀폭 */
        return <div style={{width:"100%",background:"#06080d",overflowX:"hidden"}}>
        <div style={{maxWidth:960,margin:"0 auto",padding:isMobile?"10px 12px":"16px 24px",boxSizing:"border-box"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
            <div style={{fontSize:isMobile?16:20,fontWeight:900,color:"#e6edf3"}}>💰 자산관리</div>
            <div style={{display:"flex",alignItems:"center",gap:6,background:"#161b22",border:"1px solid #ffd43b44",borderRadius:8,padding:"5px 10px"}}>
              <span style={{fontSize:11,color:"#ffd43b",fontWeight:700}}>💱</span>
              <input type="text" inputMode="numeric"
                value={draftVals.fxRate}
                onChange={e=>onDraftChange('fxRate',e.target.value)}
                onBlur={e=>onDraftBlur('fxRate',e.target.value)}
                placeholder="1380"
                style={{padding:"2px 6px",borderRadius:4,border:"none",background:"transparent",color:"#ffd43b",fontSize:14,fontWeight:700,fontFamily:"'JetBrains Mono'",width:70,outline:"none",textAlign:"right"}}/>
              <span style={{fontSize:11,color:"#484f58"}}>원</span>
            </div>
          </div>
          <div style={{fontSize:11,color:"#484f58",marginBottom:12}}>보유종목 자동 연계 · 시장필터 Risk 상태 반영</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
            {/* 왼쪽: 입력 — AGroup 컴포넌트 없이 완전 인라인 (컴포넌트 정의 시 매 렌더마다 unmount/remount → 1글자만 입력됨) */}
            <div>
              {/* 💵 현금 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#8b949e"}}>💵 현금 (예비군)</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>₩{Math.round((D.cashKRW||0)+(D.cashUSD||0)*fx).toLocaleString()}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.cashKRW}
                      onChange={e=>onDraftChange('cashKRW',e.target.value)}
                      onBlur={e=>onDraftBlur('cashKRW',e.target.value)}
                      style={iSt}/></div>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.cashUSD}
                      onChange={e=>onDraftChange('cashUSD',e.target.value)}
                      onBlur={e=>onDraftBlur('cashUSD',e.target.value)}
                      style={iSt}/></div>
                </div>
              </div>
              {/* 📦 펀드/연금 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#8b949e"}}>📦 펀드 / 연금</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>₩{Math.round((D.fundKRW||0)+(D.fundUSD||0)*fx).toLocaleString()}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.fundKRW}
                      onChange={e=>onDraftChange('fundKRW',e.target.value)}
                      onBlur={e=>onDraftBlur('fundKRW',e.target.value)}
                      style={iSt}/></div>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.fundUSD}
                      onChange={e=>onDraftChange('fundUSD',e.target.value)}
                      onBlur={e=>onDraftBlur('fundUSD',e.target.value)}
                      style={iSt}/></div>
                </div>
              </div>
              {/* 🏠 기타 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#8b949e"}}>🏠 기타 자산</span>
                  <span style={{fontSize:12,fontWeight:700,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>₩{Math.round((D.otherKRW||0)+(D.otherUSD||0)*fx).toLocaleString()}</span>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.otherKRW}
                      onChange={e=>onDraftChange('otherKRW',e.target.value)}
                      onBlur={e=>onDraftBlur('otherKRW',e.target.value)}
                      style={iSt}/></div>
                  <div><div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="text" inputMode="numeric" placeholder="0"
                      value={draftVals.otherUSD}
                      onChange={e=>onDraftChange('otherUSD',e.target.value)}
                      onBlur={e=>onDraftBlur('otherUSD',e.target.value)}
                      style={iSt}/></div>
                </div>
              </div>
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:4}}>📝 메모</div>
                <textarea
                  value={draftVals.memo}
                  onChange={e=>onDraftChange('memo',e.target.value)}
                  onBlur={e=>onDraftBlur('memo',e.target.value)}
                  placeholder="자산 메모..." rows={2}
                  style={{width:"100%",padding:"6px 10px",borderRadius:5,border:"1px solid #30363d",background:"#0d1117",color:"#8b949e",fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{fontSize:10,color:"#484f58"}}>🟢 미국/한국주식은 보유종목 탭에서 자동 계산</div>
            </div>
            {/* 오른쪽: 현황 — 모바일에서 입력 아래 배치됨 */}
            <div>
              {/* 자산 현황 — 모바일: 카드형, PC: 테이블형 */}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                  <span style={{fontSize:13,fontWeight:800,color:"#e6edf3"}}>📊 전체 자산 현황</span>
                  <span style={{fontSize:14,fontWeight:900,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>₩{Math.round(totalKRW/1e8).toFixed(2)}억</span>
                </div>
                {items.map((item,i)=>{
                  const pct=totalKRW>0?(item.krw/totalKRW*100):0;
                  return <div key={i} style={{marginBottom:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
                      <span style={{fontSize:11,fontWeight:600,color:item.color}}>
                        {item.label}{item.auto&&<span style={{fontSize:9,color:"#484f58",marginLeft:3}}>auto</span>}
                      </span>
                      <span style={{fontSize:11,fontFamily:"'JetBrains Mono'",color:item.krw>0?"#e6edf3":"#484f58",fontWeight:600}}>
                        ₩{Math.round(item.krw).toLocaleString()} <span style={{fontSize:9,color:"#484f58"}}>{pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div style={{height:8,background:"#161b22",borderRadius:4,overflow:"hidden"}}>
                      <div style={{height:"100%",width:pct+"%",background:item.color,borderRadius:4,transition:"width .3s"}}/>
                    </div>
                  </div>;
                })}
                <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #21262d",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:11,color:"#484f58"}}>총 합계</span>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:14,fontWeight:900,color:"#3fb950",fontFamily:"'JetBrains Mono'"}}>₩{Math.round(totalKRW).toLocaleString()}</div>
                    <div style={{fontSize:10,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>${Math.round(totalKRW/fx).toLocaleString()}</div>
                  </div>
                </div>
              </div>
              {/* 투자 여력 */}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",marginBottom:6}}>⚡ 투자 여력</div>
                <div style={{fontSize:10,color:"#484f58",marginBottom:8}}>현금 ₩{Math.round(cashKRW).toLocaleString()} 기준</div>
                {[
                  {flag:"🇺🇸",label:"미국주식",rl:MKT.riskLabel||"조회전",rc:MKT.riskColor||"#484f58",pct:MKT.maxPositionPct??100,invested:portUSD*fx,capacity:usCapacity},
                  {flag:"🇰🇷",label:"한국주식",rl:MKT.krRiskLabel||"조회전",rc:MKT.krRiskColor||"#484f58",pct:MKT.krMaxPositionPct??100,invested:portKRW,capacity:krCapacity},
                ].map(({flag,label,rl,rc,pct,invested,capacity})=>(
                  <div key={flag} style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                      <span style={{fontSize:12,fontWeight:700,color:"#e6edf3"}}>{flag} {label}</span>
                      <span style={{fontSize:10,fontWeight:700,color:rc,padding:"2px 7px",borderRadius:4,background:rc+"18",border:"1px solid "+(rc)+"44"}}>{rl} · 최대{pct}%</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                      <div><div style={{fontSize:9,color:"#484f58"}}>현재 투자중</div>
                        <div style={{fontSize:12,fontWeight:700,color:"#8b949e",fontFamily:"'JetBrains Mono'"}}>₩{Math.round(invested).toLocaleString()}</div></div>
                      <div><div style={{fontSize:9,color:"#484f58"}}>추가 매수여력</div>
                        <div style={{fontSize:13,fontWeight:900,color:capacity>0?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>
                          {capacity>0?`₩${Math.round(capacity).toLocaleString()}`:"여력 없음"}</div></div>
                    </div>
                    {cashKRW>0&&<div style={{marginTop:6,height:5,background:"#21262d",borderRadius:3,overflow:"hidden"}}>
                      <div style={{height:"100%",width:Math.min(100,invested/cashKRW*100)+"%",background:rc,borderRadius:3}}/>
                    </div>}
                  </div>
                ))}
              </div>
              {/* 섹터 분산 */}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",marginBottom:8}}>🗂 섹터 분산 (보유종목 기준)</div>
                {secList.length===0
                  ? <div style={{fontSize:11,color:"#484f58",textAlign:"center",padding:"12px 0"}}>보유종목을 추가하면 표시됩니다</div>
                  : secList.map(([sec,val],i)=>{
                      const pct=secTotal>0?(val/secTotal*100):0;
                      return <div key={sec} style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                        <div style={{width:isMobile?66:100,fontSize:10,color:"#8b949e",textAlign:"right",flexShrink:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sec}</div>
                        <div style={{flex:1,height:14,background:"#161b22",borderRadius:3,overflow:"hidden",position:"relative"}}>
                          <div style={{height:"100%",width:pct+"%",background:SC[i%SC.length]+"88",borderRadius:3}}/>
                          <div style={{position:"absolute",left:5,top:0,height:"100%",display:"flex",alignItems:"center",fontSize:9,color:SC[i%SC.length],fontWeight:700,fontFamily:"'JetBrains Mono'"}}>{pct.toFixed(1)}%</div>
                        </div>
                        <div style={{fontSize:10,color:"#484f58",fontFamily:"'JetBrains Mono'",flexShrink:0,width:60,textAlign:"right"}}>₩{(val/1e6).toFixed(0)}M</div>
                      </div>;
                    })
                }
                {secList.length>0&&secList[0][1]/secTotal>0.5&&
                  <div style={{marginTop:6,fontSize:10,color:"#ff922b"}}>⚠️ <b>{secList[0][0]}</b> 섹터 50% 초과 집중</div>}
              </div>
            </div>
          </div>
        </div></div>;
      })()}

      {/* ============ 가이드 탭 ============ */}
      {tab==="guide" && (()=>{
        const Section=({icon,title,color,children})=>(
          <div style={{background:"#0d1117",border:"1px solid "+(color)+"33",borderRadius:10,padding:16,marginBottom:12}}>
            <div style={{fontSize:14,fontWeight:800,color,marginBottom:10}}>{icon} {title}</div>
            {children}
          </div>
        );
        const Row=({label,val,valColor,sub})=>(
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"5px 0",borderBottom:"1px solid #21262d22"}}>
            <div>
              <span style={{fontSize:12,color:"#8b949e"}}>{label}</span>
              {sub&&<div style={{fontSize:10,color:"#484f58",marginTop:1}}>{sub}</div>}
            </div>
            <span style={{fontSize:12,fontWeight:700,color:valColor||"#e6edf3",textAlign:"right",maxWidth:"55%"}}>{val}</span>
          </div>
        );
        const Badge=({txt,color})=>(
          <span style={{display:"inline-block",padding:"2px 8px",borderRadius:4,border:"1px solid "+(color)+"55",background:color+"15",color,fontSize:11,fontWeight:700,marginRight:4,marginBottom:4}}>{txt}</span>
        );

        return <div style={{maxWidth:900,margin:"0 auto",padding:isMobile?"12px 14px":"20px 24px"}}>
          <div style={{fontSize:isMobile?16:20,fontWeight:900,color:"#e6edf3",marginBottom:4}}>📖 듀얼엔진 프로 사용 가이드</div>
          <div style={{fontSize:11,color:"#484f58",marginBottom:18,fontFamily:"'JetBrains Mono'"}}>{SCHEMA_VERSION} · 289종목 (🇺🇸{stocks.filter(d=>!d.k).length} + 🇰🇷{stocks.filter(d=>d.k).length})</div>

          {/* 1. 주요 기능 */}
          <Section icon="🗂" title="탭별 주요 기능" color="#58a6ff">
            {[
              ["📊 메인","전체 종목 테이블 — 점수순 정렬, 엔진별 뷰 전환, AI 추천 4섹션","실시간 가격·등락 + 일봉 분석 캐시"],
              ["👁 워치리스트","관심 종목 모아보기 — 등급 업/다운 변화 알림","최근 30일 등급 변화 자동 감지"],
              ["💼 보유종목","매수 기록·손절선 추적 — 이탈/임박/안전 상태 표시","진입손절 -7% / 트레일링 -9% 자동 계산"],
              ["🌐 시장필터","🇺🇸 SPY+VIX / 🇰🇷 KOSPI 독립 Risk 상태 조회","Risk On/Neutral/Off/Defensive 4단계"],
              ["🧮 포지션계산기","손절폭 기반 매수수량 + 시장·점수 배수 적용 권장비중","과도한 집중 방지 자동 계산"],
              ["✅ 체크리스트","매수 전 4엔진 조건 수동 점검","거래 실행 전 최종 확인용"],
            ].map(([t,d,s])=><Row key={t} label={t} val={d} sub={s}/>)}
          </Section>

          {/* 2. 점수 체계 */}
          <Section icon="🎯" title="점수 배점 (100점 만점)" color="#00e676">
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
              {[
                ["🏆 SEPA","30pt","Minervini 8조건 · 가격>SMA150/200 · MA정렬 · 52주 위치","#ffd600"],
                ["⚡ 듀얼모멘텀","23pt","절대+상대 모멘텀 · 3M/6M/12M 실시간 SPY 비교","#00e676"],
                ["📉 VCP","15pt","60일 T1>T2>T3 변동성 수축 · 성숙(T3<8%·3주+) = 돌파 임박","#448aff"],
                ["🎯 MF 펀더멘털","10pt","FCF·성장성·수익성·재무·밸류에이션·경쟁력 · A/B/C/F등급","#ff922b"],
                ["📐 CF 현금흐름","5pt","단기·중기·장기 현금흐름 컨플루언스 · 듀얼 확인 시 보너스","#bc8cff"],
                ["📊 거래량엔진","12pt","52주 위치 + 5일 방향 + 거래량 패턴 · 매집/돌파/매도압력/고점이탈","#4dabf7"],
              ].map(([nm,pt,desc,c])=>(
                <div key={nm} style={{background:"#161b22",borderRadius:8,padding:"10px 12px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12,fontWeight:700,color:c}}>{nm}</span>
                    <span style={{fontSize:14,fontWeight:900,color:c,fontFamily:"'JetBrains Mono'"}}>{pt}</span>
                  </div>
                  <div style={{fontSize:10,color:"#484f58",lineHeight:1.5,whiteSpace:"pre-line"}}>{desc}</div>
                </div>
              ))}
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>교차검증 ±5pt · 감점 체계</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                <Badge txt="교차검증 ±5" color="#58a6ff"/>
                <Badge txt="Gate G1 실패 -15" color="#f85149"/>
                <Badge txt="Gate G2 실패 -10" color="#f85149"/>
                <Badge txt="Gate G3 실패 -8" color="#ff922b"/>
                <Badge txt="G1+G2 동시 -20" color="#f85149"/>
                <Badge txt="Risk Penalty 최대 -10" color="#ff922b"/>
                <Badge txt="MF F등급 → 64점 상한" color="#ffd600"/>
                <Badge txt="CF 전체약세 → 69점 상한" color="#ffd600"/>
              </div>
            </div>
          </Section>

          {/* 3. 버딕트 티어 */}
          <Section icon="🏅" title="버딕트 티어 & ExecTag" color="#bc8cff">
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(5,1fr)",gap:6,marginBottom:12}}>
              {[
                ["🔥 최강","85점+","#ff1744"],
                ["🟢 매수","65~84","#00e676"],
                ["🔵 관심","50~64","#448aff"],
                ["🟡 관망","35~49","#ffd600"],
                ["⛔ 위험","~34","#78909c"],
              ].map(([v,r,c])=>(
                <div key={v} style={{textAlign:"center",padding:"8px 4px",background:c+"12",border:"1px solid "+(c)+"44",borderRadius:8}}>
                  <div style={{fontSize:13,fontWeight:800,color:c}}>{v}</div>
                  <div style={{fontSize:11,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{r}점</div>
                </div>
              ))}
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>실행태그 (점수와 독립 계산)</div>
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:6}}>
              {[
                ["⚡ BUY NOW","지금 매수 가능 · 피봇 근접+거래량 확인","#00e676"],
                ["📈 BUY ON BREAKOUT","돌파 시 매수 · VCP 성숙·피봇 대기 중","#448aff"],
                ["👀 WATCH","조건 미달 · 추적 관찰 필요","#ffd600"],
                ["🚫 AVOID","매수 금지 · Gate 실패·위험 신호","#f85149"],
              ].map(([t,d,c])=>(
                <div key={t} style={{padding:"8px 10px",background:c+"10",border:"1px solid "+(c)+"33",borderRadius:8}}>
                  <div style={{fontSize:11,fontWeight:700,color:c,marginBottom:3}}>{t}</div>
                  <div style={{fontSize:10,color:"#484f58",whiteSpace:"pre-line",lineHeight:1.4}}>{d}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. 종목 선별 기준 */}
          <Section icon="🔍" title="종목 선별 기준" color="#ff922b">
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>🔥 지금 사세요 (즉시 매수)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                <Badge txt="총점 85+" color="#ff1744"/>
                <Badge txt="SEPA Stage 2 확인" color="#ffd600"/>
                <Badge txt="DM 절대+상대 STRONG" color="#00e676"/>
                <Badge txt="거래량 매집 or 돌파" color="#4dabf7"/>
                <Badge txt="VCP 성숙 or 돌파확인" color="#448aff"/>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>👀 곧 터질 (피봇 대기)</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                <Badge txt="총점 60~84" color="#448aff"/>
                <Badge txt="VCP 성숙 (T3<8%)" color="#448aff"/>
                <Badge txt="피봇가 -10%~+3% 이내" color="#ffd600"/>
                <Badge txt="거래량 Dry-up 확인" color="#4dabf7"/>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>📈 조용한 강자</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                <Badge txt="SEPA 7/8 이상" color="#ffd600"/>
                <Badge txt="DM 신호 7+ 이상" color="#00e676"/>
                <Badge txt="총점 55~84" color="#448aff"/>
                <Badge txt="거래량 적정 (매집증가)" color="#4dabf7"/>
              </div>
            </div>
            <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginTop:6}}>
              <div style={{fontSize:11,fontWeight:700,color:"#f85149",marginBottom:6}}>🚫 제외 조건 (하나라도 해당 시 진입 금지)</div>
              {[
                "Gate G1 실패 — 가격이 SMA150·SMA200 아래",
                "Gate G2 실패 — 200일선 하락 추세 진행 중",
                "DM SELL — 절대·상대 모멘텀 모두 음수",
                "거래량 고점이탈 — 고가권 폭발 거래량 출현",
                "거래량 매도압력 — 상위권에서 대량 매도 신호",
                "시장필터 Defensive — KOSPI/SPY 200일선 하락 중",
              ].map((t,i)=><div key={i} style={{fontSize:11,color:"#8b949e",padding:"3px 0",borderBottom:"1px solid #21262d22"}}>✕ {t}</div>)}
            </div>
          </Section>

          {/* 5. 손절·포지션 규칙 */}
          <Section icon="🛡" title="손절 & 포지션 관리" color="#3fb950">
            <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:8,marginBottom:10}}>
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#ff922b",marginBottom:6}}>① 진입 손절 (고정)</div>
                <div style={{fontSize:20,fontWeight:900,color:"#ff922b",fontFamily:"'JetBrains Mono'",marginBottom:4}}>매수가 × 0.93</div>
                <div style={{fontSize:10,color:"#484f58"}}>매수 직후부터 적용. -7% 하락 시 무조건 손절</div>
              </div>
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px"}}>
                <div style={{fontSize:11,fontWeight:700,color:"#3fb950",marginBottom:6}}>② 트레일링 손절 (동적)</div>
                <div style={{fontSize:20,fontWeight:900,color:"#3fb950",fontFamily:"'JetBrains Mono'",marginBottom:4}}>최고가 × 0.91</div>
                <div style={{fontSize:10,color:"#484f58"}}>상승할수록 손절선 따라 올라감. 둘 중 높은 쪽 적용</div>
              </div>
            </div>
            <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>시장 Risk 상태별 권장 포지션 비중</div>
            {[
              ["🟢 Risk On","최대 100%","적극 매수 가능","#00e676"],
              ["🔵 Neutral","최대 50%","신중하게 진입","#58a6ff"],
              ["🟡 Risk Off","최대 25%","소규모만 허용","#ffd600"],
              ["🔴 Defensive","신규 매수 금지","현금 보유 유지","#f85149"],
            ].map(([s,p,d,c])=>(
              <div key={s} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"6px 10px",borderRadius:6,marginBottom:4,background:c+"10",border:"1px solid "+(c)+"22"}}>
                <span style={{fontSize:12,fontWeight:700,color:c}}>{s}</span>
                <span style={{fontSize:12,fontWeight:900,color:c,fontFamily:"'JetBrains Mono'"}}>{p}</span>
                <span style={{fontSize:10,color:"#484f58"}}>{d}</span>
              </div>
            ))}
          </Section>

          {/* 6. 일일 루틴 */}
          <Section icon="📅" title="일일 사용 루틴" color="#4dabf7">
            {[
              ["① 시장필터 실행","🌐 탭 → '시장필터 조회' → US Risk / KR Risk 확인","매일 장 시작 전"],
              ["② 종목 분석 실행","📊 탭 → '종목 분석 실행' → 전체 분석 (~2분)","하루 1회 실행, 결과 캐시 저장"],
              ["③ 가격 업데이트","분석 후 자동 5초 갱신 시작","실시간 반영"],
              ["④ AI 추천 확인","🔥지금 사세요 / 👀곧 터질 섹션 체크","상위 4~5종목 집중"],
              ["⑤ 관심 종목 등록","⭐ 클릭 → 워치리스트 추가","등급 변화 자동 알림"],
              ["⑥ 매수 실행 전","✅ 체크리스트 탭 → 4엔진 조건 확인","🧮 포지션 계산 필수"],
            ].map(([s,d,t])=><Row key={s} label={s} val={d} sub={t}/>)}
          </Section>

        </div>;
      })()}

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
