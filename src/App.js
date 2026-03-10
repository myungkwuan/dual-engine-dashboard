import { useState, useEffect, useRef, useCallback, useMemo, Fragment } from "react";

import D from "./data";

/* ===== 유틸 ===== */
const fP=(v,k)=>k?`₩${Math.round(v).toLocaleString()}`:`$${v.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const MKT_DEFAULT={spy12m:0,spy200:"조회전",kospi12m:0,vix:0,nh:"-",ad:"-",
  sec:[["XLK",0,0],["XLC",0,0],["XLI",0,0],["XLY",0,0],["XLV",0,0],["XLU",0,0],["XLE",0,0],["XLF",0,0],["XLB",0,0],["XLP",0,0],["XLRE",0,0]],
  krSectors:[],
  health:{score:0,mode:"조회전",modeColor:"#484f58",modeIcon:"⏳",modeAction:"시장필터를 먼저 실행하세요"},
  krHealth:{score:0,mode:"조회전",modeColor:"#484f58",modeIcon:"⏳",modeAction:"시장필터를 먼저 실행하세요"},
  spy:{},vixData:{},kospi:{},loaded:false,maxPositionPct:100,krMaxPositionPct:100};

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
  const[showAll,setShowAll]=useState(false);

  if(!trendData||!trendData.data||trendData.data.length===0)
    return <div style={{padding:20,textAlign:"center",color:"#484f58",fontSize:13}}>데이터 없음</div>;

  const{data,sectors,ranking}=trendData;
  const fmtDate=d=>d?d.slice(5):'';

  /* 상위 5개 섹터 (수익률 기준) */
  const top5Sectors=new Set((ranking||[]).slice(0,5).map(r=>r.sector));

  /* 범례 클릭 → 메인탭 이동 */
  const handleSectorClick=s=>{if(onSectorNav)onSectorNav(s,market);};

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

  /* 표시할 섹터: showAll이면 전부, 아니면 top5만 */
  const visibleSectors=showAll?sectors:sectors.filter(s=>top5Sectors.has(s));

  return <div>
    {/* 보기 토글 */}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <span style={{fontSize:9,color:"#484f58"}}>기본: 수익률 상위 5개 강조 표시</span>
      <button onClick={()=>setShowAll(v=>!v)}
        style={{padding:"2px 8px",borderRadius:4,border:"1px solid "+(showAll?"#ffd43b":"#30363d"),
          background:showAll?"#ffd43b12":"transparent",color:showAll?"#ffd43b":"#484f58",
          cursor:"pointer",fontSize:9,fontWeight:600}}>
        {showAll?"▲ 상위 5개만":"▼ 전체 보기 ("+sectors.length+"개)"}
      </button>
    </div>

    {/* SVG 라인 차트 */}
    <div style={{overflowX:"auto",WebkitOverflowScrolling:"touch"}}>
    <svg width={W} height={H} style={{display:"block",margin:"0 auto"}}>
      <g transform={"translate("+PAD.left+","+PAD.top+")"}>
        {/* 배경 격자 */}
        {yTicks.map(v=>(
          <g key={v}>
            <line x1={0} y1={yScale(v)} x2={innerW} y2={yScale(v)}
              stroke={v===0?"#ffffff30":"#21262d"} strokeWidth={v===0?1.5:1}
              strokeDasharray={v===0?"5,4":""}/>
            <text x={-4} y={yScale(v)+4} textAnchor="end" fontSize={isMobile?8:10} fill="#484f58">{v}%</text>
          </g>
        ))}

        {/* 섹터 라인 — 전체 그리되, top5 아닌 것은 흐리게 */}
        {sectors.map((s,si)=>{
          const color=SECTOR_COLORS[si%SECTOR_COLORS.length];
          const isTop5=top5Sectors.has(s);
          const isHov=hoveredSector===s;
          const isVisible=showAll||isTop5;
          if(!isVisible)return null;
          let pathD='';
          data.forEach((pt,i)=>{
            if(pt[s]==null)return;
            const x=xScale(i),y=yScale(pt[s]);
            const prev=data[i-1];
            if(i===0||prev==null||prev[s]==null)pathD+='M'+x+','+y;
            else pathD+='L'+x+','+y;
          });
          if(!pathD)return null;
          const lastPt=data[data.length-1];
          const lastVal=lastPt?.[s];
          const lastX=xScale(data.length-1);
          const lastY=lastVal!=null?yScale(lastVal):null;
          // 호버: 해당만 진하게 / 비호버: top5는 선명, 나머지(showAll시) 흐리게
          const opacity=hoveredSector?(isHov?1:0.12):(isTop5?1:0.2);
          const sw=isHov?3.5:isTop5?2:1;
          return <g key={s}>
            <path d={pathD} fill="none" stroke={color}
              strokeWidth={sw} opacity={opacity}
              style={{transition:"all .18s"}}/>
            {lastY!=null&&<>
              <circle cx={lastX} cy={lastY} r={isHov?4.5:isTop5?2.5:1.5}
                fill={color} opacity={opacity}/>
              <text x={lastX+6} y={lastY+4} fontSize={isMobile?8:9} fill={color}
                opacity={hoveredSector?(isHov?1:0.05):(isTop5?1:0.2)}
                fontWeight={isHov?800:isTop5?600:400}>
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
      {(ranking||[]).map(({sector,ret},rank)=>{
        const colorIdx=sectors.indexOf(sector);
        const color=SECTOR_COLORS[colorIdx%SECTOR_COLORS.length];
        const retColor=ret>0?"#3fb950":ret<0?"#f85149":"#484f58";
        const isHov=hoveredSector===sector;
        const isTop5=rank<5;
        return <div key={sector}
          onClick={()=>handleSectorClick(sector)}
          onMouseEnter={()=>setHoveredSector(sector)}
          onMouseLeave={()=>setHoveredSector(null)}
          style={{display:"flex",alignItems:"center",gap:6,padding:"5px 8px",
            borderRadius:6,cursor:onSectorNav?"pointer":"default",
            background:isHov?color+"18":isTop5?"#161b22":"transparent",
            border:"1px solid "+(isHov?color+"66":isTop5?"#21262d":"#21262d22"),
            opacity:isTop5?1:0.55,
            transition:"all .15s",userSelect:"none"}}>
          <div style={{fontSize:9,color:"#484f58",fontFamily:"'JetBrains Mono'",minWidth:12}}>{rank+1}</div>
          <div style={{width:14,height:3,borderRadius:2,background:color,flexShrink:0}}/>
          <div style={{flex:1,fontSize:isMobile?9:10,color:isHov?"#e6edf3":isTop5?"#c9d1d9":"#8b949e",
            fontWeight:isHov?700:isTop5?500:400,
            overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sector}</div>
          <div style={{fontSize:isMobile?9:11,fontWeight:isTop5?800:600,
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
function getDualMomentum(d, b3, b6, b12) {
  const r3m = d.r[0], r6m = d.r[1], secRank = d.r[2];
  // 12M 수익률: analysis 결과(momDetail)에 있으면 사용, 없으면 0
  const r12m = (d.a && d.a.momDetail && d.a.momDetail.r12m != null) ? d.a.momDetail.r12m : 0;

  const spyBench3  = b3  != null ? b3  : 4.2;
  const spyBench6  = b6  != null ? b6  : 8.7;
  const spyBench12 = b12 != null ? b12 : 18.0;
  // fallback 여부 표시 (UI 경고용)
  const benchFallback = (b3 == null || b6 == null);

  /* ── 절대 모멘텀 (35점) ── */
  const absM3  = r3m  > 0;
  const absM6  = r6m  > 0;
  const absM12 = r12m > 0;
  // 3M:10 + 6M:10 + 12M:5 = 25pt 기본, 셋 다 양수면 +10
  const absPt = (absM3 ? 10 : 0) + (absM6 ? 10 : 0) + (absM12 ? 5 : 0) + (absM3 && absM6 && absM12 ? 10 : 0);
  const absScore = (absM3 ? 1 : 0) + (absM6 ? 1 : 0) + (absM12 ? 1 : 0);

  /* ── 상대 모멘텀 (45점) ── */
  const relM3  = r3m  > spyBench3;
  const relM6  = r6m  > spyBench6;
  const relM12 = r12m > spyBench12;
  // 3M:15 + 6M:15 + 12M:15 = 45pt
  const relPt = (relM3 ? 15 : 0) + (relM6 ? 15 : 0) + (relM12 ? 15 : 0);
  const relScore = (relM3 ? 1 : 0) + (relM6 ? 1 : 0) + (relM12 ? 1 : 0);

  /* ── 섹터 순위 보너스 (최대 10점, 고정값 → 보조 역할로 축소) ── */
  const secBonus = secRank <= 5 ? 10 : secRank <= 10 ? 7 : secRank <= 20 ? 4 : 0;

  /* ── 가속도 보너스 (최대 10점) ── */
  // 최근 3M가 6M의 절반 이상이면 모멘텀 가속 중
  const accelerating = r6m !== 0 && r3m > r6m * 0.5;
  // 3M가 6M보다도 크면 강가속
  const strongAccel  = r3m > r6m && r3m > 0 && r6m > 0;
  const accelBonus   = strongAccel ? 10 : accelerating ? 5 : 0;

  /* ── RS 점수 (0~100) ── */
  // 절대35 + 상대45 + secBonus10 + accelBonus10 → 합산 후 100 clamp
  const rsScore = Math.min(100, Math.max(0, Math.round(
    absPt * (35/35) + relPt * (45/45) + secBonus + accelBonus
  )));

  /* ── 추세 강도 (-3 ~ +3, 기존 호환 유지) ── */
  const trendStr = (absM3 ? 1 : -1) + (relM3 ? 1 : -1) + (relM6 ? 1 : -1);

  /* ── SEPA 보완 ── */
  const sepaOK    = seV(d) === "매수준비" || seTt(d) >= 7;
  const sepaWatch = seTt(d) >= 6;
  const stageOK   = seSt(d).includes("Stage 2");

  /* ── 피봇 근접 ── */
  const near22  = vcpPx(d) <= 5;
  const near50  = vcpPx(d) <= 10;
  const breakout = seV(d) === "매수준비" && near22;

  /* ── 듀얼 종합 신호 ──
     secRank는 STRONG BUY 허용 조건으로만 사용 (필터 역할) */
  const secOKforStrong = secRank <= 20; // 20위 밖이면 STRONG BUY 불가
  let signal, signalColor, signalScore;
  if (absScore >= 2 && relScore >= 2 && sepaOK && stageOK && secOKforStrong) {
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

  return {
    absM3, absM6, absM12, absScore,
    relM3, relM6, relM12, relScore,
    secBonus, secRank,
    accelerating, strongAccel, accelBonus,
    trendStr, sepaOK, stageOK,
    near22, near50, breakout,
    signal, signalColor, signalScore,
    rsScore, r3m, r6m, r12m,
    bench3: spyBench3, bench6: spyBench6, bench12: spyBench12,
    benchFallback
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

  /* ── 보조지표 가산/감점 (±2점) — 확신도 보조층 ──
     볼린저·MACD·OBV 3개는 본체 엔진이 아니라 확인 레이어.
     3개 우호적 → +2, 2개 → +1, ≤1 → 0, 2개 이상 악화 → -1 */
  if (d._indicators) {
    const ind = d._indicators;
    const indGreen = [
      ind.bb.signal === 'squeeze' || ind.bb.signal === 'narrow',
      ['golden','bullish','recovering'].includes(ind.macd.signal),
      ['accumulation','confirm','recovering'].includes(ind.obv.signal)
    ].filter(Boolean).length;
    const indRed = [
      ind.bb.signal === 'wide',
      ['dead','bearish'].includes(ind.macd.signal),
      ['distribution','confirm_down'].includes(ind.obv.signal)
    ].filter(Boolean).length;
    if (indGreen >= 3) crossPt += 2;
    else if (indGreen >= 2) crossPt += 1;
    if (indRed >= 2) crossPt -= 1;
  }

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
  const isETF = d.s === 'ETF';

  /* ── 헤드라인 (종목 강도 + 실행 상태 분리) ── */
  const good = [], bad = [], wait = [];
  if (sepaPt >= 22) good.push('추세↑'); else if (sepaPt <= 9) bad.push('추세↓');
  if (dmPt >= 14) good.push('모멘텀↑'); else if (dmPt <= 3) bad.push('모멘텀↓');
  if (vcpPt >= 10) good.push('타이밍↑'); else if (vcpPt <= 3) wait.push('타이밍 대기');
  if (volPt >= 9) good.push('매집↑'); else if (volPt <= 0) bad.push('세력이탈!');
  if (mfPt >= 6) good.push('실적↑'); else if (mfPt <= 2) bad.push('실적↓');

  // 종목 강도 문구
  let stockGrade = '';
  if (v.stars >= 5) stockGrade = '최상위 주도주';
  else if (v.stars >= 4) stockGrade = good.length >= 3 ? good.join('·') + ' 동시 강세 — 강한 후보' : '핵심 지표 강함 — 좋은 후보';
  else if (v.stars >= 3) stockGrade = good.length ? good.join('·') + '은 강하나 ' + (bad.concat(wait)).join('·') + ' 확인 필요' : '보통 수준 — 추가 관찰 필요';
  else if (v.stars >= 2) stockGrade = bad.length ? bad.join('·') + ' 약점 — 진입 보류' : '전반적으로 힘 부족';
  else stockGrade = (bad.length ? bad.join('·') + ' 등 여러 약점' : '다수 약점') + ' — 회피 권장';

  // 실행 상태 문구
  const execTag = d._execTag;
  let actionLine = '';
  if (execTag === 'BUY NOW') actionLine = '🟢 지금 매수 가능 — 피봇 근처, 조건 충족';
  else if (execTag === 'BUY ON BREAKOUT') actionLine = '🔵 돌파 확인 후 매수 — 패턴 완성 대기';
  else if (execTag === 'WATCH') actionLine = '🟡 관찰 유지 — 아직 진입 조건 미달';
  else if (execTag === 'AVOID') actionLine = '🔴 진입 회피 — Gate/Risk 조건 실패';
  else actionLine = '';

  // 헤드라인 충돌 방지 한줄 사유
  let conflict = '';
  if (execTag === 'BUY ON BREAKOUT' && v.totalPt >= 65)
    conflict = '추세·모멘텀은 강하지만, VCP 패턴이 아직 완성되지 않았습니다.';
  else if (execTag === 'AVOID' && v.totalPt >= 65)
    conflict = '종목 자체는 양호하지만, Gate/Risk 조건을 통과하지 못했습니다.';
  else if (execTag === 'BUY NOW' && vcpPt >= 10)
    conflict = '패턴도 완성 — 즉시 진입 타이밍입니다.';

  lines.push('💬 종목 강도: ' + stockGrade);
  if (actionLine) lines.push('🏷️ 실행 상태: ' + actionLine);
  if (conflict) lines.push('   └ ' + conflict);

  /* ── 점수 한줄 ── */
  lines.push('📊 ' + v.totalPt + '점 | SEPA ' + sepaPt + '/30 · DM ' + dmPt + '/23 · VCP ' + vcpPt + '/15 · MF ' + mfPt + '/10 · CF ' + cfPt + '/5 · 거래량 ' + volPt + '/12' + (crossPt ? (' · 교차' + (crossPt > 0 ? '+' : '') + crossPt) : '') + (gatePenalty ? (' · Gate-' + gatePenalty) : '') + (riskPenalty ? (' · Risk-' + riskPenalty) : ''));

  if (gateLabel) lines.push('🚧 Gate 실패 (-' + gatePenalty + 'pt): ' + gateLabel + '. 매수 조건 미충족.');
  if (riskPenalty > 0 && d._riskReasons?.length) lines.push('⚠️ 위험 요소 (-' + riskPenalty + 'pt): ' + d._riskReasons.join(' / '));

  /* ── 추세 (SEPA) ── */
  if (st === 8) lines.push('📈 추세 [최상] 장기·중기 이동평균선이 모두 상승 정배열입니다. 가장 이상적인 매수 구간.');
  else if (st >= 7) lines.push('📈 추세 [강함] 거의 완벽한 정배열 (' + st + '/8). 한두 가지만 더 갖춰지면 최상 상태.');
  else if (st >= 5) lines.push('📈 추세 [보통] 상승 전환 시도 중 (' + st + '/8). 아직 확실하지 않아 기다리는 게 좋습니다.');
  else if (st >= 3) lines.push('📈 추세 [주의] 아직 약한 추세 (' + st + '/8). 방향 전환까지 관망 권장.');
  else lines.push('📉 추세 [위험] 하락 중 (' + st + '/8). 지금 진입은 손실 위험이 높습니다.');

  /* ── 모멘텀 (DM) ── */
  const bench = d.k ? 'KOSPI/Q' : 'SPY';
  if (dm.signalScore >= 8) lines.push('🚀 모멘텀 [최상] 시장(' + bench + ') 대비 상대수익률이 매우 강합니다. 주도주 특성 확인.');
  else if (dm.signalScore >= 6) lines.push('➡️ 모멘텀 [보통] 오르고는 있지만 시장 평균 수준. 특별히 강하지는 않습니다.');
  else if (dm.signalScore >= 3) lines.push('⚠️ 모멘텀 [주의] 시장보다 약하게 움직이는 중. 힘이 빠지고 있습니다.');
  else lines.push('🔻 모멘텀 [위험] 시장보다 크게 밀리는 중. 약한 종목은 더 떨어지기 쉽습니다.');

  /* ── VCP 타이밍 ── */
  if (vm === '성숙🔥') lines.push('⏰ 타이밍 [최상] 변동성·거래량 동시 수축 완료! 피봇 돌파 시 즉시 매수 가능.');
  else if (vm === '돌파✅') lines.push('🚀 타이밍 [강함] 수축 완료 후 피봇 돌파. 건강한 돌파 — 눌림목 진입 기회.');
  else if (vm === '돌파') lines.push('🚀 타이밍 [보통] 피봇을 넘었으나 사전 수축이 불명확. 돌파 강도를 추가 확인하세요.');
  else if (vm.includes('성숙')) lines.push('⏰ 타이밍 [강함] 패턴 거의 완성. 피봇 근처에서 돌파를 기다리는 중.');
  else if (vm === '형성중') lines.push('⏳ 타이밍 [대기] 패턴은 형성 중입니다. 본격 진입은 돌파 확인 후가 더 안전합니다.');
  else lines.push('❌ 타이밍 [대기] 뚜렷한 매수 패턴 없음. 패턴이 만들어질 때까지 기다리세요.');

  /* ── 거래량 ── */
  if (vol) {
    if (vol.signalType === 'buy') {
      if (vol.signal.includes('바닥')) lines.push('💰 거래량 [강함] 바닥에서 큰손 매집 시작! 52주 위치 ' + vol.positionPct + '%로 싸게 모으는 중.');
      else if (vol.signal.includes('돌파')) lines.push('💰 거래량 [강함] 돌파 시 거래량 폭발(' + vol.volRatio + '배). 기관이 사들이는 신호.');
      else lines.push('💰 거래량 [강함] 오르면서 거래량도 늘어남. 건강한 상승 신호.');
    } else if (vol.signalType === 'sell') {
      if (vol.signal.includes('고점')) lines.push('🚨 거래량 [위험] 꼭대기에서 거래량 급증 후 하락. 큰손이 팔고 나가는 신호. 주의!');
      else lines.push('🚨 거래량 [위험] 하락 시 거래량 증가. 매도 세력이 강합니다. 조심하세요.');
    } else if (vol.signalType === 'caution') {
      if (vol.signal.includes('과열')) lines.push('⚡ 거래량 [주의] 고점 권역에서 거래량 급증 — 과열 천장 가능성. 추격 매수 금지.');
      else if (vol.signal.includes('추세약화')) lines.push('📉 거래량 [주의] 오르는데 거래량이 줄어듦. 상승 힘이 빠지는 중.');
      else lines.push('⚡ 거래량 [주의] 변곡점 신호. 방향 전환 가능성 — 지켜보세요.');
    } else if (vol.volDryup) {
      lines.push('🤫 거래량 [강함] 거래량이 쥐죽은듯 조용해지는 중. 큰 움직임 전 전형적인 건조 패턴.');
    }
  }

  /* ── 실적/자금유입 ── */
  if (isETF) {
    if (mfPt >= 8) lines.push('💰 자금유입 [최상] 거래량 폭발! 기관자금 대량 유입 중.');
    else if (mfPt >= 6) lines.push('💰 자금유입 [강함] 거래량 증가. 자금 유입 확인.');
    else if (mfPt >= 4) lines.push('💰 자금유입 [보통] 특이 사항 없음. 유입·유출 균형 상태.');
    else lines.push('📉 자금유출 [주의] 거래량 감소. 자금이 빠져나가는 중.');
  } else {
    if (mfPt >= 8) lines.push('✅ 실적 [강함] 매출 성장, 이익 개선, 재무 상태가 양호합니다.');
    else if (mfPt >= 6) lines.push('✅ 실적 [보통] 대체로 괜찮지만 일부 개선 여지가 있습니다.');
    else if (mfPt >= 4) lines.push('⚠️ 실적 [주의] 평균 수준. 펀더멘탈만으로는 확신이 어렵습니다.');
    else lines.push('⚠️ 실적 [위험] 실적 뒷받침 부족. 추가 확인이 필요합니다.');
  }

  /* ── 최종 결론 ── */
  if (v.stars >= 5) lines.push('\n🔥 결론: 종목과 자리 모두 강합니다. ' + d.q[5] + '% 비중, 진입가 ' + fP(d.q[0] || d.p, d.k) + ' 부근. 손절 ' + fP(d.q[1] || (d.p * 0.93), d.k) + ' (-7%)');
  else if (v.stars >= 4 && execTag === 'BUY ON BREAKOUT') lines.push('\n💡 결론: 종목은 좋고, 자리만 기다리면 됩니다. 피봇 돌파 확인 후 진입이 더 유리합니다.');
  else if (v.stars >= 4) lines.push('\n💡 결론: 소량 먼저 사고, 돌파 확인 시 추가매수.');
  else if (v.stars >= 3) lines.push('\n👀 결론: 워치리스트에 넣고 조건이 좋아지면 다시 보세요.');
  else if (v.stars >= 2) lines.push('\n⏸ 결론: 아직 때가 아닙니다. 추세가 돌아설 때까지 기다리세요.');
  else lines.push('\n🚫 결론: 진입하지 마세요. 지금은 리스크가 기대수익을 초과합니다.');

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
function StockDetailModal({ stock, onClose, isWatched, onToggleWatch, gradeHistory, onCalcPosition, mkt }) {
  if (!stock) return null;
  const verdict = getVerdict(stock);
  const b3 = stock.k ? (mkt?.kospi3m||null) : (mkt?.spy3m||null);
  const b6 = stock.k ? (mkt?.kospi6m||null) : (mkt?.spy6m||null);
  const b12 = stock.k ? (mkt?.kospi12m||null) : (mkt?.spy12m||null);
  const dm = getDualMomentum(stock, b3, b6, b12);
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

  const bench = stock.k ? 'KOSPI/Q' : 'SPY';
  const dmInterp = dm.signal === 'STRONG BUY'
    ? { signal: '절대+상대 모멘텀 모두 강력', color: '#00ff88', icon: '🟢',
        desc: '3M·6M 절대수익률 양수 + '+bench+' 대비 초과수익 확인. 시장 대비 확실한 아웃퍼폼 중이며, 추세강도 '+dm.trendStr+'/3으로 상승세 견고.',
        action: '✅ 모멘텀 최강! 추세 추종 매수 적극 권장' }
    : dm.signal === 'BUY'
    ? { signal: '모멘텀 양호', color: '#3fb950', icon: '🔵',
        desc: '절대·상대 모멘텀이 대체로 긍정적. 시장 대비 초과수익이 있으나 일부 기간에서 약세. 추세강도 '+dm.trendStr+'/3.',
        action: '🔵 매수 가능 구간. SEPA 조건과 교차 확인 권장' }
    : dm.signal === 'CAUTION'
    ? { signal: '모멘텀 혼조', color: '#d29922', icon: '🟡',
        desc: '절대/상대 모멘텀 중 일부만 충족. 상승세가 둔화되고 있거나 시장 평균 수준. 추세강도 '+dm.trendStr+'/3으로 방향성 불확실.',
        action: '🟡 신규 매수 보류. 기존 보유 시 모니터링 강화' }
    : { signal: '모멘텀 약세', color: '#f85149', icon: '🔴',
        desc: '절대·상대 모멘텀 미충족. '+bench+' 대비 언더퍼폼이며 하락추세 가능성. 추세강도 '+dm.trendStr+'/3.',
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
        desc: 'RS '+dm.rsScore+'/100으로 전체 시장 상위 '+(100-dm.rsScore)+'%에 위치. 3M 수익률 '+(dm.r3m>0?'+':'')+dm.r3m+'%('+(stock.k?'KOSPI/Q':'SPY')+' 대비 '+(dm.r3m-dm.bench3).toFixed(1)+'%p 초과). 기관·스마트머니가 집중 매수하는 리더 종목.',
        action: '✅ 시장 리더! 추세 추종 매수 최적' }
    : dm.rsScore >= 60
    ? { signal: '상대강도 양호', color: '#3fb950', icon: '🔵',
        desc: 'RS '+dm.rsScore+'/100으로 시장 평균 이상. 3M '+(dm.r3m>0?'+':'')+dm.r3m+'%, 6M '+(dm.r6m>0?'+':'')+dm.r6m+'%로 시장 대비 초과수익 달성 중. 섹터 내 '+dm.secRank+'위.',
        action: '🔵 상승 모멘텀 확인. SEPA/VCP와 교차 확인 시 매수 유효' }
    : dm.rsScore >= 40
    ? { signal: '상대강도 보통', color: '#d29922', icon: '🟡',
        desc: 'RS '+dm.rsScore+'/100으로 시장 평균 수준. 뚜렷한 초과수익 없이 시장과 비슷한 움직임. 개별 모멘텀 부족.',
        action: '🟡 모멘텀 부족. 강한 카탈리스트 없이는 매수 메리트 낮음' }
    : { signal: '상대강도 약세', color: '#f85149', icon: '🔴',
        desc: 'RS '+dm.rsScore+'/100으로 시장 하위권. '+bench+' 대비 언더퍼폼이며, 자금이 빠져나가는 종목일 가능성. 섹터 순위도 '+dm.secRank+'/40으로 하위.',
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
              const tierLabel={'🔥최강':'최강','🟢매수':'매수','🔵관심':'관심','🟡관망':'관망','⛔위험':'위험'}[verdict.verdict]||verdict.verdict;
              const conflictMsg=stock._execTag==='AVOID'?('진입금지 — '+(verdict.details.gateLabel||'Risk/Gate 조건 미충족')):stock._execTag==='WATCH'&&verdict.totalPt>=65?('매수조건 미충족 — VCP/피봇 대기'):stock._execTag==='BUY NOW'&&verdict.totalPt<65?('즉시매수 — 기술적 조건 충족'):null;
              return <><div style={{padding:'3px 10px',borderRadius:'6px',background:tagStyle.bg,border:"1px solid "+(tagStyle.border)+"",fontSize:'10px',fontWeight:800,color:tagStyle.color,whiteSpace:'nowrap'}}>{tagStyle.label}</div>
              {conflictMsg&&<div style={{fontSize:'8px',color:'#8b949e',textAlign:'center',marginTop:2,maxWidth:90,lineHeight:1.3}}>{conflictMsg}</div>}</>;
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
                      3M:{dm.absM3?'✅':'❌'} 6M:{dm.absM6?'✅':'❌'} 12M:{dm.absM12?'✅':'❌'}
                    </span>
                  </div>
                </div>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>상대모멘텀</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:dm.relScore>=2?'#3fb950':dm.relScore>=1?'#d29922':'#f85149'}}>
                      3M:{dm.relM3?'✅':'❌'} 6M:{dm.relM6?'✅':'❌'} 12M:{dm.relM12?'✅':'❌'}
                    </span>
                  </div>
                </div>
                <div style={{padding:'6px 10px',background:'#0d0d1a',borderRadius:'6px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'11px',color:'#888'}}>가속도</span>
                    <span style={{fontSize:'12px',fontWeight:700,color:dm.strongAccel?'#ff1744':dm.accelerating?'#ffd43b':'#888'}}>
                      {dm.strongAccel?'🔥강가속':dm.accelerating?'⚡가속중':'—'}
                      <span style={{fontSize:'10px',fontWeight:400,color:'#666',marginLeft:4}}>(+{dm.accelBonus}pt)</span>
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
                  <div style={{fontSize:'10px',color:'#666',marginTop:'2px'}}>RS: {dm.rsScore}/100 | 섹터 {dm.secRank}위 (+{dm.secBonus}pt)</div>
                  {dm.benchFallback&&<div style={{fontSize:'9px',color:'#d29922',marginTop:'2px'}}>⚠️ 벤치마크 기본값 사용 중 (시장 데이터 미로드)</div>}
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
                <div style={{fontSize:'9px',color:'#484f58'}}>{stock.k?'KOSPI/Q':'SPY'}: {b3>0?'+':''}{b3}%</div>
              </div>
              <div style={{textAlign:'center',padding:'8px',background:'#0d0d1a',borderRadius:'6px'}}>
                <div style={{fontSize:'10px',color:'#666'}}>6M 수익률</div>
                <div style={{fontSize:'16px',fontWeight:800,color:dm.r6m>0?'#3fb950':'#f85149',fontFamily:"'JetBrains Mono'"}}>{dm.r6m>0?'+':''}{dm.r6m}%</div>
                <div style={{fontSize:'9px',color:'#484f58'}}>{stock.k?'KOSPI/Q':'SPY'}: {b6>0?'+':''}{b6}%</div>
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
            const macdLabel=macd.signal==='golden'?'골든크로스':macd.signal==='bullish'?('상승 '+macd.crossDays+'일차'):macd.signal==='recovering'?'하락 압력 둔화':macd.signal==='dead'?'데드크로스':macd.signal==='bearish'?('하락 '+macd.crossDays+'일차'):'중립';
            const macdDesc=macd.signal==='golden'?'단기 흐름이 장기 흐름을 상향 돌파했습니다. 추세 전환 가능성이 높아지는 구간이지만, 거래량과 함께 확인하는 것이 좋습니다.'
              :macd.signal==='bullish'?('골든크로스 이후 '+macd.crossDays+'일째 상승 흐름이 유지되고 있습니다. 추세가 이어지는지 확인하며 보유·관리하세요.')
              :macd.signal==='recovering'?'하락의 힘이 점차 약해지고 있습니다. 완전한 상승 전환 신호는 아니지만, 골든크로스 가능성을 염두에 두고 추가 확인이 필요합니다.'
              :macd.signal==='dead'?'단기 흐름이 장기 흐름 아래로 내려갔습니다. 하락 전환 압력이 높아지는 구간이므로 보유 중이라면 리스크 관리를 점검하세요.'
              :macd.signal==='bearish'?('데드크로스 이후 '+macd.crossDays+'일째 하락 흐름입니다. 바닥 확인 전까지는 신중한 접근을 권장합니다.')
              :'방향이 불확실한 중립 구간입니다. 골든크로스나 데드크로스가 나타날 때까지 다른 지표를 참고하세요.';
            const obvIcon=obv.signal==='accumulation'?'🟢':obv.signal==='confirm'?'🟢':obv.signal==='recovering'?'🟡':obv.signal==='distribution'?'🔴':obv.signal==='confirm_down'?'🔴':'⚪';
            const obvLabel=obv.signal==='accumulation'?'수급 개선 조짐':obv.signal==='confirm'?'상승 수반':obv.signal==='recovering'?'수급 회복 초기':obv.signal==='distribution'?'수급 이탈 조짐':obv.signal==='confirm_down'?'하락 수반':'중립';
            const obvDesc=obv.signal==='accumulation'?'주가는 큰 변화 없이 횡보하는 중이지만, 거래량 기반 수급 흐름(OBV)이 꾸준히 올라오고 있습니다. 수급 개선 조짐이지만, 추가 확인이 필요합니다.'
              :obv.signal==='confirm'?'주가 상승과 함께 수급 흐름(OBV)도 동반 상승 중입니다. 상승 추세를 수급이 받쳐주는 건강한 흐름이지만, 지속 여부는 주시가 필요합니다.'
              :obv.signal==='recovering'?'전체적으로는 아직 하락 흐름이지만, 최근 5일 수급이 회복 조짐을 보이고 있습니다. 추세 전환인지 단기 반등인지는 추가 확인이 필요합니다.'
              :obv.signal==='distribution'?'주가는 버티고 있지만, 수급 흐름(OBV)이 서서히 내려가고 있습니다. 매도 압력이 누적되는 흐름이므로 주의가 필요합니다.'
              :obv.signal==='confirm_down'?'주가 하락과 수급 흐름(OBV)이 동반 하락 중입니다. 자금이 빠져나가면서 하락을 뒷받침하는 구조입니다.'
              :'수급 흐름에 특별한 방향성이 없는 중립 상태입니다. 다른 지표를 함께 확인하세요.';
            const greenCount=[bb.signal==='squeeze'||bb.signal==='narrow',['golden','bullish','recovering'].includes(macd.signal),['accumulation','confirm','recovering'].includes(obv.signal)].filter(Boolean).length;
            const redCount=[bb.signal==='wide',['dead','bearish'].includes(macd.signal),['distribution','confirm_down'].includes(obv.signal)].filter(Boolean).length;
            const confidenceLabel=greenCount>=3?'보조 확인 3/3 우호적':greenCount>=2?'보조 확인 2/3 우호적':greenCount>=1?'일부 우호적':redCount>=2?'보조 신호 2개 이상 악화':'방향 불확실';
            const confidenceColor=greenCount>=3?'#3fb950':greenCount>=2?'#58a6ff':greenCount>=1?'#ffd600':redCount>=2?'#f85149':'#484f58';
            const rows=[
              {name:'볼린저',icon:bbIcon,label:bbLabel,desc:bbDesc,color:bb.signal==='squeeze'?'#3fb950':bb.signal==='narrow'?'#ffd600':'#484f58'},
              {name:'MACD',icon:macdIcon,label:macdLabel,desc:macdDesc,color:['golden','bullish'].includes(macd.signal)?'#3fb950':macd.signal==='recovering'?'#ffd600':['dead','bearish'].includes(macd.signal)?'#f85149':'#484f58'},
              {name:'OBV',icon:obvIcon,label:obvLabel,desc:obvDesc,color:['accumulation','confirm'].includes(obv.signal)?'#3fb950':obv.signal==='recovering'?'#ffd600':['distribution','confirm_down'].includes(obv.signal)?'#f85149':'#484f58'},
            ];
            return <div style={{background:'#080818',borderRadius:'10px',padding:'14px',marginBottom:'12px',border:'1px solid #1a1a2e'}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                <div style={{fontSize:'12px',fontWeight:700,color:'#e599f7'}}>◈ 보조 지표 <span style={{fontSize:'9px',fontWeight:400,color:'#8b949e'}}>— 본체 엔진 확인층 (변동성·방향·수급)</span></div>
                <div style={{fontSize:'10px',fontWeight:700,color:confidenceColor,padding:'2px 8px',borderRadius:4,background:confidenceColor+'15'}}>{greenCount>=3?'🟢🟢🟢':greenCount>=2?'🟢🟢⚪':greenCount>=1?'🟢⚪⚪':'⚪⚪⚪'} {confidenceLabel}</div>
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
              const {sepaPt,dmPt,vcpPt,mfPt,cfPt,volPt,crossPt,gatePenalty,riskPenalty}=verdict.details;
              const isETF = stock.s === 'ETF';
              const bars=[
                {name:'추세',sub:'SEPA',pt:sepaPt,max:30,color:'#58a6ff',
                  tag:sepaPt>=30?'최상':sepaPt>=22?'강함':sepaPt>=15?'보통':sepaPt>=9?'주의':'위험',
                  tagC:sepaPt>=22?'#3fb950':sepaPt>=15?'#58a6ff':sepaPt>=9?'#ffd600':'#f85149',
                  desc:sepaPt>=30?'장기·중기 이동평균 정배열':sepaPt>=22?'거의 완벽한 상승추세':sepaPt>=15?'전환 시도중':sepaPt>=9?'아직 약함':'하락중'},
                {name:'모멘텀',sub:'DM',pt:dmPt,max:23,color:'#bc8cff',
                  tag:dmPt>=23?'최상':dmPt>=19?'강함':dmPt>=14?'보통':dmPt>=8?'주의':'위험',
                  tagC:dmPt>=14?'#3fb950':dmPt>=8?'#ffd600':'#f85149',
                  desc:dmPt>=23?'시장 대비 상대수익 최상':dmPt>=19?'시장보다 강한 흐름':dmPt>=14?'시장 평균 수준':dmPt>=8?'다소 약함':'시장보다 약함'},
                {name:'타이밍',sub:'VCP',pt:vcpPt,max:15,color:'#ffd43b',
                  tag:vcpPt>=15?'최상':vcpPt>=11?'강함':vcpPt>=10?'강함':vcpPt>=7?'보통':vcpPt>=3?'대기':'대기',
                  tagC:vcpPt>=10?'#3fb950':vcpPt>=3?'#ffd600':'#f85149',
                  desc:vcpPt>=15?'수축 완료 — 진입 준비':vcpPt>=11?'패턴 거의 완성':vcpPt>=10?'수축 후 돌파 성공':vcpPt>=7?'피봇 돌파':vcpPt>=3?'패턴 형성 중':'패턴 없음'},
                {name:isETF?'자금유입':'실적',sub:isETF?'VOL→MF':'MF',pt:mfPt,max:10,color:'#4dabf7',
                  tag:isETF?(mfPt>=8?'최상':mfPt>=6?'강함':mfPt>=4?'보통':'주의'):(mfPt>=8?'강함':mfPt>=6?'보통':mfPt>=4?'주의':'위험'),
                  tagC:mfPt>=6?'#3fb950':mfPt>=4?'#ffd600':'#f85149',
                  desc:isETF?(mfPt>=8?'기관자금 대량유입':mfPt>=6?'거래량 증가중':mfPt>=4?'특이사항 없음':'자금 빠져나감'):(mfPt>=8?'매출·이익 성장 양호':mfPt>=6?'대체로 무난':mfPt>=4?'평균 수준':'실적 부족')},
                {name:isETF?'안정성':'현금',sub:isETF?'STAB':'CF',pt:cfPt,max:5,color:'#ff922b',
                  tag:isETF?(cfPt>=4?'강함':cfPt>=3?'보통':'주의'):(cfPt>=5?'강함':cfPt>=3?'보통':cfPt>=2?'주의':'위험'),
                  tagC:cfPt>=3?'#3fb950':cfPt>=2?'#ffd600':'#f85149',
                  desc:isETF?(cfPt>=4?'안정적 상승추세':cfPt>=3?'보합 안정':cfPt>=2?'소폭 하락':'급락 불안정'):(cfPt>=5?'현금흐름 강함':cfPt>=3?'대체로 양호':cfPt>=2?'일부 약함':'현금 부족')},
                {name:'거래량',sub:'VOL',pt:volPt,max:12,color:'#ffa94d',
                  tag:volPt>=10?'최상':volPt>=7?'강함':volPt>=4?'보통':volPt>=0?'주의':'위험',
                  tagC:volPt>=9?'#3fb950':volPt>=4?'#ffd600':volPt>=0?'#ff922b':'#f85149',
                  desc:volPt>=10?'큰손 매집 감지':volPt>=7?'거래량 우호적':volPt>=4?'특이사항 없음':volPt>=0?'변곡점 주의':'고점 매도압력'},
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
                  <span style={{fontSize:'9px',color:'#8b949e'}}>{(()=>{
                    if(crossPt<=0)return '엔진간 불일치 — 신뢰도 낮음';
                    const goodEngines=[];
                    if(sepaPt>=22)goodEngines.push('추세');
                    if(dmPt>=14)goodEngines.push('모멘텀');
                    if(volPt>=7)goodEngines.push('거래량');
                    if(vcpPt>=10)goodEngines.push('타이밍');
                    if(vcpPt<=3&&sepaPt>=22&&dmPt>=14)return '종목 자체는 강하지만, 타이밍 엔진은 아직 보수적입니다';
                    if(goodEngines.length>=3)return goodEngines.join('·')+' 방향 일치 — 신뢰도 높음';
                    if(goodEngines.length>=2)return goodEngines.join('·')+' 동시 우호적';
                    return '복수 엔진 동시 우호적';
                  })()}</span>
                </div>}
                {gatePenalty>0&&<div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',padding:'4px 8px',background:'#f8514910',borderRadius:'6px',border:'1px solid #f8514930'}}>
                  <span style={{fontSize:'10px',color:'#8b949e'}}>Gate 페널티</span>
                  <span style={{fontSize:'11px',fontWeight:700,color:'#f85149'}}>-{gatePenalty}점</span>
                  <span style={{fontSize:'9px',color:'#f85149'}}>{verdict.details.gateLabel}</span>
                </div>}
                {riskPenalty>0&&<div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',padding:'4px 8px',background:'#ff922b10',borderRadius:'6px',border:'1px solid #ff922b30'}}>
                  <span style={{fontSize:'10px',color:'#8b949e'}}>Risk 페널티</span>
                  <span style={{fontSize:'11px',fontWeight:700,color:'#ff922b'}}>-{riskPenalty}점</span>
                  <span style={{fontSize:'9px',color:'#ff922b'}}>{stock._riskReasons?.join(' / ')||'위험요소 감점'}</span>
                </div>}
                {(()=>{const isETF=stock.s==='ETF';const mfF=!isETF&&verdict.details.mfGrade==='F'&&verdict.totalPt===64;const cfW=!isETF&&verdict.details.cfPt<=1&&verdict.totalPt===69;if(mfF)return<div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',padding:'4px 8px',background:'#ff922b10',borderRadius:'6px',border:'1px solid #ff922b30'}}><span style={{fontSize:'10px',color:'#8b949e'}}>MF Clamp</span><span style={{fontSize:'11px',fontWeight:700,color:'#ff922b'}}>64점 상한</span><span style={{fontSize:'9px',color:'#ff922b'}}>MF F등급 — 점수 제한 적용</span></div>;if(cfW)return<div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px',padding:'4px 8px',background:'#ff922b10',borderRadius:'6px',border:'1px solid #ff922b30'}}><span style={{fontSize:'10px',color:'#8b949e'}}>CF Clamp</span><span style={{fontSize:'11px',fontWeight:700,color:'#ff922b'}}>69점 상한</span><span style={{fontSize:'9px',color:'#ff922b'}}>CF 전체 약세 — 점수 제한 적용</span></div>;return null;})()}
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

/* ===== 가이드 탭 헬퍼 컴포넌트 (IIFE 밖에 정의) ===== */
function GuideSection({icon,title,color,children}){
  return <div style={{background:"#0d1117",border:"1px solid "+color+"33",borderRadius:10,padding:16,marginBottom:12}}>
    <div style={{fontSize:14,fontWeight:800,color,marginBottom:10}}>{icon} {title}</div>
    {children}
  </div>;
}
function GuideRow({label,val,valColor,sub}){
  return <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",padding:"5px 0",borderBottom:"1px solid #21262d22"}}>
    <div>
      <span style={{fontSize:12,color:"#8b949e"}}>{label}</span>
      {sub&&<div style={{fontSize:10,color:"#484f58",marginTop:1}}>{sub}</div>}
    </div>
    <span style={{fontSize:12,fontWeight:700,color:valColor||"#e6edf3",textAlign:"right",maxWidth:"55%"}}>{val}</span>
  </div>;
}
function GuideBadge({txt,color}){
  return <span style={{display:"inline-block",padding:"2px 8px",borderRadius:4,border:"1px solid "+color+"55",background:color+"15",color,fontSize:11,fontWeight:700,marginRight:4,marginBottom:4}}>{txt}</span>;
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
  /* 자산관리 */
  const ADEF={cashKRW:0,cashUSD:0,fundKRW:0,fundUSD:0,otherKRW:0,otherUSD:0,fxRate:1380,memo:''};
  const[calcData,setCalcData]=useState(()=>{
    try{const s=localStorage.getItem('asset_data');return s?{...ADEF,...JSON.parse(s)}:ADEF;}catch(e){return ADEF;}
  });
  const[assetDraft,setAssetDraft]=useState(()=>{
    try{const s=localStorage.getItem('asset_data');return s?{...ADEF,...JSON.parse(s)}:ADEF;}catch(e){return ADEF;}
  });
  const commitAsset=useCallback((key,val)=>{
    const num=(key==='memo')?val:(Number(val)||0);
    setCalcData(p=>{const n={...p,[key]:num};try{localStorage.setItem('asset_data',JSON.stringify(n));}catch(e){}return n;});
    setAssetDraft(p=>({...p,[key]:(key==='memo')?val:(Number(val)||0)}));
  },[]);
  /* 거래 로그 */
  const[tradeLog,setTradeLog]=useState(()=>{
    try{const s=localStorage.getItem('trade_log');return s?JSON.parse(s):[];}catch(e){return[];}
  });
  const addTradeLog=useCallback((entry)=>{
    setTradeLog(p=>{const n=[entry,...p].slice(0,200);try{localStorage.setItem('trade_log',JSON.stringify(n));}catch(e){}return n;});
  },[]);
  /* 보유종목 검색 */
  const[pfSearch,setPfSearch]=useState('');
  const[pfAddSearch,setPfAddSearch]=useState('');
  /* 듀얼모멘텀 필터 */
  const[dmFilter,setDmFilter]=useState("all");
  /* 상세 필터 접기/펼치기 */
  const[filterOpen,setFilterOpen]=useState(false);
  /* 추천 카드 더보기 */
  const[cardLimit,setCardLimit]=useState({buyNow:5,soonBreak:5,silent:5,tripleGreen:5});
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
  /* 섹터 추세 데이터 */
  const[TREND,setTREND]=useState(()=>{
    try{const c=localStorage.getItem('sector_trend');return c?JSON.parse(c):{loaded:false};}catch(e){return{loaded:false};}
  });
  const[trendRt,setTrendRt]=useState("idle");
  const[trendTime,setTrendTime]=useState(()=>{
    try{return localStorage.getItem('sector_trend_time')||'-';}catch(e){return'-';}
  });
  const[trendMarket,setTrendMarket]=useState("kr");

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
  const[isV1Cache,setIsV1Cache]=useState(false); // v1.5: 구버전 캐시 감지
  const autoRef=useRef(null);
  const busy=useRef(false);
  const anaBusy=useRef(false);

  /* localStorage에서 마지막 분석 결과 로드 */
  useEffect(()=>{
    try{
      const cached=localStorage.getItem('ana_data');
      if(cached){
        const parsed=JSON.parse(cached);
        // v1.5: 구버전 캐시 감지 (gate 필드 없으면 v1 캐시)
        const sampleKeys=Object.keys(parsed).slice(0,3);
        const isOldCache=sampleKeys.length>0 && !parsed[sampleKeys[0]]?.gate;
        if(isOldCache) setIsV1Cache(true);
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

  /* ── 보유 전용 상태 판정 ──
     신규매수 기준(스캔 판정)과 분리된 "지금 보유 중인 종목을 어떻게 할 것인가" 판단 */
  const getHoldStatus=useCallback((sl,pct,vd,s)=>{
    const sepa=vd?.details?.sepaPt||0;
    const vol=s?._volData;
    const ind=s?._indicators;
    // 부정 신호 카운트
    let bearCount=0;
    if(vol&&vol.signalType==='sell')bearCount++;
    if(ind&&['dead','bearish'].includes(ind.macd.signal))bearCount++;
    if(ind&&['distribution','confirm_down'].includes(ind.obv.signal))bearCount++;
    if(sepa<=4)bearCount++;
    // 정리 검토: 이탈 OR (경계+부정신호 2개+)
    if(sl.status==='이탈❗'||(sl.pctFromStop<=5&&bearCount>=2)){
      return{label:'정리검토',color:'#f85149',bg:'#f8514918',desc:'활성손절 이탈 또는 구조 훼손 — 매도 검토'};
    }
    // 경계: 손절 7% 이내 OR SEPA 약화 OR 부정신호 2개+
    if(sl.status==='임박⚠️'||sl.pctFromStop<=7||bearCount>=2){
      return{label:'경계',color:'#ffd43b',bg:'#ffd43b0a',desc:'손절 근접 또는 추세 약화 — 비중 축소 검토'};
    }
    // 부분익절 구간: 수익 20%+ OR (15%+이면서 과열)
    const isOverheat=ind&&['distribution'].includes(ind.obv.signal);
    if(pct>=20||(pct>=15&&isOverheat)){
      return{label:'익절구간',color:'#bc8cff',bg:'#bc8cff0a',desc:'목표 도달 — 1차 부분익절 검토'};
    }
    // 보유유지
    return{label:'보유유지',color:'#3fb950',bg:'transparent',desc:'추세 양호, 손절 여유 — 보유 유지'};
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

  const doExport=useCallback(async()=>{
    /* gzip 압축 후 base64 — 기존 대비 60~80% 짧아짐 */
    const ghMin={};
    Object.entries(gradeHistory||{}).forEach(([t,arr])=>{
      if(arr&&arr.length) ghMin[t]=arr.slice(-3).map(x=>({d:x.date,f:{g:x.from?.grade,p:x.from?.pt},o:{g:x.to?.grade,p:x.to?.pt},pr:x.price}));
    });
    const pMin=(portfolio||[]).map(x=>({t:x.ticker,b:x.buyPrice,q:x.qty,h:x.highPrice||0}));
    const tlMin=(tradeLog||[]).slice(0,30).map(x=>({t:x.ticker,b:x.buyPrice,s:x.sellPrice,q:x.qty,d:x.date,r:x.reason}));
    const json=JSON.stringify({w:watchlist,p:pMin,gh:ghMin,a:calcData,tl:tlMin,v:2});
    let code;
    try{
      const bytes=new TextEncoder().encode(json);
      const cs=new CompressionStream('gzip');
      const writer=cs.writable.getWriter();
      writer.write(bytes);writer.close();
      const buf=await new Response(cs.readable).arrayBuffer();
      code='gz'+btoa(String.fromCharCode(...new Uint8Array(buf)));
    }catch{
      code=btoa(unescape(encodeURIComponent(json)));
    }
    navigator.clipboard.writeText(code).then(()=>setSyncMsg('✅ 코드 복사 완료! 다른 기기에서 가져오기 하세요.')).catch(()=>{
      setSyncInput(code);setSyncMsg('📋 아래 코드를 복사하세요:');
    });
    setTimeout(()=>setSyncMsg(''),4000);
  },[watchlist,portfolio,gradeHistory,calcData,tradeLog]);

  const doImport=useCallback(async()=>{
    try{
      const raw=syncInput.trim();
      let json;
      if(raw.startsWith('gz')){
        const bytes=Uint8Array.from(atob(raw.slice(2)),c=>c.charCodeAt(0));
        const ds=new DecompressionStream('gzip');
        const writer=ds.writable.getWriter();
        writer.write(bytes);writer.close();
        const buf=await new Response(ds.readable).arrayBuffer();
        json=JSON.parse(new TextDecoder().decode(buf));
      }else{
        json=JSON.parse(decodeURIComponent(escape(atob(raw))));
      }
      if(json.w)setWatchlist(json.w);
      if(json.p){
        const pR=json.v===2?json.p.map(x=>({ticker:x.t,buyPrice:x.b,qty:x.q,highPrice:x.h||0,stopLoss:0})):json.p;
        setPortfolio(pR);try{localStorage.setItem('dual_portfolio',JSON.stringify(pR));}catch(e){}
      }
      if(json.gh){
        let ghR=json.gh;
        const s0=Object.values(json.gh||{})[0];
        if(json.v===2&&s0&&s0[0]&&s0[0].d){
          ghR={};Object.entries(json.gh).forEach(([t,arr])=>{
            ghR[t]=arr.map(x=>({date:x.d,from:{grade:x.f?.g,pt:x.f?.p},to:{grade:x.o?.g,pt:x.o?.p},price:x.pr}));
          });
        }
        setGradeHistory(ghR);try{localStorage.setItem('grade_history',JSON.stringify(ghR));}catch(e){}
      }
      if(json.a){setCalcData({...ADEF,...json.a});setAssetDraft({...ADEF,...json.a});try{localStorage.setItem('asset_data',JSON.stringify(json.a));}catch(e){}}
      if(json.tl){
        const tlR=json.v===2?json.tl.map(x=>({ticker:x.t,buyPrice:x.b,sellPrice:x.s,qty:x.q,date:x.d,reason:x.r})):json.tl;
        setTradeLog(tlR);try{localStorage.setItem('trade_log',JSON.stringify(tlR));}catch(e){}
      }
      if(json.an){
        try{localStorage.setItem('ana_data',JSON.stringify(json.an));}catch(e){}
        setStocks(prev=>prev.map(d=>{
          const a=json.an[d.t];if(!a)return d;
          return{...d,e:a.e||d.e,r:[a.r?a.r[0]:d.r[0],a.r?a.r[1]:d.r[1],d.r[2]],v:a.v||d.v,
            _volData:a.volData||null,_indicators:a.indicators||null,
            _gate:a.gate||null,_riskPenalty:a.riskPenalty||0,
            _riskReasons:a.riskReasons||[],_execTag:a.execTag||null};
        }));
      }
      setSyncMsg('✅ 가져오기 완료! 워치'+(json.w||[]).length+'개 + 보유'+(json.p||[]).length+'개'+(json.an?' (분석결과 포함)':''));
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
    /* ── 지수 가격 경량 갱신 ── */
    try{
      const idxRes=await fetch("/api/indices");
      if(idxRes.ok){
        const idxData=await idxRes.json();
        const d2=idxData.data||{};
        if(d2.dji||d2.gspc||d2.ixic){
          setMKT(prev=>({...prev,
            usIndices:{
              dji:{price:d2.dji?.price||prev.usIndices?.dji?.price,chg:d2.dji?.chg??prev.usIndices?.dji?.chg??0},
              gspc:{price:d2.gspc?.price||prev.usIndices?.gspc?.price,chg:d2.gspc?.chg??prev.usIndices?.gspc?.chg??0},
              ixic:{price:d2.ixic?.price||prev.usIndices?.ixic?.price,chg:d2.ixic?.chg??prev.usIndices?.ixic?.chg??0},
            }
          }));
        }
      }
    }catch(e){}
    /* ── KOSPI/KOSDAQ 경량 갱신 (Naver) ── */
    try{
      const fetchKospiIdx=async(sym)=>{
        const ts=Date.now();
        const r=await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${sym}&timeframe=day&count=3&requestType=0&_=${ts}`,
          {headers:{"User-Agent":"Mozilla/5.0","Referer":"https://finance.naver.com/"}});
        if(!r.ok)return null;
        const xml=await r.text();
        const items=xml.match(/data="([^"]+)"/g)||[];
        const closes=items.map(m=>parseFloat(m.split("|")[4])).filter(v=>!isNaN(v));
        if(closes.length<2)return null;
        const cur=closes[closes.length-1];const prev2=closes[closes.length-2];
        return{price:+cur.toFixed(2),chg:prev2?+((cur-prev2)/prev2*100).toFixed(2):0};
      };
      const [kpi,kqi]=await Promise.all([fetchKospiIdx("KOSPI"),fetchKospiIdx("KOSDAQ")]);
      setMKT(prev=>({...prev,
        kospiPrice:kpi?.price||prev.kospiPrice,
        kosdaqPrice:kqi?.price||prev.kosdaqPrice,
        kosdaqChg:kqi?.chg??prev.kosdaqChg,
      }));
    }catch(e){}
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
        kospiAbove50:d.kospi?.above50,
        kospiSma50:d.kospi?.sma50,
        kospiSma200:d.kospi?.sma200,
        kospi3m:d.kospi?.r3m||0,
        kospi6m:d.kospi?.r6m||0,
        kospiPrice:d.kospi?.price,
        krHealth:d.krHealth||MKT_DEFAULT.krHealth,
        maxPositionPct:d.maxPositionPct??100,
        krMaxPositionPct:d.krMaxPositionPct??100,
        vix:d.vix?.value||0,
        vixLevel:d.vix?.level||"-",
        nh:"-",ad:"-",
        sec:(d.sectors||[]).map(s=>[s.sym,s.r3m,s.r1m||0]),
        krSectors:(d.krSectors||[]),
        health:d.health||MKT_DEFAULT.health,
        usIndices:d.usIndices||null,
        kosdaqPrice:d.kosdaq?.price||null,
        kosdaqChg:d.kosdaq?.chg||0,
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

  /* 체크리스트 — tier: hard(필수통과) / soft(우호조건) / exec(실행규칙) */
  const checklistItems=useMemo(()=>[
    /* ── A. 필수 통과 (Hard Stop) ── */
    {id:'c1',tier:'hard',engine:'MF',label:'MF 종합점수 70점 이상?',
      auto:true,check:(s)=>(s.f||0)>=70,
      failReason:(s)=>'현재 '+(s.f||0)+'점 — 펀더멘털 기준 미달 (70점 미만)'},
    {id:'c2',tier:'hard',engine:'SEPA',label:'SEPA 템플릿 7/8 이상?',
      auto:true,check:(s)=>seTt(s)>=7,
      failReason:(s)=>'현재 '+seTt(s)+'/8 — MA정렬·가격위치 조건 미충족'},
    {id:'c3',tier:'hard',engine:'DM',label:'듀얼모멘텀 BUY 이상?',
      auto:true,check:(s)=>{const dm=getDualMomentum(s);return dm.signalScore>=8;},
      failReason:(s)=>{const dm=getDualMomentum(s);const r=[];if((dm.r3m||0)<=0)r.push('3M 절대모멘텀 음수');if((dm.r6m||0)<=0)r.push('6M 절대모멘텀 음수');if(dm.signal==='SELL'||dm.signal==='WEAK')r.push('상대강도 시장 하회');return r.length?r.join(' / '):'신호 부족 (현재: '+dm.signal+')';}},
    {id:'c4',tier:'hard',engine:'시장',label:'시장필터 공격모드?',
      auto:true,check:()=>MKT.loaded&&MKT.health?.score>=70,
      failReason:()=>MKT.loaded?('시장 건강도 '+(MKT.health?.score||0)+'점 — Risk Off / Neutral 구간'):'시장필터 미실행 — 🌐 탭에서 갱신 필요'},
    {id:'c5',tier:'hard',engine:'리스크',label:'손절가 설정 완료?',
      auto:false,failReason:()=>'수동 확인 필요 — 포지션 탭에서 손절가 입력'},
    /* ── B. 우호 조건 (Soft Check) ── */
    {id:'c6',tier:'soft',engine:'SEPA',label:'SEPA 판정 "매수준비"?',
      auto:true,check:(s)=>seV(s)==="매수준비",
      failReason:(s)=>'현재: '+seV(s)+' — 스테이지 2 진입 전'},
    {id:'c7',tier:'soft',engine:'VCP',label:'VCP 성숙 단계?',
      auto:true,check:(s)=>vcpMt(s).includes("성숙"),
      failReason:(s)=>'현재: '+vcpMt(s)+' — 변동성 수축 미완성'},
    {id:'c8',tier:'soft',engine:'CF',label:'CF 중기+장기 양호?',
      auto:true,check:(s)=>cfM(s)>=2&&cfL(s)>=2,
      failReason:(s)=>'중기 '+(cfM(s)>=2?'✓':'✗')+' / 장기 '+(cfL(s)>=2?'✓':'✗')+' — 현금흐름 약화 구간'},
    {id:'c9',tier:'soft',engine:'DM',label:'섹터 강도 상위 20위?',
      auto:true,check:(s)=>{const r=s.r?.[2]||99;return r<=20;},
      failReason:(s)=>'섹터 순위 '+(s.r?.[2]||'N/A')+'위 — 상위 20위 미만'},
    /* ── C. 실행 규칙 ── */
    {id:'c10',tier:'exec',engine:'리스크',label:'투자금 5% 이하?',
      auto:false,failReason:()=>'수동 확인 — 계좌 대비 5% 이내 진입'},
    {id:'c11',tier:'exec',engine:'리스크',label:'피봇 기준 진입?',
      auto:false,failReason:()=>'수동 확인 — 피봇 돌파 시점 or 피봇 -3% 이내'},
    {id:'c12',tier:'exec',engine:'리스크',label:'손절 7~8% 이내?',
      auto:false,failReason:()=>'수동 확인 — 진입가 대비 손절 비율 점검'},
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
  const TH=({children,onClick,a,r,c,w,sx,tip})=><th onClick={onClick} title={tip||undefined} style={{padding:"7px 5px",textAlign:r?"right":c?"center":"left",fontWeight:600,color:a?"#58a6ff":"#484f58",fontSize:12,borderBottom:"2px solid #21262d",whiteSpace:"nowrap",cursor:onClick?"pointer":"default",userSelect:"none",background:"#06080d",width:w,position:"sticky",top:0,zIndex:1,...(sx||{})}}>{children}{tip&&<span style={{fontSize:9,opacity:0.5,marginLeft:2}}>ⓘ</span>}</th>;

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
    <div style={{background:"#06080d",color:"#e6edf3",minHeight:"100vh",fontFamily:"'Noto Sans KR',system-ui,sans-serif"}} suppressHydrationWarning>
      {/* Header */}
      <div className="dash-header" style={{background:"linear-gradient(135deg,#0d1117,#161b22,#0d1117)",borderBottom:"1px solid #21262d",padding:"12px 20px"}}>
        <div style={{maxWidth:1800,margin:"0 auto",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
          <h1 className="dash-title" style={{fontSize:22,fontWeight:900,background:"linear-gradient(135deg,#58a6ff,#bc8cff,#f778ba)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",margin:0}}>{isMobile?("명관' 듀얼엔진 ("+D.length+")"):("명관' 듀얼엔진 — MF × SEPA × 듀얼모멘텀 ("+D.length+"종목)")}</h1>
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
        {/* v1.5: 구버전 캐시 감지 배너 */}
        {isV1Cache && anaRt!=="fetching" && <div style={{marginTop:4,padding:"8px 14px",background:"linear-gradient(90deg,#2d1b0020,#3d2b1020)",border:"1px solid #ff922b55",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"space-between",gap:8}}>
          <div style={{fontSize:11,color:"#ff922b"}}>⚡ <b>v1.5 업데이트</b> — Gate·Risk Penalty·ExecTag 신규 엔진이 추가됐습니다. 정확한 점수를 위해 <b>재분석</b>을 권장합니다.</div>
          <button onClick={()=>setIsV1Cache(false)} style={{background:"transparent",border:"none",color:"#484f58",cursor:"pointer",fontSize:13,padding:"0 4px",flexShrink:0}}>✕</button>
        </div>}
      </div>

      {/* US/KR 분리 시장 배너 */}
      {MKT.loaded && (tab==="main"||tab==="filter") && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}>
        <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)",gap:6}}>
          {/* US Risk State + 3대 지수 */}
          <div style={{background:MKT.health?.modeColor+"12",border:"1px solid "+(MKT.health?.modeColor)+"44",borderRadius:8,padding:"8px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
              <span style={{fontSize:18}}>{MKT.health?.modeIcon}</span>
              <div>
                <div style={{fontSize:9,color:"#484f58",fontWeight:700}}>🇺🇸 미국 시장</div>
                <div style={{fontSize:12,fontWeight:800,color:MKT.health?.modeColor}}>{MKT.health?.mode} 모드 · 허용 {MKT.maxPositionPct}%</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:4}}>
              {[
                {label:"다우",val:MKT.usIndices?.dji?.price,chg:MKT.usIndices?.dji?.chg},
                {label:"S&P500",val:MKT.usIndices?.gspc?.price,chg:MKT.usIndices?.gspc?.chg},
                {label:"나스닥",val:MKT.usIndices?.ixic?.price,chg:MKT.usIndices?.ixic?.chg},
              ].map(idx=>(
                <div key={idx.label} style={{background:"#0d111788",borderRadius:5,padding:"3px 5px"}}>
                  <div style={{fontSize:8,color:"#484f58",fontWeight:700}}>{idx.label}</div>
                  <div style={{fontSize:10,fontWeight:800,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{idx.val?idx.val.toLocaleString():"-"}</div>
                  <div style={{fontSize:8,color:idx.chg>0?"#3fb950":idx.chg<0?"#f85149":"#8b949e"}}>{idx.chg!=null?(idx.chg>0?"+":"")+idx.chg+"%":"-"}</div>
                </div>
              ))}
            </div>
          </div>
          {/* SPY + VIX */}
          <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:9,color:"#484f58",fontWeight:700,marginBottom:4}}>🇺🇸 SPY · VIX</div>
            <div style={{display:"flex",gap:10,alignItems:"flex-end"}}>
              <div>
                <div style={{fontSize:9,color:"#484f58"}}>SPY</div>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>${MKT.spyPrice||"-"}</div>
                <div style={{fontSize:8,color:MKT.spy200==="위"?"#3fb950":"#f85149"}}>200MA {MKT.spy200} · 12M {MKT.spy12m>0?"+":""}{MKT.spy12m}%</div>
              </div>
              <div style={{borderLeft:"1px solid #21262d",paddingLeft:10}}>
                <div style={{fontSize:9,color:"#484f58"}}>VIX</div>
                <div style={{fontSize:13,fontWeight:800,color:MKT.vix<20?"#3fb950":MKT.vix<25?"#ffd600":MKT.vix<30?"#ff922b":"#f85149",fontFamily:"'JetBrains Mono'"}}>{MKT.vix||"-"}</div>
                <div style={{fontSize:8,color:"#8b949e"}}>{MKT.vixLevel}</div>
              </div>
            </div>
          </div>
          {/* KR Risk State + KOSPI/KOSDAQ */}
          <div style={{background:(MKT.krHealth?.modeColor||"#484f58")+"12",border:"1px solid "+((MKT.krHealth?.modeColor)||"#484f58")+"44",borderRadius:8,padding:"8px 12px"}}>
            <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
              <span style={{fontSize:18}}>{MKT.krHealth?.modeIcon||"⏳"}</span>
              <div>
                <div style={{fontSize:9,color:"#484f58",fontWeight:700}}>🇰🇷 한국 시장</div>
                <div style={{fontSize:12,fontWeight:800,color:MKT.krHealth?.modeColor||"#484f58"}}>{MKT.krHealth?.mode||"조회전"} 모드 · 허용 {MKT.krMaxPositionPct||100}%</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
              {[
                {label:"KOSPI",val:MKT.kospiPrice,chg:MKT.kospi12m},
                {label:"KOSDAQ",val:MKT.kosdaqPrice,chg:MKT.kosdaqChg},
              ].map(idx=>(
                <div key={idx.label} style={{background:"#0d111788",borderRadius:5,padding:"3px 6px"}}>
                  <div style={{fontSize:8,color:"#484f58",fontWeight:700}}>{idx.label}</div>
                  <div style={{fontSize:11,fontWeight:800,color:"#e6edf3",fontFamily:"'JetBrains Mono'"}}>{idx.val?idx.val.toLocaleString():"-"}</div>
                  <div style={{fontSize:8,color:idx.chg>0?"#3fb950":idx.chg<0?"#f85149":"#8b949e"}}>{idx.chg!=null?(idx.chg>0?"+":"")+idx.chg+"%":"-"}</div>
                </div>
              ))}
            </div>
          </div>
          {/* 심리/공포 */}
          <div style={{background:"#161b22",border:"1px solid #21262d",borderRadius:8,padding:"8px 12px"}}>
            <div style={{fontSize:9,color:"#484f58",fontWeight:700,marginBottom:4}}>📊 공포지수</div>
            <div style={{fontSize:9,color:"#484f58",marginBottom:2}}>VIX</div>
            <div style={{fontSize:18,fontWeight:900,color:MKT.vix<20?"#3fb950":MKT.vix<25?"#ffd600":MKT.vix<30?"#ff922b":"#f85149",fontFamily:"'JetBrains Mono'"}}>{MKT.vix||"-"}</div>
            <div style={{fontSize:9,color:"#8b949e"}}>{MKT.vixLevel}</div>
          </div>
        </div>
      </div>}

      {showLog && <div style={{maxWidth:1800,margin:"0 auto",padding:"0 20px 4px"}}><div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:6,padding:"6px 10px",maxHeight:100,overflowY:"auto",fontFamily:"'JetBrains Mono'",fontSize:12}}>{logs.map((l,i)=><div key={i} style={{padding:"1px 0"}}><span style={{color:"#484f58",marginRight:4}}>{l.ts}</span><span style={{color:l.c==="ok"?"#3fb950":l.c==="er"?"#f85149":"#58a6ff"}}>{l.msg}</span></div>)}</div></div>}

      {/* Tab Nav */}
      <div className="tab-nav" style={{maxWidth:1800,margin:"6px auto",padding:"0 20px"}}>
        <div style={{display:"flex",gap:4,overflowX:"auto",WebkitOverflowScrolling:"touch",paddingBottom:2,scrollbarWidth:"none"}}>
          {[["main",isMobile?"📊":"📊 메인"],["watch",isMobile?("👁"+watchlist.length):("👁 워치("+watchlist.length+")")],["port",isMobile?"💼":"💼 보유종목"],["filter",isMobile?"🌐":"🌐 시장필터"],["calc",isMobile?"🧮":"🧮 포지션"],["check",isMobile?"✅":"✅ 체크리스트"],["asset",isMobile?"💰":"💰 자산관리"],["guide",isMobile?"📖":"📖 가이드"]].map(([k,l])=>
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
              <span style={{fontSize:10,color:"#484f58"}}>{mktTime!=='-'?"갱신: "+mktTime:''}</span>
              <button onClick={doMarketFilter} disabled={mktRt==="fetching"} style={{padding:"6px 14px",borderRadius:6,border:"1px solid #58a6ff",background:mktRt==="fetching"?"#58a6ff25":"#58a6ff12",color:"#58a6ff",cursor:mktRt==="fetching"?"wait":"pointer",fontSize:12,fontWeight:700}}>
                {mktRt==="fetching"?"⏳ 분석중...":mktRt==="done"?"✅ 완료":"🌐 시장필터 갱신"}
              </button>
            </div>
          </div>

          {!MKT.loaded && <div style={{textAlign:"center",padding:20,color:"#484f58",fontSize:13}}>⏳ 시장필터를 실행하면 실시간 데이터를 가져옵니다.<br/><span style={{fontSize:11}}>SPY · VIX · KOSPI · 섹터 11개 ETF를 분석합니다 (약 15~20초)</span></div>}

          {MKT.loaded && <>
            {/* ── 통합 운용 상태 ── */}
            {(()=>{
              const us=MKT.health?.score||0;
              const kr=MKT.krHealth?.score||0;
              const combined=Math.round(us*0.55+kr*0.45);
              const usMode=MKT.health?.mode||"조회전";
              const krMode=MKT.krHealth?.mode||"조회전";
              const usWt=MKT.health?.score>=70?100:MKT.health?.score>=50?60:MKT.health?.score>=30?30:10;
              const krWt=MKT.krHealth?.score>=70?100:MKT.krHealth?.score>=50?60:MKT.krHealth?.score>=30?30:10;
              const totalWt=Math.round((usWt*0.55+krWt*0.45));
              const cColor=combined>=70?"#3fb950":combined>=50?"#ffd600":combined>=30?"#ff922b":"#f85149";
              const cIcon=combined>=70?"🟢":combined>=50?"🟡":combined>=30?"🟠":"🔴";
              const strategy=combined>=70
                ?"정상 매매 — 강한 섹터 중심 분할 진입 가능"
                :combined>=50?"선별 매매 — 최강/매수 등급만 신규 진입"
                :combined>=30?"방어 운용 — 신규 매수 최소화, 손절 엄수"
                :"위기 대응 — 현금 비중 극대화, 매수 금지";
              const priority=us>=kr?"미국 주도 — 한국은 확인 후 추가"
                :kr>us+15?"한국 상대 강세 — 한국 신규 매수 우선"
                :"균형 — 한국/미국 동시 접근 가능";
              return <div style={{background:cColor+"14",border:"2px solid "+cColor+"55",borderRadius:12,padding:16,marginBottom:14}}>
                <div style={{fontSize:11,color:"#484f58",fontWeight:700,marginBottom:6}}>📋 통합 운용 상태 (미국 55% · 한국 45% 가중)</div>
                <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:10}}>
                  <div style={{fontSize:38,lineHeight:1}}>{cIcon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:900,color:cColor}}>{strategy}</div>
                    <div style={{fontSize:11,color:"#8b949e",marginTop:3}}>{priority}</div>
                  </div>
                  <div style={{textAlign:"center",minWidth:70}}>
                    <div style={{fontSize:30,fontWeight:900,color:cColor,fontFamily:"'JetBrains Mono'"}}>{totalWt}%</div>
                    <div style={{fontSize:9,color:"#484f58"}}>권장 주식 비중</div>
                  </div>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {flag:"🇺🇸",label:"미국",mode:usMode,score:us,wt:usWt,color:MKT.health?.modeColor||"#484f58"},
                    {flag:"🇰🇷",label:"한국",mode:krMode,score:kr,wt:krWt,color:MKT.krHealth?.modeColor||"#484f58"},
                  ].map(m=>(
                    <div key={m.label} style={{background:m.color+"10",border:"1px solid "+m.color+"33",borderRadius:8,padding:"8px 12px",display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:18}}>{m.flag}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:10,color:"#484f58"}}>{m.label} 시장</div>
                        <div style={{fontSize:14,fontWeight:800,color:m.color}}>{m.mode}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:18,fontWeight:900,color:m.color,fontFamily:"'JetBrains Mono'"}}>{m.score}</div>
                        <div style={{fontSize:8,color:"#484f58"}}>허용 {m.wt}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>;
            })()}

            {/* 모드 판정 대형 카드 (US 세부) */}
            <div style={{background:MKT.health?.modeColor+"0d",border:"1px solid "+(MKT.health?.modeColor)+"33",borderRadius:10,padding:14,marginBottom:10,display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:36,lineHeight:1}}>{MKT.health?.modeIcon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"#484f58",fontWeight:700,marginBottom:2}}>🇺🇸 미국 시장 세부 상태</div>
                <div style={{fontSize:20,fontWeight:900,color:MKT.health?.modeColor}}>{MKT.health?.mode} 모드</div>
                <div style={{fontSize:12,color:"#e6edf3",marginTop:2}}>{MKT.health?.modeAction}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:28,fontWeight:900,color:MKT.health?.modeColor,fontFamily:"'JetBrains Mono'"}}>{MKT.health?.score}</div>
                <div style={{fontSize:9,color:"#484f58"}}>/100점</div>
                {MKT.health?.details&&<div style={{fontSize:9,color:"#484f58",marginTop:3}}>
                  추세{(MKT.health.details.spyAbove200?1:0)+(MKT.health.details.spy200Rising?1:0)+(MKT.health.details.spyGoldenCross?1:0)}/3
                  {" · "}VIX{MKT.health.details.vixLow?"✅":"❌"}
                  {" · "}브레드스{MKT.health.details.sectorBreadth}
                </div>}
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
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginTop:6,fontSize:11}}>
                  <div>200MA: <b style={{color:MKT.kospiAbove200?"#3fb950":"#f85149"}}>{MKT.kospiAbove200?"위 ✅":"아래 ❌"}</b></div>
                  <div>50MA: <b style={{color:MKT.kospiAbove50?"#3fb950":"#f85149"}}>{MKT.kospiAbove50?"위 ✅":"아래 ❌"}</b></div>
                  <div>12M: <b style={{color:MKT.kospi12m>0?"#3fb950":"#f85149"}}>{MKT.kospi12m>0?"+":""}{MKT.kospi12m}%</b></div>
                  <div>6M: <b style={{color:MKT.kospi6m>0?"#3fb950":"#f85149"}}>{MKT.kospi6m>0?"+":""}{MKT.kospi6m}%</b></div>
                  <div>3M: <b style={{color:MKT.kospi3m>0?"#3fb950":"#f85149"}}>{MKT.kospi3m>0?"+":""}{MKT.kospi3m}%</b></div>
                </div>
              </div>
            </div>

            {/* KR Risk State 카드 */}
            <div style={{background:MKT.krHealth?.modeColor+"0d",border:"1px solid "+(MKT.krHealth?.modeColor)+"33",borderRadius:10,padding:14,marginBottom:12,display:"flex",alignItems:"center",gap:16}}>
              <div style={{fontSize:36,lineHeight:1}}>{MKT.krHealth?.modeIcon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:"#484f58",fontWeight:700,marginBottom:2}}>🇰🇷 한국 시장 세부 상태</div>
                <div style={{fontSize:20,fontWeight:900,color:MKT.krHealth?.modeColor}}>{MKT.krHealth?.mode} 모드</div>
                <div style={{fontSize:12,color:"#e6edf3",marginTop:2}}>{MKT.krHealth?.modeAction}</div>
              </div>
              <div style={{textAlign:"right"}}>
                <div style={{fontSize:28,fontWeight:900,color:MKT.krHealth?.modeColor,fontFamily:"'JetBrains Mono'"}}>{MKT.krHealth?.score}</div>
                <div style={{fontSize:9,color:"#484f58"}}>/100점</div>
                <div style={{fontSize:9,color:"#484f58",marginTop:2}}>KR 허용비중 <b style={{color:MKT.krHealth?.modeColor}}>{MKT.krMaxPositionPct}%</b></div>
                <div style={{fontSize:9,color:"#484f58",marginTop:2}}>
                  200MA{MKT.kospiAbove200?"✅":"❌"} · 50MA{MKT.kospiAbove50?"✅":"❌"} · 12M{MKT.kospi12m>0?"✅":"❌"}
                </div>
              </div>
            </div>

            {/* 건강도 체크리스트 — 그룹화 */}
            {MKT.health?.details && <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:12}}>
              <div style={{fontSize:12,fontWeight:700,color:"#58a6ff",marginBottom:8}}>🩺 시장 건강도 체크리스트</div>
              {[
                {group:"장기 추세",note:"3가지 중 2개+ 충족 시 추세 점수 인정",items:[
                  ["SPY > 200MA",MKT.health.details.spyAbove200],
                  ["200MA 상승추세",MKT.health.details.spy200Rising],
                  ["골든크로스(50>200)",MKT.health.details.spyGoldenCross],
                ]},
                {group:"모멘텀 · 변동성",note:"개별 독립 점수",items:[
                  ["SPY 12M 양수",MKT.health.details.spy12mPositive],
                  ["VIX < 25",MKT.health.details.vixLow],
                ]},
                {group:"시장 브레드스",note:"섹터 상승 수 기준",items:[
                  ["KOSPI > 200MA",MKT.health.details.kospiAbove200],
                  ["섹터 브레드스 "+MKT.health.details.sectorBreadth+" 상승",!!MKT.health.details.sectorBreadth&&MKT.health.details.sectorBreadth>=6],
                ]},
              ].map(({group,note,items})=>(
                <div key={group} style={{marginBottom:8}}>
                  <div style={{fontSize:10,color:"#484f58",fontWeight:700,marginBottom:4}}>{group} <span style={{fontWeight:400,opacity:0.6}}>{note}</span></div>
                  <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    {items.map(([label,ok])=>(
                      <div key={label} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:6,background:ok?"#3fb95010":"#f8514910",border:"1px solid "+(ok?"#3fb95022":"#f8514922")}}>
                        <span style={{fontSize:11}}>{ok?"✅":"❌"}</span>
                        <span style={{fontSize:11,color:ok?"#3fb950":"#f85149"}}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>}

            {/* ── 섹터 상대모멘텀 (미국 + 한국 병렬) ── */}
            {(()=>{
              const secNm={XLK:"기술",XLC:"커뮤니케이션",XLI:"산업재",XLY:"임의소비",XLV:"헬스케어",XLU:"유틸리티",XLE:"에너지",XLF:"금융",XLB:"소재",XLP:"필수소비",XLRE:"부동산"};

              // pill 렌더러 — {sym, r3m, r1m} 형식 + 이름매핑
              const SecPill=({item,rank,useR1m,nameMap})=>{
                const v=useR1m?(item.r1m||0):(item.r3m||0);
                const nm=nameMap?nameMap[item.sym]:item.sym;
                const top3=rank<3;
                const isPos=v>0;
                const bg=isPos?(top3?"#3fb95018":"#3fb95008"):"#f8514910";
                const bd=isPos?(top3?"#3fb95055":"#3fb95022"):"#f8514933";
                const tc=isPos?(top3?"#3fb950":"#8b949e"):"#f85149";
                return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"4px 10px",borderRadius:8,fontSize:11,background:bg,border:"1px solid "+bd,color:tc,fontWeight:top3?700:400,whiteSpace:"nowrap"}}>
                  {top3?["🥇","🥈","🥉"][rank]+" ":""}
                  {nm}
                  <span style={{fontFamily:"'JetBrains Mono'",fontSize:11}}>{v>0?"+":""}{v}%</span>
                </span>;
              };

              const SectorBlock=({title,flag,data,nameMap,showAllKey})=>{
                if(!data||data.length===0)return <div style={{padding:10,color:"#484f58",fontSize:11}}>데이터 없음 — 시장필터 재갱신 필요</div>;
                const sorted3m=[...data].sort((a,b)=>b.r3m-a.r3m);
                const sorted1m=[...data].sort((a,b)=>(b.r1m||0)-(a.r1m||0));
                return <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:800,color:"#e6edf3",marginBottom:10,display:"flex",alignItems:"center",gap:6}}>
                    <span>{flag}</span><span>{title}</span>
                    <span style={{fontSize:9,color:"#484f58",fontWeight:400,marginLeft:"auto"}}>{data.length}개 섹터</span>
                  </div>
                  {[{label:"3M 수익률",arr:sorted3m,useR1m:false},{label:"1M 수익률",arr:sorted1m,useR1m:true}].map(({label,arr,useR1m})=>(
                    <div key={label} style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#484f58",fontWeight:700,marginBottom:5}}>{label}</div>
                      <div style={{display:"flex",gap:4,flexWrap:"wrap",rowGap:4}}>
                        {arr.slice(0,5).map((item,i)=><SecPill key={item.sym+label} item={item} rank={i} useR1m={useR1m} nameMap={nameMap}/>)}
                        {arr.length>8&&arr.slice(-3).map((item,i)=><SecPill key={item.sym+label+"b"} item={item} rank={arr.length-3+i} useR1m={useR1m} nameMap={nameMap}/>)}
                      </div>
                    </div>
                  ))}
                </div>;
              };

              // 미국 데이터: MKT.sec = [[sym,r3m,r1m], ...]  → {sym,r3m,r1m}
              const usData=(MKT.sec||[]).map(([sym,r3m,r1m])=>({sym,r3m,r1m}));
              // 한국 데이터: MKT.krSectors = [{sym,r3m,r1m}, ...]
              const krData=MKT.krSectors||[];

              return <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:700,color:"#58a6ff",marginBottom:12}}>📊 섹터 상대모멘텀</div>
                <div style={{display:isMobile?"flex":"grid",gridTemplateColumns:"1fr 1fr",flexDirection:"column",gap:isMobile?0:20}}>
                  <div style={isMobile?{marginBottom:16}:{}}>
                    <SectorBlock title="미국 섹터" flag="🇺🇸" data={usData} nameMap={secNm}/>
                  </div>
                  {isMobile&&<div style={{height:1,background:"#21262d",margin:"8px 0"}}/>}
                  <div style={isMobile?{paddingTop:8}:{}}>
                    <SectorBlock title="한국 섹터" flag="🇰🇷" data={krData} nameMap={null}/>
                  </div>
                </div>
              </div>;
            })()}

            {/* ── 리더/회복/회피 섹터 포지셔닝 (US + KR) ── */}
            {(()=>{
              const usData=(MKT.sec||[]).map(([sym,r3m,r1m])=>({sym,r3m,r1m}));
              const krData=MKT.krSectors||[];
              const secNm={XLK:"기술",XLC:"커뮤니케이션",XLI:"산업재",XLY:"임의소비",XLV:"헬스케어",XLU:"유틸리티",XLE:"에너지",XLF:"금융",XLB:"소재",XLP:"필수소비",XLRE:"부동산"};
              if(!usData.length&&!krData.length)return null;

              const classify=(data,nameMap)=>{
                if(!data.length)return{leaders:[],recovery:[],avoid:[]};
                const s3=[...data].sort((a,b)=>b.r3m-a.r3m);
                const s1=[...data].sort((a,b)=>(b.r1m||0)-(a.r1m||0));
                const top3m=new Set(s3.slice(0,3).map(s=>s.sym));
                const bot3m=new Set(s3.slice(-3).map(s=>s.sym));
                const top1m=new Set(s1.slice(0,3).map(s=>s.sym));
                const nm=s=>nameMap?nameMap[s]||s:s;
                return{
                  leaders:data.filter(s=>top3m.has(s.sym)&&top1m.has(s.sym)).map(s=>nm(s.sym)),
                  recovery:data.filter(s=>!top3m.has(s.sym)&&top1m.has(s.sym)).map(s=>nm(s.sym)),
                  avoid:data.filter(s=>bot3m.has(s.sym)).map(s=>nm(s.sym)),
                };
              };

              const us=classify(usData,secNm);
              const kr=classify(krData,null);

              const Row=({icon,color,items})=><div style={{display:"flex",gap:4,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:11}}>{icon}</span>
                {items.length?items.map(nm=><span key={nm} style={{padding:"2px 7px",borderRadius:5,fontSize:10,background:color+"15",color:color,fontWeight:600,border:"1px solid "+color+"33"}}>{nm}</span>)
                :<span style={{fontSize:10,color:"#484f58"}}>해당 없음</span>}
              </div>;

              const Summary=({title,flag,cls})=><div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:8}}>{flag} {title}</div>
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    <span style={{fontSize:10,color:"#3fb950",fontWeight:700,minWidth:36,paddingTop:2}}>🥇 리더</span>
                    <div style={{flex:1}}><Row icon="" color="#3fb950" items={cls.leaders}/></div>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    <span style={{fontSize:10,color:"#58a6ff",fontWeight:700,minWidth:36,paddingTop:2}}>🔄 회복</span>
                    <div style={{flex:1}}><Row icon="" color="#58a6ff" items={cls.recovery}/></div>
                  </div>
                  <div style={{display:"flex",alignItems:"flex-start",gap:8}}>
                    <span style={{fontSize:10,color:"#f85149",fontWeight:700,minWidth:36,paddingTop:2}}>🚫 회피</span>
                    <div style={{flex:1}}><Row icon="" color="#f85149" items={cls.avoid}/></div>
                  </div>
                </div>
              </div>;

              return <div style={{background:"#161b22",borderRadius:8,padding:12,marginBottom:4}}>
                <div style={{fontSize:11,fontWeight:700,color:"#484f58",marginBottom:10}}>📌 섹터 포지셔닝 요약 (3M·1M 교차 분류)</div>
                <div style={{display:isMobile?"flex":"grid",gridTemplateColumns:"1fr 1fr",flexDirection:"column",gap:isMobile?0:20}}>
                  <div style={isMobile?{marginBottom:14}:{}}><Summary title="미국" flag="🇺🇸" cls={us}/></div>
                  {isMobile&&<div style={{height:1,background:"#21262d",margin:"8px 0"}}/>}
                  <div><Summary title="한국" flag="🇰🇷" cls={kr}/></div>
                </div>
              </div>;
            })()}
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
                {(()=>{
                  const execRule=composite<=25
                    ?{icon:"🟢",rule:"적극 매수 가능 — 분할 진입, 강한 종목 비중 확대",warn:"단, 추세 약한 종목 역발상 매수 금지"}
                    :composite<=40
                    ?{icon:"🔵",rule:"분할 매수 허용 — 눌림목 분할 진입만 허용",warn:"추격 매수 · 일괄 진입 금지"}
                    :composite<=60
                    ?{icon:"🟡",rule:"전략 유지 — 기존 보유 홀딩, 신규는 선별만",warn:"고점 근처 추격 매수 금지"}
                    :composite<=75
                    ?{icon:"🟠",rule:"비중 축소 — 수익 구간 분할 매도 검토",warn:"신규 매수 최소화, 익절 우선"}
                    :{icon:"🔴",rule:"이익실현 — 적극 매도, 현금 비중 확대",warn:"신규 매수 전면 금지"};
                  return <div style={{marginTop:10,background:"#0d1117",borderRadius:8,padding:10,display:"flex",gap:10,alignItems:"flex-start"}}>
                    <span style={{fontSize:18,lineHeight:1.2}}>{execRule.icon}</span>
                    <div>
                      <div style={{fontSize:12,fontWeight:700,color:"#e6edf3"}}>{execRule.rule}</div>
                      <div style={{fontSize:10,color:"#ff922b",marginTop:2}}>⚠️ {execRule.warn}</div>
                    </div>
                  </div>;
                })()}
              </div>;
            })()}
          </div>
        </div>

        {/* ============ 섹터 주간 수익률 추세 ============ */}
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14,marginTop:10}}>
          {/* 헤더 + 갱신 버튼 */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div>
              <div style={{fontSize:16,fontWeight:800,color:"#ffd43b"}}>📊 섹터 대표주 바스켓 추세</div>
              <div style={{fontSize:10,color:"#484f58",marginTop:2}}>
                현재 점수 상위 대표주 바스켓 · 최근 10거래일 누적 수익률
                {trendTime!=='-'&&<span style={{marginLeft:8}}>갱신: {trendTime}</span>}
              </div>
              <div style={{fontSize:9,color:"#484f58",marginTop:1,opacity:0.7}}>
                ※ 섹터 전체 지수가 아닌 "현재 강한 대표주 묶음"의 최근 성과 — 주도 섹터 확인용
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
                {s.q[4]?(' | R:R '+s.q[4]+':1'):""}
              </div>
              {/* 적응형 손절 힌트 */}
              {(()=>{
                const t1=s.v?.[0]||0;
                const pvt=s.v?.[4]||0;
                const cur=s.p||0;
                const hints=[];
                // VCP T1 기반: T1의 절반이 -7%보다 타이트하면 힌트
                if(t1>0&&t1/2<6)hints.push('VCP T1/2: -'+(t1/2).toFixed(1)+'% (타이트)');
                // 피봇 하단 기반: 피봇 -3~5% = 구조적 저점
                if(pvt>0&&cur>0){
                  const pvtStop=+(((pvt*0.97-cur)/cur)*100).toFixed(1);
                  if(pvtStop>-12&&pvtStop<0)hints.push('피봇 -3%: '+pvtStop+'%');
                }
                if(!hints.length)return null;
                return <div style={{marginTop:5,padding:'4px 8px',background:'#ffd60010',borderRadius:5,border:'1px solid #ffd60030',fontSize:9,color:'#ffd600'}}>
                  📐 적응형 손절 참고: {hints.join(' | ')} | 기본 -7% 유지, 종목 변동성에 따라 조정 가능
                </div>;
              })()}
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
                  return warns.map((w,i)=><div key={i} style={{padding:"4px 10px",borderRadius:5,fontSize:11,fontWeight:600,background:w.c+"12",border:"1px solid "+(w.c)+"33",color:w.c}}>{w.t}</div>);
                })()}
              </div>
            </>;
          })()}

        </div>
      </div>}

      {/* ============ 체크리스트 탭 ============ */}
      {tab==="check" && <div style={{maxWidth:860,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#b197fc",fontSize:16,marginBottom:4,marginTop:0}}>✅ 실전 매수 체크리스트</h3>
          <div style={{fontSize:10,color:"#484f58",marginBottom:12}}>필수 통과 · 우호 조건 · 실행 규칙 — 충동매수 방지 최종 점검</div>

          {/* 종목 검색 */}
          <div style={{marginBottom:12}}>
            <input type="text" value={chkSearch} onChange={e=>setChkSearch(e.target.value)} placeholder="🔍 종목명 또는 티커 검색..."
              style={{width:"100%",padding:8,background:"#161b22",border:"1px solid #30363d",borderRadius:"6px 6px 0 0",color:"#e6edf3",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
            <select value={selectedChkStock?.t||''} onChange={e=>{const s=stocks.find(d=>d.t===e.target.value);setSelectedChkStock(s||null);setChkSearch("");}}
              style={{width:"100%",padding:8,background:"#161b22",border:"1px solid #30363d",borderTop:"none",borderRadius:"0 0 6px 6px",color:"#e6edf3",fontSize:13,boxSizing:"border-box"}}
              size={chkSearch?Math.min(stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}).length+1,8):1}>
              <option value="">-- 종목 선택 --</option>
              {(chkSearch?stocks.filter(d=>{const ql=chkSearch.toLowerCase();return d.n.toLowerCase().includes(ql)||d.t.toLowerCase().includes(ql);}):stocks).map(s=>(
                <option key={s.t} value={s.t}>{s.n} ({s.t}) MF:{s.f||'N/A'}</option>
              ))}
            </select>
          </div>

          {/* ── 종목 선택 시 상단 요약 바 ── */}
          {selectedChkStock && (()=>{
            const s=selectedChkStock;
            const dm=getDualMomentum(s);
            const hardItems=checklistItems.filter(i=>i.tier==='hard');
            const hardPass=hardItems.filter(i=>i.auto?i.check(s):manualChecks[i.id]).length;
            const hardTotal=hardItems.length;
            const softItems=checklistItems.filter(i=>i.tier==='soft');
            const softPass=softItems.filter(i=>i.auto?i.check(s):manualChecks[i.id]).length;
            const execItems=checklistItems.filter(i=>i.tier==='exec');
            const execPass=execItems.filter(i=>manualChecks[i.id]).length;
            const failedHard=hardItems.filter(i=>!(i.auto?i.check(s):manualChecks[i.id])).map(i=>i.engine);
            const allHardPass=hardPass===hardTotal;
            const execAllPass=execPass===execItems.length;
            // 최종 판정
            let finalLabel,finalColor,finalBg,finalSub;
            if(!allHardPass){
              finalLabel='⛔ 매수 금지';finalColor='#f85149';finalBg='#f8514912';
              finalSub='핵심 실패: '+failedHard.join(', ');
            } else if(!execAllPass){
              finalLabel='⚠️ 실행 규칙 미완';finalColor='#ffd43b';finalBg='#ffd43b0a';
              finalSub='손절·비중 설정 먼저 완료';
            } else if(softPass>=3){
              finalLabel='✅ 매수 가능';finalColor='#3fb950';finalBg='#3fb95012';
              finalSub='우호 조건 '+softPass+'/'+softItems.length+' 충족';
            } else {
              finalLabel='🔵 돌파 대기';finalColor='#4dabf7';finalBg='#4dabf70a';
              finalSub='필수 통과 · 우호 조건 추가 확인 권장';
            }
            return <>
              {/* 종목 정보 */}
              <div style={{padding:"8px 12px",background:"#161b22",borderRadius:8,marginBottom:8,border:"1px solid #30363d"}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <span style={{fontSize:15,fontWeight:800,color:"#e6edf3"}}>{s.n}</span>
                  <span style={{fontSize:11,color:"#484f58"}}>{s.t}</span>
                  <span style={{fontSize:11,padding:"2px 7px",borderRadius:4,background:"#4dabf720",color:"#4dabf7"}}>MF {s.f||'N/A'}</span>
                  <span style={{fontSize:11,padding:"2px 7px",borderRadius:4,background:"#69db7c20",color:"#69db7c"}}>SEPA {seTt(s)}/8</span>
                  <span style={{fontSize:11,padding:"2px 7px",borderRadius:4,background:"#ffd43b20",color:"#ffd43b"}}>VCP {vcpMt(s)}</span>
                  <span style={{fontSize:11,padding:"2px 7px",borderRadius:4,background:dm.signalColor+"20",color:dm.signalColor}}>DM {dm.signal}</span>
                </div>
              </div>
              {/* 최종 판정 박스 */}
              <div style={{padding:"12px 16px",background:finalBg,border:"2px solid "+finalColor+"55",borderRadius:10,marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:finalColor}}>{finalLabel}</div>
                    <div style={{fontSize:10,color:finalColor,opacity:0.8,marginTop:2}}>{finalSub}</div>
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:900,color:allHardPass?"#3fb950":"#f85149",fontFamily:"'JetBrains Mono'"}}>{hardPass}/{hardTotal}</div>
                      <div style={{fontSize:9,color:"#484f58"}}>필수 통과</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:900,color:softPass>=3?"#3fb950":softPass>=2?"#ffd43b":"#8b949e",fontFamily:"'JetBrains Mono'"}}>{softPass}/{softItems.length}</div>
                      <div style={{fontSize:9,color:"#484f58"}}>우호 조건</div>
                    </div>
                    <div style={{textAlign:"center"}}>
                      <div style={{fontSize:18,fontWeight:900,color:execAllPass?"#3fb950":"#ffd43b",fontFamily:"'JetBrains Mono'"}}>{execPass}/{execItems.length}</div>
                      <div style={{fontSize:9,color:"#484f58"}}>실행 규칙</div>
                    </div>
                  </div>
                </div>
              </div>
            </>;
          })()}

          {/* ── A. 필수 통과 (Hard Stop) ── */}
          {(()=>{
            const s=selectedChkStock;
            const items=checklistItems.filter(i=>i.tier==='hard');
            return <div style={{marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:800,color:"#f85149"}}>🔴 A. 필수 통과</span>
                <span style={{fontSize:9,color:"#484f58"}}>하나라도 실패 시 매수 금지</span>
              </div>
              <div style={{display:"grid",gap:4}}>
                {items.map(item=>{
                  const pass=s?(item.auto?item.check(s):manualChecks[item.id]):null;
                  const dotColor=s===null?"#484f58":pass?"#3fb950":"#f85149";
                  const rowBg=s===null?"#161b22":pass?"#3fb95008":"#f8514908";
                  const borderC=s===null?"#21262d":pass?"#3fb95033":"#f8514944";
                  const reason=s&&!pass&&item.failReason?item.failReason(s):null;
                  return <div key={item.id}
                    style={{padding:"8px 12px",borderRadius:6,background:rowBg,border:"1px solid "+borderC,cursor:item.auto?"default":"pointer",opacity:!s&&item.auto?0.5:1}}
                    onClick={()=>{if(!item.auto)setManualChecks(p=>({...p,[item.id]:!p[item.id]}));}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:18,height:18,borderRadius:"50%",background:dotColor,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#000",fontWeight:800}}>
                        {s===null?"?":pass?"✓":"✗"}
                      </div>
                      <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:item.engine==='MF'?"#4dabf720":item.engine==='SEPA'?"#69db7c20":item.engine==='DM'?"#bc8cff20":item.engine==='시장'?"#b197fc20":"#ff6b6b20",color:item.engine==='MF'?"#4dabf7":item.engine==='SEPA'?"#69db7c":item.engine==='DM'?"#bc8cff":item.engine==='시장'?"#b197fc":"#ff6b6b",fontWeight:700,flexShrink:0}}>{item.engine}</span>
                      <span style={{fontSize:12,color:pass?"#e6edf3":"#ccc",fontWeight:pass?600:400}}>{item.label}</span>
                      {item.auto&&<span style={{marginLeft:"auto",fontSize:8,color:"#484f58"}}>자동</span>}
                      {!item.auto&&<span style={{marginLeft:"auto",fontSize:8,color:pass?"#3fb950":"#ffd43b"}}>{pass?"완료":"미완료 — 클릭 체크"}</span>}
                    </div>
                    {reason&&<div style={{fontSize:9,color:"#f85149",marginTop:4,marginLeft:26,opacity:0.85}}>↳ {reason}</div>}
                  </div>;
                })}
              </div>
            </div>;
          })()}

          {/* ── B. 우호 조건 (Soft Check) ── */}
          {(()=>{
            const s=selectedChkStock;
            const items=checklistItems.filter(i=>i.tier==='soft');
            return <div style={{marginBottom:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:800,color:"#ffd43b"}}>🟡 B. 우호 조건</span>
                <span style={{fontSize:9,color:"#484f58"}}>있으면 더 좋음 — 3개 이상 권장</span>
              </div>
              <div style={{display:"grid",gap:4}}>
                {items.map(item=>{
                  const pass=s?(item.auto?item.check(s):manualChecks[item.id]):null;
                  const dotColor=s===null?"#484f58":pass?"#3fb950":"#ffd43b";
                  const rowBg=s===null?"#161b22":pass?"#3fb95008":"#ffd43b06";
                  const borderC=s===null?"#21262d":pass?"#3fb95033":"#ffd43b33";
                  const reason=s&&!pass&&item.failReason?item.failReason(s):null;
                  return <div key={item.id}
                    style={{padding:"7px 12px",borderRadius:6,background:rowBg,border:"1px solid "+borderC,opacity:!s&&item.auto?0.4:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:16,height:16,borderRadius:"50%",background:dotColor,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#000",fontWeight:800}}>
                        {s===null?"?":pass?"✓":"△"}
                      </div>
                      <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:item.engine==='SEPA'?"#69db7c20":item.engine==='VCP'?"#ffd43b20":item.engine==='CF'?"#ff922b20":"#bc8cff20",color:item.engine==='SEPA'?"#69db7c":item.engine==='VCP'?"#ffd43b":item.engine==='CF'?"#ff922b":"#bc8cff",fontWeight:700,flexShrink:0}}>{item.engine}</span>
                      <span style={{fontSize:11,color:pass?"#e6edf3":"#8b949e"}}>{item.label}</span>
                      {item.auto&&<span style={{marginLeft:"auto",fontSize:8,color:"#484f58"}}>자동</span>}
                    </div>
                    {reason&&<div style={{fontSize:9,color:"#ffd43b",marginTop:3,marginLeft:24,opacity:0.8}}>↳ {reason}</div>}
                  </div>;
                })}
              </div>
            </div>;
          })()}

          {/* ── C. 실행 규칙 ── */}
          {(()=>{
            const items=checklistItems.filter(i=>i.tier==='exec');
            return <div>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                <span style={{fontSize:11,fontWeight:800,color:"#4dabf7"}}>🔵 C. 실행 규칙</span>
                <span style={{fontSize:9,color:"#484f58"}}>진입 전 반드시 확인 — 수동 체크</span>
              </div>
              <div style={{display:"grid",gap:4}}>
                {items.map(item=>{
                  const pass=manualChecks[item.id];
                  return <div key={item.id}
                    style={{padding:"7px 12px",borderRadius:6,background:pass?"#4dabf708":"#161b22",border:"1px solid "+(pass?"#4dabf733":"#21262d"),cursor:"pointer"}}
                    onClick={()=>setManualChecks(p=>({...p,[item.id]:!p[item.id]}))}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:16,height:16,borderRadius:3,background:pass?"#4dabf7":"#21262d",flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:pass?"#000":"#484f58",fontWeight:800}}>
                        {pass?"✓":""}
                      </div>
                      <span style={{fontSize:9,padding:"1px 5px",borderRadius:3,background:"#ff6b6b20",color:"#ff6b6b",fontWeight:700,flexShrink:0}}>리스크</span>
                      <span style={{fontSize:11,color:pass?"#e6edf3":"#8b949e"}}>{item.label}</span>
                      <span style={{marginLeft:"auto",fontSize:8,color:pass?"#4dabf7":"#ffd43b"}}>{pass?"완료":"클릭 체크"}</span>
                    </div>
                    {!pass&&<div style={{fontSize:9,color:"#8b949e",marginTop:3,marginLeft:24}}>↳ {item.failReason()}</div>}
                  </div>;
                })}
              </div>
              {/* 수동 초기화 버튼 */}
              <button onClick={()=>setManualChecks({})} style={{marginTop:10,padding:"4px 12px",borderRadius:5,border:"1px solid #30363d",background:"transparent",color:"#484f58",cursor:"pointer",fontSize:10}}>↺ 수동 체크 초기화</button>
            </div>;
          })()}
        </div>
      </div>}

      {/* ============ 워치리스트 탭 ============ */}
      {tab==="watch" && <div style={{maxWidth:1800,margin:"0 auto",padding:"6px 20px"}}>
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:14}}>
          <h3 style={{color:"#ffd43b",fontSize:16,marginBottom:12,marginTop:0}}>👁 워치리스트 ({watchlist.length}종목)</h3>
          {/* 동기화 버튼 — 시각 무게 낮춤 */}
          <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
            <button onClick={doExport} style={{padding:"3px 9px",borderRadius:4,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer",fontSize:10}}>📤 내보내기 (데이터만)</button>
            <button onClick={()=>setShowSync(!showSync)} style={{padding:"3px 9px",borderRadius:4,border:"1px solid #30363d",background:"transparent",color:"#8b949e",cursor:"pointer",fontSize:10}}>📥 가져오기</button>
            {syncMsg && <span style={{fontSize:10,color:syncMsg.startsWith('✅')?'#3fb950':syncMsg.startsWith('❌')?'#f85149':'#58a6ff'}}>{syncMsg}</span>}
          </div>
          {showSync && <div style={{display:"flex",gap:6,marginBottom:10,alignItems:"center"}}>
            <input value={syncInput} onChange={e=>setSyncInput(e.target.value)} placeholder="코드를 여기에 붙여넣기" style={{flex:1,padding:"6px 10px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:11,fontFamily:"'JetBrains Mono'",outline:"none"}}/>
            <button onClick={doImport} style={{padding:"5px 14px",borderRadius:5,border:"1px solid #3fb950",background:"#3fb95015",color:"#3fb950",cursor:"pointer",fontSize:11,fontWeight:700}}>적용</button>
          </div>}
          {syncMsg&&syncMsg.startsWith('✅ 가져오기')&&<div style={{padding:"6px 10px",background:"#ffd60015",border:"1px solid #ffd60044",borderRadius:6,marginBottom:8,fontSize:11,color:"#ffd600"}}>⚠️ 점수 정확도를 위해 이 기기에서도 <b>🔬 분석실행</b>을 한 번 눌러주세요. (분석결과는 기기별 별도 저장)</div>}
          {watchlist.length===0 ? <div style={{color:"#484f58",fontSize:13,padding:20,textAlign:"center"}}>워치리스트가 비어있습니다.<br/>종목 상세보기에서 ☆ 버튼으로 추가하세요.</div> : <>
            {/* 최강 임박 알림 */}
            {(()=>{
              const nearFire=stocks.filter(d=>watchlist.includes(d.t)).filter(d=>{const vd=getVerdict(d);return vd.totalPt>=70&&vd.totalPt<80;});
              if(nearFire.length===0)return null;
              return <div style={{background:"#ff174412",border:"1px solid #ff174444",borderRadius:8,padding:"10px 14px",marginBottom:12}}>
                <div style={{fontSize:12,fontWeight:800,color:"#ff1744",marginBottom:2}}>🔥 최강 임박! ({nearFire.length}종목)</div>
                <div style={{fontSize:9,color:"#ff8a80",marginBottom:8,opacity:0.8}}>기준: 종합 70~79점 + 워치리스트 등록 — 🔥최강 직전 점수대</div>
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
                    {downs.map(({d:s,last:l,daysAgo:da,transRet:tr})=>{
                      // 하락 이유 태그 생성
                      const reasons=[];
                      const vd=getVerdict(s);
                      const dm=getDualMomentum(s);
                      const ind=s._indicators;const vol=s._volData;
                      const ptDiff=l.to.pt-l.from.pt;
                      if(ptDiff<=-10)reasons.push('점수 '+(ptDiff)+'점');
                      if(dm.signal==='SELL'||dm.signal==='WEAK')reasons.push('DM 약화');
                      if(!vcpMt(s).includes('성숙')&&vcpMt(s)!=='형성중')reasons.push('VCP 실패');
                      if(seTt(s)<7)reasons.push('SEPA '+seTt(s)+'/8');
                      if(vol&&vol.signalType==='sell')reasons.push('거래량 매도압력');
                      if(ind&&['dead','bearish'].includes(ind.macd.signal))reasons.push('MACD 하락');
                      return <div key={s.t} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#0d1117",borderRadius:6,cursor:"pointer"}} onClick={()=>{setDetailStock(s);setShowDetail(true);}}>
                        <div>
                          <span style={{fontSize:12,fontWeight:700}}>{s.k?'🇰🇷':'🇺🇸'} {s.n}</span>
                          <span style={{fontSize:9,color:"#484f58",marginLeft:4}}>{l.date.slice(5)}</span>
                          <div style={{fontSize:10}}>
                            <span style={{color:"#8b949e"}}>{l.from.grade}</span>
                            <span style={{color:"#f85149",margin:"0 3px"}}>↓</span>
                            <span style={{color:"#f85149",fontWeight:700}}>{l.to.grade}</span>
                          </div>
                          {reasons.length>0&&<div style={{fontSize:9,color:"#f85149",opacity:0.75,marginTop:2}}>{reasons.join(' · ')}</div>}
                        </div>
                        {tr&&<div style={{fontSize:14,fontWeight:900,color:"#f85149",fontFamily:"'JetBrains Mono'"}}>{tr}%</div>}
                      </div>;
                    })}
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
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#58a6ff",fontSize:11,whiteSpace:"nowrap"}}>변화</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>현재가</th>
                    <th style={{padding:"6px 8px",textAlign:"right",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>등락</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>SEPA</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#484f58",fontSize:11,whiteSpace:"nowrap"}}>DM</th>
                    <th style={{padding:"6px 8px",textAlign:"center",color:"#ffd43b",fontSize:11,whiteSpace:"nowrap"}}>피봇거리</th>
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
                      <td style={{padding:"4px 6px",textAlign:"center",background:vd.color+"12",borderLeft:"2px solid "+vd.color,minWidth:60}}>
                        <div style={{fontSize:12,fontWeight:800,color:vd.color}}>{vd.verdict}</div>
                        <div style={{fontSize:10,color:vd.color,fontFamily:"'JetBrains Mono'",fontWeight:700}}>{vd.totalPt}점</div>
                        {d._execTag && (()=>{const tC={'BUY NOW':'#00e676','BUY ON BREAKOUT':'#448aff','WATCH':'#ffd600','AVOID':'#f85149'}[d._execTag]||'#aaa';const tL={'BUY NOW':'BUY NOW','BUY ON BREAKOUT':'돌파매수','WATCH':'WATCH','AVOID':'AVOID'}[d._execTag]||d._execTag;return <div style={{fontSize:8,fontWeight:700,color:tC,marginTop:1}}>{tL}</div>;})()}
                      </td>
                      {/* 변화 컬럼 — 점수변화 + 최근이벤트 */}
                      {(()=>{
                        const h=gradeHistory[d.t];
                        const last=h&&h.length?h[h.length-1]:null;
                        const ptDiff=last?(last.to.pt-(last.from.pt||last.to.pt)):0;
                        const isUp=ptDiff>0,isDown=ptDiff<0;
                        const daysAgo=last?Math.floor((Date.now()-new Date(last.date).getTime())/86400000):null;
                        // 이벤트 배지
                        const events=[];
                        if(vd.totalPt>=70&&vd.totalPt<80)events.push({txt:'최강임박',c:'#ff1744'});
                        if(vol&&vol.signalType==='buy')events.push({txt:'매수신호',c:'#3fb950'});
                        if(vol&&vol.signalType==='sell')events.push({txt:'매도신호',c:'#f85149'});
                        return <td style={{padding:"4px 6px",textAlign:"center",minWidth:70}}>
                          {last ? <>
                            <div style={{fontSize:11,fontWeight:800,color:isUp?'#3fb950':isDown?'#f85149':'#484f58',fontFamily:"'JetBrains Mono'"}}>
                              {isUp?'▲':isDown?'▼':'—'}{Math.abs(ptDiff)>0?Math.abs(ptDiff)+'pt':''}
                            </div>
                            <div style={{fontSize:8,color:'#484f58'}}>{daysAgo!==null?daysAgo+'일전':''}</div>
                          </> : <span style={{color:'#333',fontSize:10}}>—</span>}
                          {events.slice(0,1).map((ev,i)=><div key={i} style={{fontSize:8,color:ev.c,marginTop:1,fontWeight:700}}>{ev.txt}</div>)}
                        </td>;
                      })()}
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
                      {/* 피봇 거리 — 워치리스트 핵심 "언제 볼지" */}
                      {(()=>{
                        const px=vcpPx(d);
                        const hasPvt=d.v&&d.v[4]>0;
                        const isNear=px>0&&px<5;
                        const isBrk=vcpMt(d).includes('돌파');
                        return <td style={{padding:"4px 6px",textAlign:"center",minWidth:60}}>
                          {hasPvt ? <>
                            <div style={{fontSize:11,fontWeight:800,color:isBrk?'#3fb950':isNear?'#ffd43b':'#8b949e',fontFamily:"'JetBrains Mono'"}}>
                              {isBrk?'✅돌파':isNear?('-'+px+'%'):('-'+px+'%')}
                            </div>
                            <div style={{fontSize:8,color:isNear?'#ffd43b':'#484f58'}}>{isNear?'⚡감시':''}</div>
                          </> : <span style={{color:'#333',fontSize:10}}>-</span>}
                        </td>;
                      })()}
                      <td style={{padding:"4px 6px",textAlign:"center"}}>
                        <div style={{fontSize:10,fontWeight:700,color:vcpMt(d)==='성숙🔥'?'#ff1744':vcpMt(d)==='성숙'?'#3fb950':vcpMt(d)==='형성중'?'#d29922':'#484f58'}}>{vcpMt(d)}</div>
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
            <div style={{position:"relative",minWidth:180}}>
              <input type="text" placeholder="🔍 종목명/티커 검색" value={pfAddSearch}
                onChange={e=>{setPfAddSearch(e.target.value);if(!e.target.value)setPfForm(p=>({...p,ticker:''}));}}
                style={{padding:"5px 8px",borderRadius:pfAddSearch?"5px 5px 0 0":"5px",border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:"100%",outline:"none"}}/>
              {pfAddSearch&&<div style={{position:"absolute",top:"100%",left:0,right:0,maxHeight:200,overflowY:"auto",background:"#161b22",border:"1px solid #21262d",borderTop:"none",borderRadius:"0 0 5px 5px",zIndex:999}}>
                {stocks.filter(d=>{const q=pfAddSearch.toLowerCase();return d.n.toLowerCase().includes(q)||d.t.toLowerCase().includes(q);}).slice(0,12).map(d=>(
                  <div key={d.t} onClick={()=>{setPfForm(p=>({...p,ticker:d.t}));setPfAddSearch(d.n+" ("+d.t+")");}}
                    style={{padding:"5px 8px",cursor:"pointer",fontSize:12,display:"flex",justifyContent:"space-between"}}
                    onMouseOver={e=>e.currentTarget.style.background="#21262d"} onMouseOut={e=>e.currentTarget.style.background="transparent"}>
                    <span style={{color:"#e6edf3"}}>{d.k?"🇰🇷":"🇺🇸"} {d.n}</span>
                    <span style={{color:"#484f58",fontSize:10}}>{d.t}</span>
                  </div>
                ))}
                {stocks.filter(d=>{const q=pfAddSearch.toLowerCase();return d.n.toLowerCase().includes(q)||d.t.toLowerCase().includes(q);}).length===0&&<div style={{padding:"6px 8px",fontSize:11,color:"#484f58"}}>검색 결과 없음</div>}
              </div>}
            </div>
            <input type="number" placeholder="매수가" value={pfForm.buyPrice||''} onChange={e=>setPfForm(p=>({...p,buyPrice:e.target.value}))}
              style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:100,fontFamily:"'JetBrains Mono'"}}/>
            <input type="number" placeholder="수량" value={pfForm.qty||''} onChange={e=>setPfForm(p=>({...p,qty:e.target.value}))}
              style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:70,fontFamily:"'JetBrains Mono'"}}/>
            <button onClick={()=>{addPortfolio(pfForm.ticker,pfForm.buyPrice,pfForm.qty,0);setPfForm({ticker:'',buyPrice:0,qty:0,stopLoss:0});setPfAddSearch('');}}
              style={{padding:"5px 14px",borderRadius:5,border:"1px solid #bc8cff",background:"#bc8cff18",color:"#bc8cff",cursor:"pointer",fontSize:12,fontWeight:700}}>추가</button>
            <span style={{fontSize:10,color:"#484f58"}}>손절가 자동계산 (진입-7% / 트레일링-9%)</span>
          </div>

          {portfolio.length===0 ? <div style={{color:"#484f58",fontSize:13,padding:20,textAlign:"center"}}>보유종목이 없습니다. 위에서 종목을 추가하세요.</div> : <>
            {/* ── KPI 카드 상단 요약 ── */}
            {(()=>{
              let krBuy=0,krCur=0,usBuy=0,usCur=0;
              let alertCnt=0,takeProfitCnt=0,holdCnt=0,clearCnt=0;
              portfolio.forEach(p=>{
                const s=stocks.find(d=>d.t===p.ticker);
                if(!s||!s.p)return;
                if(s.k){krBuy+=p.buyPrice*p.qty;krCur+=s.p*p.qty;}
                else{usBuy+=p.buyPrice*p.qty;usCur+=s.p*p.qty;}
                const sl=calcStops(p,s.p);
                const pct=p.buyPrice>0?((s.p/p.buyPrice-1)*100):0;
                const vd=getVerdict(s);
                const hs=getHoldStatus(sl,pct,vd,s);
                if(hs.label==='정리검토')clearCnt++;
                else if(hs.label==='경계')alertCnt++;
                else if(hs.label==='익절구간')takeProfitCnt++;
                else holdCnt++;
              });
              const krPnl=krCur-krBuy, usPnl=usCur-usBuy;
              const totalBuy=krBuy+usBuy, totalPnl=krPnl+usPnl;
              const totalPct=totalBuy>0?((totalBuy+totalPnl)/totalBuy-1)*100:0;
              const kpis=[
                {label:'총 평가',val:'₩'+Math.round(krCur).toLocaleString()+(usCur>0?' + $'+Math.round(usCur).toLocaleString():''),color:'#e6edf3',sub:null},
                {label:'총 손익',val:(totalPnl>=0?'+':'')+Math.round(totalPnl).toLocaleString(),color:totalPnl>=0?'#3fb950':'#f85149',sub:(totalPct>=0?'+':'')+totalPct.toFixed(2)+'%'},
                {label:'경계',val:alertCnt+'종목',color:alertCnt>0?'#ffd43b':'#484f58',sub:clearCnt>0?'정리'+clearCnt:null},
                {label:'익절후보',val:takeProfitCnt+'종목',color:takeProfitCnt>0?'#bc8cff':'#484f58',sub:'보유유지 '+holdCnt},
              ];
              return <div style={{display:'grid',gridTemplateColumns:isMobile?'repeat(2,1fr)':'repeat(4,1fr)',gap:8,marginBottom:14}}>
                {kpis.map(k=><div key={k.label} style={{background:'#161b22',borderRadius:8,padding:'10px 12px',border:'1px solid #21262d'}}>
                  <div style={{fontSize:10,color:'#484f58',marginBottom:4}}>{k.label}</div>
                  <div style={{fontSize:isMobile?12:14,fontWeight:900,color:k.color,fontFamily:"'JetBrains Mono'",lineHeight:1.2}}>{k.val}</div>
                  {k.sub&&<div style={{fontSize:9,color:k.color,opacity:0.8,marginTop:2}}>{k.sub}</div>}
                </div>)}
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
                    const hs=getHoldStatus(sl,pct,vd,s);
                    return <tr key={idx} style={{borderBottom:"1px solid rgba(33,38,45,.4)",background:hs.label==='정리검토'?'#f8514908':hs.label==='경계'?'#ffd43b05':sl.statusBg}}>
                      <td style={{padding:"6px 8px",whiteSpace:"nowrap",position:isMobile?"sticky":undefined,left:isMobile?0:undefined,background:hs.label==='정리검토'?'#f8514910':hs.label==='경계'?'#ffd43b08':(sl.statusBg||"#0d1117"),zIndex:isMobile?1:undefined,borderRight:isMobile?"1px solid #21262d":undefined}}>
                        <span onClick={()=>{setDetailStock(s);setShowDetail(true);}} style={{fontWeight:600,cursor:"pointer",borderBottom:"1px dashed #484f58",color:vd.stars>=5?"#ff1744":"#e6edf3"}}>{s.n}</span>
                        <span style={{fontSize:10,color:"#484f58",marginLeft:4}}>{s.t}</span>
                        <div style={{fontSize:10,color:s.c>=0?"#3fb950":"#f85149"}}>당일 {s.c>=0?"+":""}{s.c?.toFixed(2)||0}%</div>
                      </td>
                      {/* 보유 전용 상태 — 신규매수 판정과 분리 */}
                      <td style={{padding:"4px 6px",textAlign:"center",background:hs.bg,borderLeft:'2px solid '+hs.color,minWidth:70}}>
                        <div style={{fontSize:isMobile?10:12,fontWeight:900,color:hs.color}}>{hs.label}</div>
                        <div style={{fontSize:8,color:'#484f58',marginTop:1,lineHeight:1.2}}>{hs.desc.split('—')[0]}</div>
                        {/* 스캔 판정은 작게 참고용 */}
                        <div style={{fontSize:7,color:vd.color,opacity:0.7,marginTop:1}}>스캔: {vd.verdict}</div>
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
        {/* ── 1차 필터: 항상 노출 ── */}
        <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:4,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:2}}>
          {[["dual",isMobile?"📊":"📊 듀얼"],["mf",isMobile?"🎯":"🎯 MF"],["sepa",isMobile?"🏆":"🏆 SEPA"],["dm",isMobile?"⚡":"⚡ DM"],["vcp",isMobile?"📉":"📉 VCP"],["cf",isMobile?"📐":"📐 CF"]].map(([k,l])=><Tb key={k} label={l} active={view===k} onClick={()=>setView(k)}/>)}
          <div style={{width:1,height:18,background:"#21262d",flexShrink:0}}/>
          {[["all",isMobile?"전체":"🌐 전체"],["us",isMobile?"🇺🇸"+usStocks.length:"🇺🇸 미국("+usStocks.length+")"],["kr",isMobile?"🇰🇷"+krStocks.length:"🇰🇷 한국("+krStocks.length+")"]].map(([k,l])=><Tb key={k} label={l} active={mk===k} onClick={()=>setMk(k)}/>)}
          <div style={{width:1,height:18,background:"#21262d",flexShrink:0}}/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="🔍" style={{padding:"5px 8px",borderRadius:5,border:"1px solid #21262d",background:"#0d1117",color:"#e6edf3",fontSize:12,width:isMobile?60:100,outline:"none",flexShrink:0}}/>
          <span style={{fontSize:12,color:"#484f58",fontFamily:"'JetBrains Mono'",flexShrink:0}}>{sorted.length}</span>
          {/* 상세 필터 토글 */}
          <button onClick={()=>setFilterOpen(o=>!o)} style={{padding:"3px 8px",borderRadius:4,border:"1px solid "+(filterOpen?"#58a6ff":"#21262d"),background:filterOpen?"#58a6ff15":"#0d1117",color:filterOpen?"#58a6ff":"#8b949e",cursor:"pointer",fontSize:10,fontWeight:600,flexShrink:0,whiteSpace:"nowrap"}}>
            {filterOpen?"▲ 필터 접기":"▼ 상세 필터"}
            {(dmFilter!=="all"||sec!=="all")&&<span style={{marginLeft:4,fontSize:9,padding:"1px 4px",borderRadius:3,background:"#58a6ff",color:"#0d1117",fontWeight:800}}>ON</span>}
          </button>
        </div>

        {/* ── 2차 필터: 접기/펼치기 ── */}
        {filterOpen && <>
          <div style={{display:"flex",gap:3,alignItems:"center",marginBottom:4,overflowX:"auto",WebkitOverflowScrolling:"touch",scrollbarWidth:"none",paddingBottom:2}}>
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
        </>}
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
        // 🔥 즉시 검토 후보: 80+ & (거래량 매집 OR VCP 성숙/돌파)
        const buyNowAll=all.filter(({vd,d})=>vd.totalPt>=80 && (vd.details.volPt>=9 || ['성숙🔥','성숙','돌파✅'].includes(vcpMt(d))))
          .sort((a,b)=>b.vd.totalPt-a.vd.totalPt);
        const buyNow=buyNowAll.slice(0,cardLimit.buyNow);
        // 👀 돌파 대기 후보: 60~85 & VCP 형성중/성숙 & 피봇 10% 이내 — 점수↓ + 피봇근접↑ 복합정렬
        const soonBreakAll=all.filter(({vd,d})=>vd.totalPt>=60 && vd.totalPt<85 && ['형성중','성숙','성숙🔥'].includes(vcpMt(d)) && Math.abs(vcpPx(d))<=10)
          .sort((a,b)=>{
            // 피봇 근접도 우선, 동일 근접도면 점수 높은 순
            const proxDiff=Math.abs(vcpPx(a.d))-Math.abs(vcpPx(b.d));
            if(Math.abs(proxDiff)>1)return proxDiff;
            return b.vd.totalPt-a.vd.totalPt;
          });
        const soonBreak=soonBreakAll.slice(0,cardLimit.soonBreak);
        // 📈 저소음 강세주: SEPA 7+/8 & DM BUY+ & 아직 최강 아님 & 거래량 중립~
        const silentAll=all.filter(({vd,d,dm})=>seTt(d)>=7 && dm.signalScore>=7 && vd.totalPt>=55 && vd.totalPt<80 && vd.details.volPt>=4 && vd.details.volPt<=8)
          .sort((a,b)=>b.vd.totalPt-a.vd.totalPt);
        const silent=silentAll.slice(0,cardLimit.silent);
        // 🎯 보조지표 올그린: 볼린저 스퀴즈 + MACD 상승 + OBV 매집/상승확인
        const tripleGreenAll=all.filter(({d})=>{
          const ind=d._indicators;if(!ind)return false;
          return ind.bb.signal==='squeeze' && ['golden','bullish'].includes(ind.macd.signal) && ['accumulation','confirm'].includes(ind.obv.signal);
        }).sort((a,b)=>b.vd.totalPt-a.vd.totalPt);
        const tripleGreen=tripleGreenAll.slice(0,cardLimit.tripleGreen);
        if(buyNowAll.length===0&&soonBreakAll.length===0&&silentAll.length===0&&tripleGreenAll.length===0)return null;
        const Card=({icon,title,color,cardKey,allItems,items,sortLabel,getTag,getReason})=>(
          allItems.length===0?null:<div style={{flex:1,minWidth:isMobile?'100%':280,background:'linear-gradient(135deg,#0a0a1e,#0d1830)',borderRadius:10,padding:'12px 14px',border:"1px solid "+(color)+"33"}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
              <div style={{fontSize:13,fontWeight:800,color}}>{icon} {title}</div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <div style={{fontSize:8,color:'#484f58',padding:'1px 5px',borderRadius:3,background:'#161b22'}}>{sortLabel||'점수순'}</div>
                <div style={{fontSize:9,color:'#484f58'}}>{allItems.length}개</div>
              </div>
            </div>
            {items.map(({d,vd})=>(
              <div key={d.t} onClick={()=>{setDetailStock(d);setShowDetail(true);}} style={{padding:'6px 8px',marginBottom:4,background:'#161b2288',borderRadius:6,cursor:'pointer',border:'1px solid transparent',transition:'border .2s'}}
                onMouseEnter={e=>e.currentTarget.style.borderColor=color+'66'} onMouseLeave={e=>e.currentTarget.style.borderColor='transparent'}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:vd.stars>=5?'#ff1744':'#e6edf3',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.n}</div>
                    <div style={{fontSize:9,color:'#484f58'}}>{d.s}</div>
                  </div>
                  <div style={{fontSize:15,fontWeight:900,color:vd.color,fontFamily:"'JetBrains Mono'",minWidth:28,textAlign:'right'}}>{vd.totalPt}</div>
                  <div style={{fontSize:8,padding:'2px 5px',borderRadius:4,background:color+'15',color,fontWeight:700,whiteSpace:'nowrap',opacity:0.9}}>{getTag(d,vd)}</div>
                </div>
                <div style={{fontSize:9,color:'#8b949e',marginTop:3,lineHeight:1.3}}>{getReason(d,vd)}</div>
              </div>
            ))}
            <div style={{display:'flex',gap:4,marginTop:4}}>
              {allItems.length>items.length && <button onClick={e=>{e.stopPropagation();setCardLimit(l=>({...l,[cardKey]:l[cardKey]+5}));}} style={{flex:1,padding:'4px 0',borderRadius:5,border:'1px solid '+color+'33',background:'transparent',color:color,cursor:'pointer',fontSize:10}}>
                + 더보기 ({allItems.length-items.length}개)
              </button>}
              {items.length>5 && <button onClick={e=>{e.stopPropagation();setCardLimit(l=>({...l,[cardKey]:5}));}} style={{padding:'4px 8px',borderRadius:5,border:'1px solid #21262d',background:'transparent',color:'#484f58',cursor:'pointer',fontSize:10}}>
                접기
              </button>}
            </div>
          </div>
        );
        return <div style={{maxWidth:1800,margin:'0 auto',padding:'0 20px 12px'}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
            <Card icon="🔥" title="즉시 검토 후보" color="#ff1744" cardKey="buyNow" allItems={buyNowAll} items={buyNow} sortLabel="점수순"
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
            <Card icon="👀" title="돌파 대기 후보" color="#ffd600" cardKey="soonBreak" allItems={soonBreakAll} items={soonBreak} sortLabel="피봇근접순"
              getTag={(d)=>'피봇 '+(vcpPx(d)>0?'':'+')+Math.abs(vcpPx(d))+'%'}
              getReason={(d,vd)=>{
                const px=vcpPx(d);const vm=vcpMt(d);
                const base=vm==='성숙🔥'?'거래량까지 줄어들며 에너지 압축 중':vm==='성숙'?'변동성 수축 완료, 돌파 대기':
                  ('변동성 수축 진행 중 (T1:'+d.v[0]+'%→T2:'+d.v[1]+'%)');
                return base+' · 피봇까지 '+Math.abs(px)+'%';
              }}
            />
            <Card icon="📈" title="저소음 강세주" color="#00e676" cardKey="silent" allItems={silentAll} items={silent} sortLabel="점수순"
              getTag={(d,vd)=>{
                const dm=getDualMomentum(d);return dm.signal==='STRONG BUY'?'STRONG BUY':seTt(d)===8?'SEPA 8/8':'추세+모멘텀';
              }}
              getReason={(d,vd)=>{
                const dm=getDualMomentum(d);
                const parts=[];
                parts.push('SEPA '+seTt(d)+'/8 상승추세');
                if(dm.r3m>0) parts.push('3M +'+dm.r3m+'% 수익');
                parts.push('아직 주목 안 받는 중');
                return parts.join(' · ');
              }}
            />
            <Card icon="🎯" title="보조지표 올그린" color="#e599f7" cardKey="tripleGreen" allItems={tripleGreenAll} items={tripleGreen} sortLabel="점수순"
              getTag={()=>'🟢🟢🟢'}
              getReason={(d,vd)=>{
                const ind=d._indicators;if(!ind)return '';
                const parts=[];
                parts.push('볼린저 스퀴즈('+ind.bb.width+'%) — 큰 움직임 임박');
                parts.push(ind.macd.signal==='golden'?'MACD 골든크로스 — 상승 전환!':'MACD 상승 '+ind.macd.crossDays+'일차');
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
            <TH onClick={()=>hs("f")} a={sc==="f"} c tip="펀더멘털 종합점수 (A~F). 매출성장·이익률·재무건전성 기반">펀더</TH>
            <TH onClick={()=>hs("vd")} a={sc==="vd"} c tip="6개 엔진 합산 최종 등급 (100점 만점). 최강85+·매수65~84·관심50~64·관망35~49·위험~34">종합</TH>
            {(view==="dual"||view==="mf") && <>
              <TH onClick={()=>hs("mf")} a={sc==="mf"} c tip="멀티팩터(MF) 점수. EPS성장·FCF·ROE·부채비율 등 펀더멘털 10pt 배점">MF</TH>
              <TH c tip="MF 추세 방향. 단기·중기·장기 현금흐름 방향성">방향</TH>
            </>}
            {(view==="dual"||view==="sepa") && <>
              <TH onClick={()=>hs("sepa")} a={sc==="sepa"} c tip="Minervini SEPA 트렌드 템플릿. 8개 조건 충족 수 (8/8 = 완벽한 상승추세)">SEPA</TH>
              <TH c tip="SEPA 스테이지 판정. Stage2 = 상승단계, Stage1/3/4 = 비매수 구간">판정</TH>
            </>}
            {(view==="dual"||view==="dm") && <>
              <TH onClick={()=>hs("dm")} a={sc==="dm"} c tip="듀얼모멘텀 신호. 절대모멘텀(수익률>0) + 상대모멘텀(SPY/KOSPI 초과) 결합 판정">DM신호</TH>
              <TH onClick={()=>hs("rs")} a={sc==="rs"} c tip="상대강도(RS). 섹터 내 순위 기반. 낮을수록 섹터 1등에 가까움">RS</TH>
              <TH c tip="3M/6M/12M 모멘텀 추세 방향 요약">추세</TH>
            </>}
            {view==="vcp" && <>
              <TH c tip="VCP(변동성수축패턴) 상태. 성숙🔥 = 최적 진입 대기, 돌파✅ = 피봇 돌파 완료">VCP</TH><TH c tip="VCP 피봇(돌파 기준가). 이 가격 위에서 거래량 동반 시 매수 신호">피봇</TH><TH c tip="현재가와 피봇의 거리(%). 낮을수록 매수 타이밍에 가까움">근접</TH>
            </>}
            {view==="cf" && <>
              <TH onClick={()=>hs("cf")} a={sc==="cf"} c tip="단기 현금흐름 방향 (최근 분기)">단기</TH>
              <TH c tip="중기 현금흐름 방향 (2~4분기)">중기</TH><TH c tip="장기 현금흐름 방향 (연간)">장기</TH>
            </>}
            <TH c tip="EPS성장·매출성장·ROE 요약 배지">성장/재무</TH>
            <TH c tip="거래량 엔진 신호. 바닥매집·돌파상승(+) / 고점이탈·매도압력(-) 패턴 감지">거래량</TH>
            <TH c tip="보조지표 3개 신호등. 볼린저·MACD·OBV 방향 (🟢우호적 / 🔴악화)">신호</TH>
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
                      {/* 종합 등급 — 최종 판단, 가장 크게 */}
                      <div style={{fontSize:isMobile?11:14,fontWeight:900,color:vd.color}}>{vd.verdict}</div>
                      <div style={{fontSize:isMobile?8:10,fontWeight:700,color:vd.color,fontFamily:"'JetBrains Mono'",opacity:0.85}}>{vd.totalPt}<span style={{fontSize:isMobile?7:8,fontWeight:400,opacity:0.5}}>pt</span></div>
                      {/* ExecTag — 실행 상태 (중간 크기, 실행색) */}
                      {d._execTag && (()=>{
                        const tC={'BUY NOW':'#00e676','BUY ON BREAKOUT':'#448aff','WATCH':'#ffd600','AVOID':'#f85149'}[d._execTag]||'#aaa';
                        const tL={'BUY NOW':'⚡NOW','BUY ON BREAKOUT':'📈BRK','WATCH':'👀WATCH','AVOID':'🚫AVOID'}[d._execTag]||d._execTag;
                        return <div style={{fontSize:isMobile?7:9,fontWeight:800,color:tC,padding:'1px 4px',borderRadius:3,background:tC+'18',marginTop:2,display:'inline-block'}}>{tL}</div>;
                      })()}
                      {/* Gate/Risk — 작게 */}
                      {vd.details.gatePenalty > 0 && <div style={{fontSize:isMobile?6:7,color:'#f85149',marginTop:1}}>Gate-{vd.details.gatePenalty}</div>}
                      {vd.details.riskPenalty > 0 && <div style={{fontSize:isMobile?6:7,color:'#ff922b',marginTop:1}}>⚠-{vd.details.riskPenalty}</div>}
                    </td>
                    {(view==="dual"||view==="mf") && <>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={mfTs(d)} g={2.5} r={1.5}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?10:12,padding:"1px 6px",borderRadius:3,background:mfTd(d)==="매수"?"rgba(63,185,80,.12)":"rgba(248,81,73,.12)",color:mfTd(d)==="매수"?"#3fb950":"#f85149"}}>{mfTd(d)}{mfAl(d)?" ⚡":""}</span></td>
                    </>}
                    {(view==="dual"||view==="sepa") && <>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><Badge v={seTt(d)} g={8} r={7}/></td>
                      <td style={{padding:"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?9:11,padding:"1px 5px",borderRadius:3,background:seV(d)==="매수준비"?"rgba(63,185,80,.12)":seV(d)==="워치리스트"?"rgba(210,153,34,.12)":"rgba(248,81,73,.12)",color:seV(d)==="매수준비"?"#3fb950":seV(d)==="워치리스트"?"#d29922":"#f85149"}}>{seV(d)}</span></td>
                    </>}
                    {(view==="dual"||view==="dm") && <>
                      {/* DM신호 — 참고 배지, 작게 표시 */}
                      <td style={{padding:isMobile?"3px 2px":"6px 5px",textAlign:"center"}}><span style={{fontSize:isMobile?8:10,padding:isMobile?"1px 3px":"1px 5px",borderRadius:3,background:dm.signalColor+"15",color:dm.signalColor,fontWeight:700,whiteSpace:"nowrap",opacity:0.9}}>{dm.signal}</span></td>
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
        const D={
          cashKRW:Number(assetDraft.cashKRW)||0, cashUSD:Number(assetDraft.cashUSD)||0,
          fundKRW:Number(assetDraft.fundKRW)||0, fundUSD:Number(assetDraft.fundUSD)||0,
          otherKRW:Number(assetDraft.otherKRW)||0,otherUSD:Number(assetDraft.otherUSD)||0,
          fxRate:Number(assetDraft.fxRate)||1380,
        };
        const fx=D.fxRate;
        /* 보유종목 KR/US 평가금액 자동 계산 */
        let portKRW=0,portUSD=0;
        portfolio.forEach(p=>{
          const s=stocks.find(d=>d.t===p.ticker);
          if(s&&s.p){if(s.k)portKRW+=s.p*p.qty;else portUSD+=s.p*p.qty;}
        });
        /* 자산 항목 */
        const items=[
          {label:"🇺🇸 미국주식",krw:portUSD*fx,usd:portUSD,color:"#4dabf7",auto:true},
          {label:"🇰🇷 한국주식",krw:portKRW,usd:portKRW/fx,color:"#ff922b",auto:true},
          {label:"📦 펀드/연금",krw:D.fundKRW+D.fundUSD*fx,usd:D.fundUSD+D.fundKRW/fx,color:"#bc8cff",auto:false},
          {label:"💵 현금(예비군)",krw:D.cashKRW+D.cashUSD*fx,usd:D.cashUSD+D.cashKRW/fx,color:"#ffd43b",auto:false},
          {label:"🏠 기타자산",krw:D.otherKRW+D.otherUSD*fx,usd:D.otherUSD+D.otherKRW/fx,color:"#8b949e",auto:false},
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
        const iSt={padding:"6px 10px",borderRadius:5,border:"1px solid #30363d",background:"#0d1117",color:"#e6edf3",fontSize:13,fontFamily:"'JetBrains Mono'",outline:"none",width:"100%",boxSizing:"border-box"};
        return <div style={{maxWidth:960,margin:"0 auto",padding:isMobile?"10px 14px":"16px 24px"}}>
          <div style={{fontSize:isMobile?16:20,fontWeight:900,color:"#e6edf3",marginBottom:4}}>💰 자산관리</div>
          <div style={{fontSize:11,color:"#484f58",marginBottom:14}}>보유종목 자동 연계 · 시장필터 Risk 상태 반영</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:12}}>
            {/* 왼쪽: 입력 */}
            <div>
              {/* 환율 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:8,border:"1px solid #30363d"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#ffd43b"}}>💱 환율 (원/달러)</span>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <input type="number" value={assetDraft.fxRate}
                      onChange={e=>setAssetDraft(p=>({...p,fxRate:e.target.value}))}
                      onBlur={e=>commitAsset('fxRate',e.target.value)}
                      style={{...iSt,width:100,textAlign:"right",color:"#ffd43b",border:"1px solid #ffd43b55"}}/>
                    <span style={{fontSize:11,color:"#484f58"}}>원</span>
                  </div>
                </div>
                <div style={{fontSize:10,color:"#484f58",marginTop:4}}>달러 자산 ↔ 원화 자동 환산에 사용</div>
              </div>
              {/* 현금 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>💵 현금 (예비군)</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="number" value={assetDraft.cashKRW}
                      onChange={e=>setAssetDraft(p=>({...p,cashKRW:e.target.value}))}
                      onBlur={e=>commitAsset('cashKRW',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="number" value={assetDraft.cashUSD}
                      onChange={e=>setAssetDraft(p=>({...p,cashUSD:e.target.value}))}
                      onBlur={e=>commitAsset('cashUSD',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                </div>
              </div>
              {/* 펀드/연금 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>📦 펀드 / 연금</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="number" value={assetDraft.fundKRW}
                      onChange={e=>setAssetDraft(p=>({...p,fundKRW:e.target.value}))}
                      onBlur={e=>commitAsset('fundKRW',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="number" value={assetDraft.fundUSD}
                      onChange={e=>setAssetDraft(p=>({...p,fundUSD:e.target.value}))}
                      onBlur={e=>commitAsset('fundUSD',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                </div>
              </div>
              {/* 기타자산 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:6}}>🏠 기타 자산</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>원화 ₩</div>
                    <input type="number" value={assetDraft.otherKRW}
                      onChange={e=>setAssetDraft(p=>({...p,otherKRW:e.target.value}))}
                      onBlur={e=>commitAsset('otherKRW',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                  <div>
                    <div style={{fontSize:10,color:"#484f58",marginBottom:3}}>달러 $</div>
                    <input type="number" value={assetDraft.otherUSD}
                      onChange={e=>setAssetDraft(p=>({...p,otherUSD:e.target.value}))}
                      onBlur={e=>commitAsset('otherUSD',e.target.value)}
                      placeholder="0" style={iSt}/>
                  </div>
                </div>
              </div>
              {/* 메모 */}
              <div style={{background:"#161b22",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
                <div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:4}}>📝 메모</div>
                <textarea value={assetDraft.memo}
                  onChange={e=>setAssetDraft(p=>({...p,memo:e.target.value}))}
                  onBlur={e=>commitAsset('memo',e.target.value)}
                  placeholder="자산 메모..." rows={2}
                  style={{width:"100%",padding:"6px 10px",borderRadius:5,border:"1px solid #30363d",background:"#0d1117",color:"#8b949e",fontSize:12,resize:"vertical",outline:"none",boxSizing:"border-box"}}/>
              </div>
              <div style={{fontSize:10,color:"#484f58"}}>🟢 미국/한국주식은 보유종목 탭에서 자동 계산</div>
            </div>
            {/* 오른쪽: 현황 */}
            <div>
              {/* ── 계좌 상태 해석 카드 ── */}
              {(()=>{
                const cashKRW2=D.cashKRW+D.cashUSD*fx;
                const cashPct=totalKRW>0?(cashKRW2/totalKRW*100):0;
                const stockKRW=portKRW+portUSD*fx;
                const stockPct=totalKRW>0?(stockKRW/totalKRW*100):0;
                const topSec=secList[0];
                const topSecPct=topSec&&secTotal>0?(topSec[1]/secTotal*100):0;
                const mode=MKT.health?.mode||'';
                const msgs=[];
                // 현금 비중 해석
                if(cashPct>=70)msgs.push({icon:'💵',text:'현금 비중 '+cashPct.toFixed(1)+'% — 매우 높음',sub:mode.includes('Risk On')?'현재 Risk On → 추가 매수 여력 충분':'시장 상태 확인 후 투입 검토',color:'#ffd43b'});
                else if(cashPct>=40)msgs.push({icon:'💵',text:'현금 비중 '+cashPct.toFixed(1)+'% — 적정',sub:'추가 매수 가능 범위',color:'#3fb950'});
                else if(cashPct<15)msgs.push({icon:'💵',text:'현금 비중 '+cashPct.toFixed(1)+'% — 낮음',sub:'신규 진입 여력 제한 — 기존 보유 관리 집중',color:'#f85149'});
                // 주식 집중도
                if(stockPct>60)msgs.push({icon:'📈',text:'주식 비중 '+stockPct.toFixed(1)+'% — 공격적',sub:mode.includes('Risk Off')||mode.includes('Defensive')?'시장 Risk Off — 비중 축소 검토':'추세 유지 중 문제 없음',color:mode.includes('Risk Off')?'#f85149':'#8b949e'});
                // 섹터 집중 경고
                if(topSecPct>=60&&topSec)msgs.push({icon:'⚠️',text:'섹터 편중: '+topSec[0]+' '+topSecPct.toFixed(0)+'%',sub:'신규 매수는 비'+topSec[0]+' 섹터 우선 검토',color:'#ff922b'});
                else if(topSecPct>=40&&topSec)msgs.push({icon:'🏭',text:topSec[0]+' 집중도 '+topSecPct.toFixed(0)+'%',sub:'섹터 분산 여지 있음',color:'#ffd43b'});
                if(!msgs.length)return null;
                return <div style={{background:"#161b22",border:"1px solid #30363d",borderRadius:8,padding:"10px 12px",marginBottom:10}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#58a6ff",marginBottom:6}}>🧠 계좌 상태 해석</div>
                  {msgs.map((m,i)=><div key={i} style={{display:"flex",alignItems:"flex-start",gap:6,padding:"5px 0",borderBottom:i<msgs.length-1?"1px solid #21262d22":"none"}}>
                    <span style={{fontSize:13,flexShrink:0}}>{m.icon}</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:m.color}}>{m.text}</div>
                      <div style={{fontSize:9,color:"#8b949e",marginTop:1}}>{m.sub}</div>
                    </div>
                  </div>)}
                </div>;
              })()}
              {/* 전체 자산 현황 테이블 */}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",marginBottom:10}}>📊 전체 자산 현황</div>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:isMobile?10:12}}>
                  <thead><tr style={{borderBottom:"2px solid #21262d"}}>
                    {["자산 구분","원화 환산","달러 환산","비중","그래프"].map(h=>
                      <th key={h} style={{textAlign:h==="자산 구분"?"left":"right",padding:"4px 5px",color:"#484f58",fontWeight:600,whiteSpace:"nowrap"}}>{h}</th>
                    )}
                  </tr></thead>
                  <tbody>
                    {items.map((item,i)=>{
                      const pct=totalKRW>0?(item.krw/totalKRW*100):0;
                      return <tr key={i} style={{borderBottom:"1px solid #21262d22"}}>
                        <td style={{padding:"5px 5px",fontWeight:600,color:item.color,fontSize:isMobile?10:12}}>
                          {item.label}{item.auto&&<span style={{fontSize:9,color:"#484f58",marginLeft:3}}>자동</span>}
                        </td>
                        <td style={{textAlign:"right",padding:"5px 5px",fontFamily:"'JetBrains Mono'",fontSize:isMobile?10:12}}>
                          ₩{Math.round(item.krw).toLocaleString()}
                        </td>
                        <td style={{textAlign:"right",padding:"5px 5px",fontFamily:"'JetBrains Mono'",fontSize:isMobile?10:12,color:"#8b949e"}}>
                          ${item.usd.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}
                        </td>
                        <td style={{textAlign:"right",padding:"5px 5px",fontWeight:700,color:item.color}}>
                          {pct.toFixed(1)}%
                        </td>
                        <td style={{padding:"5px 5px",minWidth:60}}>
                          <div style={{background:"#21262d",borderRadius:3,height:8,overflow:"hidden"}}>
                            <div style={{background:item.color,height:"100%",width:pct+"%",borderRadius:3,transition:"width 0.3s"}}/>
                          </div>
                        </td>
                      </tr>;
                    })}
                    <tr style={{borderTop:"2px solid #21262d"}}>
                      <td style={{padding:"6px 5px",fontWeight:800,color:"#e6edf3",fontSize:isMobile?10:13}}>합계</td>
                      <td style={{textAlign:"right",padding:"6px 5px",fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'",fontSize:isMobile?10:13}}>
                        ₩{Math.round(totalKRW).toLocaleString()}
                      </td>
                      <td style={{textAlign:"right",padding:"6px 5px",fontWeight:800,color:"#3fb950",fontFamily:"'JetBrains Mono'",fontSize:isMobile?10:13}}>
                        ${(totalKRW/fx).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,",")}
                      </td>
                      <td colSpan={2}/>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* 투자 여력 */}
              <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12,marginBottom:10}}>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",marginBottom:8}}>🎯 투자 여력</div>
                {/* 시장 상태 연동 해석 */}
                {(()=>{
                  const mode=MKT.health?.mode||'';
                  const krMode=MKT.krHealth?.mode||'';
                  const usPct=MKT.maxPositionPct??100;
                  const krPct2=MKT.krMaxPositionPct??100;
                  // 권장 비중: Risk On=100%, Neutral=60%, Risk Off=30%, Defensive=0%
                  const usRec=mode.includes('Risk On')?1.0:mode.includes('Neutral')?0.6:mode.includes('Risk Off')?0.3:0.1;
                  const krRec=krMode.includes('Risk On')?1.0:krMode.includes('Neutral')?0.6:krMode.includes('Risk Off')?0.3:0.1;
                  const usRecommended=Math.round(usCapacity*usRec/fx);
                  const krRecommended=Math.round(krCapacity*krRec);
                  const modeColor=mode.includes('Risk On')?'#3fb950':mode.includes('Neutral')?'#ffd43b':'#f85149';
                  const krModeColor=krMode.includes('Risk On')?'#3fb950':krMode.includes('Neutral')?'#ffd43b':'#f85149';
                  return <>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                      <div style={{background:"#161b22",borderRadius:8,padding:"8px 10px",border:"1px solid #4dabf755"}}>
                        <div style={{fontSize:10,color:"#4dabf7",fontWeight:700,marginBottom:3}}>🇺🇸 미국주식 가용</div>
                        <div style={{fontSize:14,fontWeight:900,color:"#4dabf7",fontFamily:"'JetBrains Mono'"}}>${Math.round(usCapacity/fx).toLocaleString()}</div>
                        <div style={{fontSize:10,color:"#484f58",marginTop:2}}>≈ ₩{Math.round(usCapacity).toLocaleString()}</div>
                        <div style={{borderTop:"1px solid #21262d",marginTop:6,paddingTop:6}}>
                          <div style={{fontSize:9,color:"#484f58"}}>시장 상태: <span style={{color:modeColor,fontWeight:700}}>{mode||'미확인'}</span></div>
                          <div style={{fontSize:9,color:"#4dabf7",marginTop:2}}>권장 집행: <span style={{fontWeight:800,fontFamily:"'JetBrains Mono'"}}>${usRecommended.toLocaleString()}</span> ({Math.round(usRec*100)}%)</div>
                        </div>
                      </div>
                      <div style={{background:"#161b22",borderRadius:8,padding:"8px 10px",border:"1px solid #ff922b55"}}>
                        <div style={{fontSize:10,color:"#ff922b",fontWeight:700,marginBottom:3}}>🇰🇷 한국주식 가용</div>
                        <div style={{fontSize:14,fontWeight:900,color:"#ff922b",fontFamily:"'JetBrains Mono'"}}>₩{Math.round(krCapacity).toLocaleString()}</div>
                        <div style={{fontSize:10,color:"#484f58",marginTop:2}}>≈ ${Math.round(krCapacity/fx).toLocaleString()}</div>
                        <div style={{borderTop:"1px solid #21262d",marginTop:6,paddingTop:6}}>
                          <div style={{fontSize:9,color:"#484f58"}}>시장 상태: <span style={{color:krModeColor,fontWeight:700}}>{krMode||'미확인'}</span></div>
                          <div style={{fontSize:9,color:"#ff922b",marginTop:2}}>권장 집행: <span style={{fontWeight:800,fontFamily:"'JetBrains Mono'"}}>₩{krRecommended.toLocaleString()}</span> ({Math.round(krRec*100)}%)</div>
                        </div>
                      </div>
                    </div>
                    {!MKT.loaded&&<div style={{fontSize:9,color:"#484f58",textAlign:"center",padding:"4px 0"}}>⚠️ 시장필터 실행 전 — 권장 집행 한도는 시장필터 갱신 후 정확해집니다</div>}
                  </>;
                })()}
              </div>
              {/* 섹터 분산 */}
              {secList.length>0&&<div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:10,padding:12}}>
                <div style={{fontSize:13,fontWeight:800,color:"#e6edf3",marginBottom:8}}>🏭 섹터 분산</div>
                {secList.map(([sec,val],i)=>{
                  const pct=secTotal>0?(val/secTotal*100):0;
                  return <div key={sec} style={{marginBottom:6}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                      <span style={{fontSize:11,color:SC[i%10]}}>{sec}</span>
                      <span style={{fontSize:11,fontWeight:700,color:SC[i%10],fontFamily:"'JetBrains Mono'"}}>{pct.toFixed(1)}%</span>
                    </div>
                    <div style={{background:"#21262d",borderRadius:3,height:6,overflow:"hidden"}}>
                      <div style={{background:SC[i%10],height:"100%",width:pct+"%",borderRadius:3}}/>
                    </div>
                  </div>;
                })}
                {/* 섹터 편중 경고 */}
                {(()=>{
                  const top=secList[0];
                  if(!top)return null;
                  const topPct=secTotal>0?(top[1]/secTotal*100):0;
                  if(topPct<40)return null;
                  const isHigh=topPct>=60;
                  return <div style={{marginTop:10,padding:"7px 10px",background:isHigh?"#ff922b0d":"#ffd43b08",border:"1px solid "+(isHigh?"#ff922b44":"#ffd43b33"),borderRadius:6}}>
                    <div style={{fontSize:11,fontWeight:800,color:isHigh?"#ff922b":"#ffd43b"}}>
                      {isHigh?"🚨":"⚠️"} {isHigh?"집중도 높음":"편중 주의"}: {top[0]} {topPct.toFixed(0)}%
                    </div>
                    <div style={{fontSize:9,color:"#8b949e",marginTop:3}}>동일 섹터 편중 상태 — 신규 매수는 비{top[0]} 섹터 우선 검토</div>
                    {secList.length===1&&<div style={{fontSize:9,color:"#f85149",marginTop:2}}>⛔ 보유 종목 전체가 단일 섹터 — 분산 리스크 없음</div>}
                  </div>;
                })()}
              </div>}
            </div>
          </div>
        </div>;
      })()}

      {/* ============ 가이드 탭 ============ */}
      {tab==="guide" && <div style={{maxWidth:900,margin:"0 auto",padding:isMobile?"12px 14px":"20px 24px"}}>

        {/* 헤더 */}
        <div style={{marginBottom:20}}>
          <div style={{fontSize:isMobile?18:22,fontWeight:900,color:"#e6edf3"}}>📖 듀얼엔진 프로 사용 가이드</div>
          <div style={{fontSize:11,color:"#484f58",marginTop:4,fontFamily:"'JetBrains Mono'"}}>v1.5.3 · {stocks.length}종목 · 🇺🇸{stocks.filter(d=>!d.k).length} + 🇰🇷{stocks.filter(d=>d.k).length}</div>
        </div>

        {/* ① 3단계 읽는 법 */}
        <div style={{background:"#161b22",border:"2px solid #58a6ff44",borderRadius:12,padding:18,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#58a6ff",marginBottom:14}}>🔑 이 프로그램을 읽는 3단계</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr 1fr",gap:10}}>
            {[
              {step:"1",icon:"🔍",title:"종목의 질 확인",desc:"SEPA·DM·MF 점수가 높은가?",note:"점수 높음 = 조건 양호"},
              {step:"2",icon:"📍",title:"지금 자리 확인",desc:"VCP 성숙? ExecTag는 BRK/NOW?",note:"자리 맞아야 진입"},
              {step:"3",icon:"✅",title:"손절·비중 확인 후 진입",desc:"시장필터 확인 → 체크리스트 통과",note:"두 가지 모두 맞으면 매수"},
            ].map(s=>(
              <div key={s.step} style={{background:"#0d1117",borderRadius:8,padding:12,display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{width:24,height:24,borderRadius:"50%",background:"#58a6ff",color:"#0d1117",fontWeight:900,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{s.step}</div>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#e6edf3",marginBottom:2}}>{s.icon} {s.title}</div>
                  <div style={{fontSize:11,color:"#8b949e",lineHeight:1.5}}>{s.desc}</div>
                  <div style={{fontSize:10,color:"#484f58",marginTop:3}}>{s.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ② 탭별 역할 */}
        <div style={{background:"#0d1117",border:"1px solid #58a6ff22",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#58a6ff",marginBottom:12}}>🗂 탭별 역할</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {tab:"📊 메인",role:"지금 강한 종목을 찾는 화면",note:"점수순 정렬 · AI추천 4섹션"},
              {tab:"👁 워치리스트",role:"곧 볼 종목 + 약해진 종목 추적",note:"30일 등급 변화 자동 감지"},
              {tab:"💼 보유종목",role:"손절선 추적 — 이탈·임박·안전 상태",note:"진입손절 -7% / 트레일링 -9% 자동 계산"},
              {tab:"🌐 시장필터",role:"오늘 공격 / 중립 / 방어 판단",note:"SPY·VIX·KOSPI·섹터 분석"},
              {tab:"💰 자산관리",role:"전체 계좌 현황 + 투자 여력 계산",note:"시장필터 Risk 상태 자동 반영"},
              {tab:"🧮 포지션계산기",role:"권장 비중 + 매수 수량 계산",note:"총자산 × 시장배수 × 점수배수"},
              {tab:"✅ 체크리스트",role:"매수 전 4엔진 체크 (종목 선택 시 자동)",note:"Hard Stop / Soft Check / 실행 규칙"},
            ].map(r=>(
              <div key={r.tab} style={{display:"flex",alignItems:"center",gap:10,padding:"7px 10px",background:"#161b22",borderRadius:7}}>
                <div style={{fontSize:12,fontWeight:700,color:"#e6edf3",minWidth:isMobile?110:130}}>{r.tab}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#c9d1d9"}}>{r.role}</div>
                  <div style={{fontSize:10,color:"#484f58",marginTop:1}}>{r.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ③ 점수 엔진 테이블 */}
        <div style={{background:"#0d1117",border:"1px solid #3fb95022",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#3fb950",marginBottom:12}}>⚙️ 점수 엔진 (100점 만점)</div>
          <div style={{display:"flex",flexDirection:"column",gap:0,borderRadius:8,overflow:"hidden",border:"1px solid #21262d"}}>
            <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 3fr",background:"#161b22",padding:"6px 12px",fontSize:10,color:"#484f58",fontWeight:700}}>
              <span>엔진</span><span style={{textAlign:"center"}}>배점</span><span>의미 / 해석 기준</span>
            </div>
            {[
              {e:"SEPA",pt:"30pt",color:"#58a6ff",desc:"Minervini 트렌드 템플릿 8조건 — 150/200MA 위치, MA 정렬, 52주 범위"},
              {e:"듀얼모멘텀 DM",pt:"23pt",color:"#bc8cff",desc:"3M/6M/12M 수익률 vs SPY — 절대+상대 모멘텀 동시 강세"},
              {e:"VCP 패턴",pt:"15pt",color:"#ffd43b",desc:"60일 변동성 수축 — T1>T2>T3 수축 확인, 피봇 돌파 근접"},
              {e:"MF 펀더멘털",pt:"10pt",color:"#3fb950",desc:"FCF·성장·수익성·재무·밸류·경쟁력 — A/B/C/D 등급"},
              {e:"거래량 엔진",pt:"12pt",color:"#ff922b",desc:"52주 위치 + 가격방향 + 거래량 패턴 — 매집 +5 / 이탈 -5"},
              {e:"CF 현금흐름",pt:"5pt",color:"#80cbc4",desc:"단기/중기/장기 현금흐름 컨플루언스"},
              {e:"교차검증",pt:"±5pt",color:"#8b949e",desc:"약점 카운트 기반 감점 — 약점 2개+ 시 감점"},
              {e:"Gate 페널티",pt:"-20pt",color:"#f85149",desc:"핵심 조건 미충족 시 강제 감점 (G1+G2 동시 = -20)"},
            ].map((r,i)=>(
              <div key={r.e} style={{display:"grid",gridTemplateColumns:"2fr 1fr 3fr",padding:"8px 12px",background:i%2===0?"#0d1117":"#0a0f14",borderTop:"1px solid #21262d22",alignItems:"center"}}>
                <span style={{fontSize:12,fontWeight:700,color:r.color}}>{r.e}</span>
                <span style={{fontSize:12,fontWeight:800,color:r.color,textAlign:"center",fontFamily:"'JetBrains Mono'"}}>{r.pt}</span>
                <span style={{fontSize:11,color:"#8b949e",lineHeight:1.5}}>{r.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ④ 버딕트 + ExecTag 배지형 */}
        <div style={{background:"#0d1117",border:"1px solid #ffd43b22",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#ffd43b",marginBottom:14}}>📈 버딕트 티어 & 실행 태그</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
            {/* 버딕트 */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#484f58",marginBottom:8}}>종목 등급 (종합 점수 기준)</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[
                  {badge:"🔥 최강",score:"85+ 점",color:"#ff6b35",action:"추세 강함 — 자리 확인 후 진입"},
                  {badge:"🟢 매수",score:"65~84점",color:"#3fb950",action:"조건 양호 — 체크리스트 통과 시 진입"},
                  {badge:"🔵 관심",score:"50~64점",color:"#4dabf7",action:"감시 대상 — 조건 강화 중, 기다림"},
                  {badge:"🟡 관망",score:"35~49점",color:"#ffd43b",action:"아직 이름 — 분석 재확인"},
                  {badge:"⛔ 위험",score:"~34점",color:"#f85149",action:"신규매수 비권장"},
                ].map(v=>(
                  <div key={v.badge} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:"#161b22",borderRadius:7,border:"1px solid "+v.color+"22"}}>
                    <span style={{fontSize:13,fontWeight:900,color:v.color,minWidth:60}}>{v.badge}</span>
                    <div>
                      <div style={{fontSize:11,fontWeight:700,color:"#484f58",fontFamily:"'JetBrains Mono'"}}>{v.score}</div>
                      <div style={{fontSize:11,color:"#8b949e"}}>{v.action}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            {/* ExecTag */}
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"#484f58",marginBottom:8}}>ExecTag — 실행 신호 (자리 판단)</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {[
                  {tag:"⚡ NOW",color:"#ffd43b",when:"VCP 성숙 + 피봇 근접 + 거래량 강세",action:"지금 자리 → 진입 가능"},
                  {tag:"📈 BRK",color:"#4dabf7",when:"피봇 근접 — 돌파 감시 중",action:"돌파 확인 후 진입"},
                  {tag:"👀 WATCH",color:"#8b949e",when:"좋은 종목이지만 자리 미충족",action:"아직 기다림 — 나쁜 종목 아님"},
                  {tag:"🚫 AVOID",color:"#f85149",when:"Gate/Risk 페널티 발동",action:"진입 금지"},
                ].map(e=>(
                  <div key={e.tag} style={{padding:"8px 10px",background:"#161b22",borderRadius:7,border:"1px solid "+e.color+"22"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                      <span style={{padding:"2px 8px",borderRadius:5,background:e.color+"18",border:"1px solid "+e.color+"44",color:e.color,fontSize:12,fontWeight:800}}>{e.tag}</span>
                      <span style={{fontSize:11,color:"#e6edf3",fontWeight:600}}>{e.action}</span>
                    </div>
                    <div style={{fontSize:10,color:"#484f58",paddingLeft:2}}>{e.when}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ⑤ 손절 규칙 */}
        <div style={{background:"#0d1117",border:"1px solid #f8514922",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#f85149",marginBottom:12}}>🛡 손절 규칙 (보유종목)</div>
          <div style={{display:"grid",gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:10}}>
            {[
              {title:"진입 손절 (고정)",rule:"매수가 × 0.93",desc:"-7% 고정 · 진입 직후 즉시 적용",color:"#ff922b"},
              {title:"트레일링 손절 (동적)",rule:"최고가 × 0.91",desc:"-9% 추적 · 가격 상승 시 자동 갱신",color:"#f85149"},
            ].map(s=>(
              <div key={s.title} style={{padding:12,background:"#161b22",borderRadius:8,border:"1px solid "+s.color+"22"}}>
                <div style={{fontSize:11,color:"#484f58",marginBottom:4}}>{s.title}</div>
                <div style={{fontSize:20,fontWeight:900,color:s.color,fontFamily:"'JetBrains Mono'",marginBottom:4}}>{s.rule}</div>
                <div style={{fontSize:11,color:"#8b949e"}}>{s.desc}</div>
              </div>
            ))}
          </div>
          <div style={{marginTop:10,display:"flex",gap:8,flexWrap:"wrap"}}>
            {[
              {st:"이탈 ❗",desc:"현재가 < 손절선 → 즉시 매도",color:"#f85149"},
              {st:"임박 ⚠️",desc:"손절선까지 3% 이내",color:"#ff922b"},
              {st:"근접",desc:"7% 이내",color:"#ffd43b"},
              {st:"안전 ✅",desc:"여유 있음",color:"#3fb950"},
            ].map(s=>(
              <div key={s.st} style={{padding:"5px 10px",borderRadius:6,background:s.color+"12",border:"1px solid "+s.color+"33",fontSize:11,color:s.color,fontWeight:600}}>{s.st} <span style={{fontWeight:400,color:"#8b949e"}}>{s.desc}</span></div>
            ))}
          </div>
        </div>

        {/* ⑥ 자주 하는 오해 */}
        <div style={{background:"#0d1117",border:"1px solid #ff922b33",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#ff922b",marginBottom:12}}>⚠️ 자주 하는 오해</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {wrong:"점수가 높으면 지금 사도 된다",right:"점수 높음 = 조건 양호. 자리(VCP·ExecTag)가 맞아야 진입"},
              {wrong:"WATCH는 별로인 종목이다",right:"WATCH = 좋은 종목인데 아직 자리 아님. 계속 감시 필요"},
              {wrong:"보유 판정과 신규 매수 판정이 같다",right:"보유 판정은 '유지 여부', 신규 판정은 '진입 여부' — 기준이 다름"},
              {wrong:"시장필터가 방어여도 좋은 종목은 산다",right:"방어 모드 = 비중 축소 + 신규 최소화. 선별만 허용"},
              {wrong:"최강(🔥)이면 추격해도 된다",right:"최강도 고점 근처면 AVOID. ExecTag 항상 함께 확인"},
            ].map((m,i)=>(
              <div key={i} style={{padding:"8px 12px",borderRadius:7,background:"#161b22",display:"flex",gap:10,alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:11,color:"#f85149",marginBottom:3}}>❌ "{m.wrong}"</div>
                  <div style={{fontSize:11,color:"#3fb950"}}>✅ {m.right}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ⑦ 일일 루틴 (간소화) */}
        <div style={{background:"#0d1117",border:"1px solid #bc8cff22",borderRadius:12,padding:16,marginBottom:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#bc8cff",marginBottom:12}}>📅 일일 루틴</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {[
              {time:"오전 9시",icon:"🌐",act:"시장필터 갱신 → Risk State 확인",note:"미국장 마감 후 권장"},
              {time:"오전 9시30분",icon:"🔬",act:"분석 실행 (1회/일)",note:"289종목 · 약 3~5분"},
              {time:"장중",icon:"⚡",act:"실시간 가격 자동 갱신 (5초)",note:"점수는 캐시 유지"},
              {time:"오후 3시30분",icon:"🛡",act:"보유종목 손절선 체크",note:"이탈/임박 종목 우선"},
              {time:"수시",icon:"👁",act:"워치리스트 등급 변화 확인",note:"업그레이드 집중 감시"},
            ].map(r=>(
              <div key={r.time} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 10px",background:"#161b22",borderRadius:7}}>
                <div style={{fontSize:18,width:24,textAlign:"center",flexShrink:0}}>{r.icon}</div>
                <div style={{minWidth:isMobile?90:110,fontSize:11,color:"#bc8cff",fontFamily:"'JetBrains Mono'",fontWeight:700}}>{r.time}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,color:"#c9d1d9"}}>{r.act}</div>
                  <div style={{fontSize:10,color:"#484f58"}}>{r.note}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ⑧ FAQ */}
        <div style={{background:"#0d1117",border:"1px solid #21262d",borderRadius:12,padding:16}}>
          <div style={{fontSize:13,fontWeight:800,color:"#8b949e",marginBottom:12}}>💬 FAQ</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[
              {q:"분석은 얼마나 자주 해야 하나요?",a:"1일 1회 권장. 점수는 일봉 기반이므로 분 단위 재분석 불필요."},
              {q:"한국 주식 가격이 장 중에도 안 바뀌어요",a:"보유종목 탭에서 🔄 가격 갱신 버튼을 누르세요. 자동 갱신은 5초 주기."},
              {q:"점수 체계가 바뀌면 어떻게 되나요?",a:"캐시가 자동 초기화됩니다. 재분석 실행 필요."},
              {q:"미국 주식 가격이 늦게 나와요",a:"Yahoo Finance 간헐적 지연 가능. 새벽 4시 이후는 전일 종가 기준."},
              {q:"SEPA 높고 DM 낮으면 어떻게 판단하나요?",a:"추세는 좋지만 모멘텀 약함. 관심 등급 유지하며 DM 반전 기다림."},
              {q:"이 대시보드는 매매 신호를 주는 건가요?",a:"아닙니다. 투자 판단 보조 도구입니다. 최종 결정은 본인 책임입니다."},
            ].map((f,i)=>(
              <div key={i} style={{padding:"8px 12px",background:"#161b22",borderRadius:7}}>
                <div style={{fontSize:12,fontWeight:700,color:"#e6edf3",marginBottom:4}}>Q. {f.q}</div>
                <div style={{fontSize:11,color:"#8b949e",lineHeight:1.6}}>A. {f.a}</div>
              </div>
            ))}
          </div>
        </div>

      </div>}


      {/* 상세분석 모달 */}
      {showDetail && <StockDetailModal key={detailStock?.t} stock={detailStock} mkt={MKT} onClose={()=>setShowDetail(false)} isWatched={watchlist.includes(detailStock?.t)} onToggleWatch={toggleWatch} gradeHistory={gradeHistory} onCalcPosition={(s)=>{
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
