/* /pages/api/analysis.js
   Heavy analysis: 1년치 데이터로 SEPA + 듀얼모멘텀 + VCP 계산
   하루 1번만 실행 권장 */

const KOSDAQ = new Set(["042700","058470","403870","058610","277810","454910","098460","108490","022100","196170","253840","237690","247540","066970","278470","214450","257720","214150","192820","041190","112040","094480","063170","036930","039030","067310","036540","489790","067160","012510","007660","102120","087010","089030","095340","166090","033100","141080","018290","241710","377300","323410","046440","036800","035600","083650","105840","450190","253450","389260","322000","011930","229640","204320"]);
const KR_ETF = new Set(["069500","229200","114800","251340"]);

function toYahoo(t, k) {
  if (!k) return t;
  if (KR_ETF.has(t)) return t + ".KS";
  if (KOSDAQ.has(t)) return t + ".KQ";
  return t + ".KS";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* 1년치 일봉 데이터 fetch */
async function fetchHistory(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1y`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    const result = json.chart.result[0];
    const ts = result.timestamp || [];
    const q = result.indicators.quote[0];
    const closes = q.close || [];
    const highs = q.high || [];
    const lows = q.low || [];
    const volumes = q.volume || [];
    /* null 제거 후 정렬 */
    const bars = [];
    for (let i = 0; i < ts.length; i++) {
      if (closes[i] != null && highs[i] != null && lows[i] != null) {
        bars.push({ t: ts[i], c: closes[i], h: highs[i], l: lows[i], v: volumes[i] || 0 });
      }
    }
    return bars;
  } catch (e) { clearTimeout(timeout); throw e; }
}

/* ===== SMA 계산 ===== */
function sma(bars, period) {
  if (bars.length < period) return null;
  const slice = bars.slice(-period);
  return slice.reduce((s, b) => s + b.c, 0) / period;
}

/* ===== SEPA 미너비니 8조건 템플릿 ===== */
function calcSEPA(bars) {
  if (bars.length < 200) return { template: 0, conditions: [], stage: 'N/A', verdict: '데이터부족' };

  const price = bars[bars.length - 1].c;
  const sma50 = sma(bars, 50);
  const sma150 = sma(bars, 150);
  const sma200 = sma(bars, 200);

  /* 1개월 전 SMA200 (200일선 우상향 체크) */
  const bars1mAgo = bars.slice(0, -22);
  const sma200_1m = bars1mAgo.length >= 200 ? sma(bars1mAgo, 200) : sma200;

  /* 52주 고가/저가 */
  const last260 = bars.slice(-260);
  const high52 = Math.max(...last260.map(b => b.h));
  const low52 = Math.min(...last260.map(b => b.l));

  const conditions = [
    { id: 1, label: '현재가 > 150일선', ok: price > sma150 },
    { id: 2, label: '현재가 > 200일선', ok: price > sma200 },
    { id: 3, label: '150일선 > 200일선', ok: sma150 > sma200 },
    { id: 4, label: '200일선 우상향', ok: sma200 > sma200_1m },
    { id: 5, label: '50일 > 150일 > 200일', ok: sma50 > sma150 && sma150 > sma200 },
    { id: 6, label: '현재가 > 50일선', ok: price > sma50 },
    { id: 7, label: '52주 저가 +30%↑', ok: price >= low52 * 1.30 },
    { id: 8, label: '52주 고가 -25% 이내', ok: price >= high52 * 0.75 },
  ];

  const template = conditions.filter(c => c.ok).length;

  /* Stage 판별 */
  let stage;
  if (sma50 > sma150 && sma150 > sma200 && sma200 > sma200_1m && price > sma50) {
    stage = 'Stage 2 ✅';
  } else if (sma50 > sma200 && price > sma200) {
    stage = 'Early Stage 2';
  } else if (price < sma200 && sma50 < sma200) {
    stage = 'Stage 4 ❌';
  } else if (price < sma50 && sma50 < sma150) {
    stage = 'Stage 3';
  } else {
    stage = 'Stage 1';
  }

  /* 판정 */
  let verdict;
  if (template >= 8) verdict = '매수준비';
  else if (template >= 7) verdict = '워치리스트';
  else if (template >= 5) verdict = '관찰';
  else verdict = '패스';

  /* RS 근사값 (1 = 매수준비 통과, 0 = 아님) */
  const rs = template >= 7 ? 1 : 0;

  return { template, conditions, stage, verdict, rs, sma50, sma150, sma200, high52, low52, price };
}

/* ===== 듀얼모멘텀 계산 ===== */
function calcMomentum(bars, spyBars) {
  if (bars.length < 130) return { r3m: 0, r6m: 0, r12m: 0 };

  const price = bars[bars.length - 1].c;
  const p3m = bars.length >= 63 ? bars[bars.length - 63].c : bars[0].c;
  const p6m = bars.length >= 126 ? bars[bars.length - 126].c : bars[0].c;
  const p12m = bars[0].c;

  const r3m = Math.round((price / p3m - 1) * 1000) / 10;
  const r6m = Math.round((price / p6m - 1) * 1000) / 10;
  const r12m = Math.round((price / p12m - 1) * 1000) / 10;

  /* SPY 대비 상대강도 */
  let spyR3m = 0, spyR6m = 0;
  if (spyBars && spyBars.length >= 126) {
    const sp = spyBars[spyBars.length - 1].c;
    const sp3 = spyBars.length >= 63 ? spyBars[spyBars.length - 63].c : spyBars[0].c;
    const sp6 = spyBars.length >= 126 ? spyBars[spyBars.length - 126].c : spyBars[0].c;
    spyR3m = Math.round((sp / sp3 - 1) * 1000) / 10;
    spyR6m = Math.round((sp / sp6 - 1) * 1000) / 10;
  }

  return { r3m, r6m, r12m, spyR3m, spyR6m };
}

/* ===== VCP 변동성수축 패턴 ===== */
function calcVCP(bars) {
  if (bars.length < 60) return { t1: 0, t2: 0, t3: 0, baseWeeks: 0, pivot: 0, nearPivot: 99, maturity: '미형성', volDryup: false };

  const price = bars[bars.length - 1].c;

  /* 최근 수축 구간 찾기: 마지막 60일을 3구간으로 나눔 */
  const seg1 = bars.slice(-60, -40); // 가장 오래된
  const seg2 = bars.slice(-40, -20);
  const seg3 = bars.slice(-20);       // 최근

  const range = (seg) => {
    const hi = Math.max(...seg.map(b => b.h));
    const lo = Math.min(...seg.map(b => b.l));
    return lo > 0 ? Math.round((hi / lo - 1) * 1000) / 10 : 0;
  };

  const t1 = range(seg1);
  const t2 = range(seg2);
  const t3 = range(seg3);

  /* 거래량 수축 (dry-up): 가격수축과 함께 거래량도 줄어드는지 */
  const avgVol = (seg) => {
    const vols = seg.map(b => b.v).filter(v => v > 0);
    return vols.length > 0 ? vols.reduce((s, v) => s + v, 0) / vols.length : 0;
  };
  const vol1 = avgVol(seg1);
  const vol3 = avgVol(seg3);
  const volDryup = vol1 > 0 && vol3 < vol1 * 0.7; /* 최근 거래량이 30%+ 감소 */

  /* 피봇: 최근 30일 고점 */
  const last30 = bars.slice(-30);
  const pivot = Math.max(...last30.map(b => b.h));
  const nearPivot = pivot > 0 ? Math.round((pivot / price - 1) * 1000) / 10 : 99;

  /* 베이스 기간: 횡보 구간 (최근 고점 대비 -15% 이내인 기간) */
  let baseStart = bars.length - 1;
  const refHigh = Math.max(...bars.slice(-60).map(b => b.h));
  for (let i = bars.length - 1; i >= Math.max(0, bars.length - 120); i--) {
    if (bars[i].c < refHigh * 0.85) { baseStart = i + 1; break; }
  }
  const baseWeeks = Math.round((bars.length - baseStart) / 5);

  /* 성숙도 판정 (거래량 수축 반영) */
  let maturity;
  if (t1 > t2 && t2 > t3 && t3 < 8 && baseWeeks >= 3) {
    maturity = volDryup ? '성숙🔥' : '성숙';
  } else if (t1 > t2 && t2 >= t3) {
    maturity = '형성중';
  } else {
    maturity = '미형성';
  }

  return { t1, t2, t3, baseWeeks, pivot, nearPivot, maturity, volDryup };
}

/* ===== 거래량 분석 (가격맥락 반영) ===== */
function calcVolume(bars, sepa) {
  if (bars.length < 50) return { avgVol50: 0, avgVol5: 0, volRatio: 0, volTrend: '부족', surgeDay: false, signal: '데이터부족', signalType: 'neutral' };

  const price = bars[bars.length - 1].c;

  /* 50일 평균 거래량 */
  const last50 = bars.slice(-50);
  const avgVol50 = Math.round(last50.reduce((s, b) => s + b.v, 0) / 50);

  /* 최근 5일 평균 거래량 */
  const last5 = bars.slice(-5);
  const avgVol5 = Math.round(last5.reduce((s, b) => s + b.v, 0) / 5);

  /* 거래량 비율 */
  const volRatio = avgVol50 > 0 ? Math.round(avgVol5 / avgVol50 * 100) / 100 : 0;

  /* 최근 5일 중 50일평균의 2배 이상인 날 */
  const surgeDay = last5.some(b => b.v >= avgVol50 * 2);

  /* 당일 거래량 */
  const todayVol = bars[bars.length - 1].v;
  const todayRatio = avgVol50 > 0 ? Math.round(todayVol / avgVol50 * 100) / 100 : 0;

  /* ===== 가격 맥락 분석 ===== */

  /* 1) 가격 방향: 최근 5일 등락 */
  const price5ago = bars[bars.length - 6]?.c || price;
  const priceChg5d = price5ago > 0 ? (price / price5ago - 1) * 100 : 0;
  const priceUp = priceChg5d > 1;    /* 5일간 1%+ 상승 */
  const priceDown = priceChg5d < -1;  /* 5일간 1%+ 하락 */

  /* 2) 가격 위치: 52주 고/저 대비 위치 (0~100%) */
  let positionPct = 50; /* 기본값 */
  if (sepa && sepa.high52 > sepa.low52) {
    positionPct = Math.round((price - sepa.low52) / (sepa.high52 - sepa.low52) * 100);
  }
  const nearBottom = positionPct <= 30;  /* 52주 저점 근처 */
  const nearTop = positionPct >= 80;     /* 52주 고점 근처 */
  const midRange = !nearBottom && !nearTop;

  /* 3) SMA200 대비 위치 */
  const aboveSma200 = sepa ? price > sepa.sma200 : false;

  /* ===== 종합 시그널 판정 ===== */
  let signal, signalType; /* signalType: buy/sell/caution/neutral */

  if (surgeDay || volRatio >= 2.0) {
    /* 거래량 급증 상황 → 가격 맥락으로 해석 */
    if (priceUp && nearBottom) {
      signal = '바닥매집🟢'; signalType = 'buy';
      /* 바닥 근처 + 상승 + 거래량 폭발 = 기관 매집 시작 */
    } else if (priceUp && midRange && aboveSma200) {
      signal = '돌파상승🟢'; signalType = 'buy';
      /* 중간대 + 상승추세 + 거래량 급증 = 건강한 돌파 */
    } else if (priceDown && nearTop) {
      signal = '고점이탈🔴'; signalType = 'sell';
      /* 고점 근처 + 하락 + 거래량 폭발 = 기관 물량 출회 */
    } else if (priceDown && midRange) {
      signal = '매도압력🔴'; signalType = 'sell';
      /* 중간대 + 하락 + 거래량 급증 = 추가 하락 가능 */
    } else if (priceDown && nearBottom) {
      signal = '투매🟡'; signalType = 'caution';
      /* 바닥 + 하락 + 거래량 = 패닉셀 (반등 가능성도 있음) */
    } else if (priceUp && nearTop) {
      signal = '과열주의🟡'; signalType = 'caution';
      /* 고점 + 상승 + 거래량 = 클라이맥스 탑 가능성 */
    } else {
      signal = '급증관찰🟡'; signalType = 'caution';
    }
  } else if (volRatio >= 1.5) {
    /* 거래량 증가 (급증은 아님) */
    if (priceUp) {
      signal = '매집증가'; signalType = 'buy';
    } else if (priceDown) {
      signal = '분산증가'; signalType = 'sell';
    } else {
      signal = '거래증가'; signalType = 'neutral';
    }
  } else if (volRatio < 0.5) {
    /* 거래량 급감 */
    if (priceUp) {
      signal = '추세약화🟡'; signalType = 'caution';
      /* 상승하는데 거래량 급감 = 상승동력 소진 */
    } else if (priceDown) {
      signal = '하락둔화'; signalType = 'neutral';
      /* 하락하는데 거래량 급감 = 매도세 소진, 바닥 가능 */
    } else {
      signal = '거래감소'; signalType = 'neutral';
    }
  } else if (volRatio < 0.8) {
    signal = '거래감소'; signalType = 'neutral';
  } else {
    signal = '보통'; signalType = 'neutral';
  }

  /* volTrend는 메인테이블용 간략 표시 */
  let volTrend;
  if (signalType === 'buy') volTrend = signal;
  else if (signalType === 'sell') volTrend = signal;
  else if (signalType === 'caution') volTrend = signal;
  else if (volRatio >= 1.5) volTrend = '증가';
  else if (volRatio >= 0.8) volTrend = '보통';
  else volTrend = '감소';

  return { avgVol50, avgVol5, volRatio, volTrend, surgeDay, todayVol, todayRatio, signal, signalType, priceChg5d: Math.round(priceChg5d*10)/10, positionPct, nearBottom, nearTop };
}

/* ===== 메인 핸들러 ===== */
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers)) return res.status(400).json({ error: 'tickers required' });

    /* SPY 기준 데이터 먼저 fetch */
    let spyBars = [];
    try { spyBars = await fetchHistory('SPY'); } catch (e) { console.error('SPY fetch fail'); }

    const BATCH = 5;
    const results = {};
    let okCount = 0;

    for (let i = 0; i < tickers.length; i += BATCH) {
      const batch = tickers.slice(i, i + BATCH);

      const promises = batch.map(async (tk) => {
        const sym = toYahoo(tk.t, tk.k);
        try {
          const bars = await fetchHistory(sym);
          const sepa = calcSEPA(bars);
          const mom = calcMomentum(bars, spyBars);
          const vcp = calcVCP(bars);
          const vol = calcVolume(bars, sepa);

          return {
            ticker: tk.t, ok: true,
            data: {
              /* e: SEPA [판정, 스테이지, 템플릿점수, RS] */
              e: [sepa.verdict, sepa.stage, sepa.template, sepa.rs],
              /* r: [3M수익률, 6M수익률, 기존secRank유지] */
              r: [mom.r3m, mom.r6m],
              /* v: [T1, T2, T3, 베이스주, 피봇, 근접%, 성숙도] */
              v: [vcp.t1, vcp.t2, vcp.t3, vcp.baseWeeks, vcp.pivot, vcp.nearPivot, vcp.maturity],
              /* sepa 상세 (조건별) */
              sepaDetail: sepa.conditions,
              /* 모멘텀 상세 */
              momDetail: { r3m: mom.r3m, r6m: mom.r6m, r12m: mom.r12m, spyR3m: mom.spyR3m, spyR6m: mom.spyR6m },
              /* 거래량 분석 */
              volData: { avgVol50: vol.avgVol50, avgVol5: vol.avgVol5, volRatio: vol.volRatio, volTrend: vol.volTrend, surgeDay: vol.surgeDay, todayVol: vol.todayVol, todayRatio: vol.todayRatio, volDryup: vcp.volDryup, signal: vol.signal, signalType: vol.signalType, priceChg5d: vol.priceChg5d, positionPct: vol.positionPct },
            }
          };
        } catch (e) {
          return { ticker: tk.t, ok: false, error: e.message };
        }
      });

      const settled = await Promise.allSettled(promises);
      for (const s of settled) {
        if (s.status === 'fulfilled' && s.value.ok) {
          results[s.value.ticker] = s.value.data;
          okCount++;
        }
      }

      console.log(`[analysis] ${Math.min(i + BATCH, tickers.length)}/${tickers.length}`);
      /* rate limit: 배치 간 2초 대기 */
      if (i + BATCH < tickers.length) await sleep(2000);
    }

    return res.status(200).json({
      ok: okCount,
      total: tickers.length,
      data: results,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
