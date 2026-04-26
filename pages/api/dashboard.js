/* /pages/api/dashboard.js — v2 (totalPt 포함)
 * 듀얼엔진 종목 풀 데이터 노출 엔드포인트
 * - data.js의 D 배열 + 각 종목의 totalPt(종합점수) 계산
 * - Jang's Analyst 등 외부 앱에서 사용
 * - 명관 화면의 "종합" 점수와 동일한 로직
 */
import D from '../../src/data';

// ═══════════════════════════════════════════════════════════════
// App.js의 헬퍼 함수들 — 그대로 복사 (의존성 없음)
// ═══════════════════════════════════════════════════════════════
const seV  = d => d.e[0];
const seSt = d => d.e[1];
const seTt = d => d.e[2];
const vcpMt = d => d.v[6];
const vcpPx = d => d.v[5];
const cfS = d => d.x[0];
const cfM = d => d.x[1];
const cfL = d => d.x[2];

// ═══════════════════════════════════════════════════════════════
// getDualMomentum — App.js 190~275줄 그대로
// ═══════════════════════════════════════════════════════════════
function getDualMomentum(d) {
  const r3m = d.r[0], r6m = d.r[1], secRank = d.r[2];
  const r12m = (d._momDetail && d._momDetail.r12m != null) ? d._momDetail.r12m : 0;
  const spyBench3  = (d._momDetail?.spyR3  != null) ? d._momDetail.spyR3  : 4.2;
  const spyBench6  = (d._momDetail?.spyR6  != null) ? d._momDetail.spyR6  : 8.7;
  const spyBench12 = 18.0;
  
  const absM3  = r3m  > 0;
  const absM6  = r6m  > 0;
  const absM12 = r12m > 0;
  const absScore = (absM3 ? 1 : 0) + (absM6 ? 1 : 0) + (absM12 ? 1 : 0);
  
  const relM3  = r3m  > spyBench3;
  const relM6  = r6m  > spyBench6;
  const relScore = (relM3 ? 1 : 0) + (relM6 ? 1 : 0);
  
  const sepaOK    = seV(d) === "매수준비" || seTt(d) >= 7;
  const sepaWatch = seTt(d) >= 6;
  const stageOK   = (seSt(d) || '').includes("Stage 2");
  
  const secOKforStrong = secRank <= 20;
  let signalScore;
  if (absScore >= 2 && relScore >= 2 && sepaOK && stageOK && secOKforStrong) {
    signalScore = 10;
  } else if (absScore >= 2 && relScore >= 1 && (sepaOK || sepaWatch) && stageOK) {
    signalScore = 8;
  } else if (absScore >= 1 && relScore >= 1 && sepaWatch) {
    signalScore = 6;
  } else if (absScore >= 1 && relScore === 0) {
    signalScore = 4;
  } else {
    signalScore = 2;
  }
  
  return { signalScore };
}

// ═══════════════════════════════════════════════════════════════
// getVerdict — App.js 277~466줄 핵심 로직
// data.js에 없는 동적 데이터(_volData, _gate, _indicators 등)는
// 중립값으로 대체 → 정적 totalPt 추정
// ═══════════════════════════════════════════════════════════════
function getVerdict(d) {
  const mfScore = d.f || 0;
  const mfGrade = mfScore >= 80 ? 'A' : mfScore >= 70 ? 'B' : mfScore >= 60 ? 'C' : 'F';
  const sv = seV(d), st = seTt(d);
  const vm = vcpMt(d) || '';
  const dm = getDualMomentum(d);
  
  // ① SEPA (30점)
  const sepaPt = st === 8 ? 30
    : st === 7 ? 22
    : st === 6 ? 15
    : st === 5 ? 9
    : st >= 3 ? 4
    : 0;
  
  // ② 듀얼모멘텀 (23점)
  const dmPt = dm.signalScore >= 10 ? 23
    : dm.signalScore >= 9 ? 19
    : dm.signalScore >= 7 ? 14
    : dm.signalScore >= 5 ? 8
    : dm.signalScore >= 3 ? 3
    : 0;
  
  // ③ VCP (15점)
  const vcpPt = vm === "성숙🔥" ? 15
    : vm === "돌파✅" ? 10
    : vm.includes("성숙") ? 11
    : vm === "돌파" ? 7
    : vm === "형성중" ? 3
    : 1;
  
  // ④ MF 펀더멘탈 (10점)
  const isETF = d.s === 'ETF';
  let mfPt;
  if (isETF) {
    mfPt = 4;
  } else {
    mfPt = mfScore >= 85 ? 10
      : mfScore >= 75 ? 8
      : mfScore >= 65 ? 6
      : mfScore >= 55 ? 4
      : mfScore >= 40 ? 2
      : 0;
  }
  
  // ⑤ CF 현금흐름 (5점)
  let cfPt;
  if (isETF) {
    cfPt = 3;
  } else {
    const hasFCF = d.b || (cfM(d) >= 2 && cfL(d) >= 2);
    const cfTotal = cfS(d) + cfM(d) + cfL(d);
    cfPt = hasFCF && cfTotal >= 8 ? 5
      : hasFCF && cfTotal >= 5 ? 3
      : hasFCF ? 2
      : 0;
  }
  
  // ⑥ 거래량 (12점) — _volData 없음 → 중립 6점
  const volPt = 6;
  
  // ⑦ 교차검증 (±5점)
  let crossPt = 0;
  const strongCount = [
    sepaPt >= 22,
    dmPt >= 14,
    vcpPt >= 10,
    mfPt >= 6,
  ].filter(Boolean).length;
  
  const weakCount = [
    sepaPt <= 4,
    dmPt <= 3,
    vcpPt <= 1,
    mfPt <= 2,
  ].filter(Boolean).length;
  
  if (strongCount >= 4) crossPt = 5;
  else if (strongCount >= 3) crossPt = 3;
  else if (strongCount >= 2) crossPt = 1;
  
  if (weakCount >= 3) crossPt -= 5;
  else if (weakCount >= 2) crossPt -= 3;
  else if (weakCount >= 1 && strongCount <= 1) crossPt -= 1;
  
  // 당일 급락
  const todayDrop = d.c <= -5;
  if (todayDrop) crossPt -= 1;
  
  const totalPt_raw = sepaPt + dmPt + vcpPt + mfPt + cfPt + volPt + crossPt;
  
  let totalPt = Math.max(0, Math.min(totalPt_raw, 100));
  
  // MF F등급 클램프
  if (!isETF && mfGrade === 'F') totalPt = Math.min(totalPt, 64);
  // CF 약세 클램프
  if (!isETF) {
    const cfAllWeak = cfS(d) <= 1 && cfM(d) <= 1 && cfL(d) <= 1;
    if (cfAllWeak) totalPt = Math.min(totalPt, 69);
  }
  
  // 판정
  let verdict;
  if (totalPt >= 85) verdict = '최강';
  else if (totalPt >= 65) verdict = '매수';
  else if (totalPt >= 50) verdict = '관심';
  else if (totalPt >= 35) verdict = '관망';
  else verdict = '위험';
  
  return { 
    totalPt: Math.round(totalPt * 10) / 10,
    verdict,
    breakdown: { sepaPt, dmPt, vcpPt, mfPt, cfPt, volPt, crossPt }
  };
}

// ═══════════════════════════════════════════════════════════════
// 메인 핸들러
// ═══════════════════════════════════════════════════════════════
export default function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }
  
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  
  try {
    // 각 종목에 totalPt 추가
    const enriched = D.map(stock => {
      try {
        const v = getVerdict(stock);
        return {
          ...stock,
          totalPt: v.totalPt,
          verdict: v.verdict,
        };
      } catch (e) {
        return { ...stock, totalPt: 0, verdict: '계산실패' };
      }
    });
    
    const us = enriched.filter(s => s.k === 0);
    const kr = enriched.filter(s => s.k === 1);
    const high80_total = enriched.filter(s => s.totalPt >= 80).length;
    const high80_funda = enriched.filter(s => s.f >= 80).length;
    
    return res.status(200).json({
      data: enriched,
      meta: {
        total: enriched.length,
        us_count: us.length,
        kr_count: kr.length,
        high_score_count: high80_total,
        high_funda_count: high80_funda,
        timestamp: new Date().toISOString(),
        version: '2.0',
        score_definition: {
          totalPt: '종합 점수 (SEPA+모멘텀+VCP+MF+CF+거래량)',
          f: '펀더멘털 점수 (재무)',
          recommended: 'totalPt'
        }
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
