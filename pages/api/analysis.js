/* pages/api/analysis.js — 듀얼엔진 실시간 분석 API (VCP 자동감지 포함) */
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  const { tickers } = req.body; // [{t:"AAPL",k:false}, ...]
  if (!tickers || !Array.isArray(tickers)) return res.status(400).json({ error: "tickers required" });

  const results = {};
  let ok = 0, fail = 0;

  // 배치 처리 (5개씩, 2초 간격)
  const batchSize = 5;
  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);
    const promises = batch.map(stock => analyzeStock(stock).catch(e => ({ ticker: stock.t, error: e.message })));
    const batchResults = await Promise.all(promises);
    batchResults.forEach(r => {
      if (r && !r.error) { results[r.ticker] = r; ok++; }
      else fail++;
    });
    if (i + batchSize < tickers.length) await sleep(2000);
  }

  return res.status(200).json({ data: results, ok, fail });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ===== Yahoo Finance v8 chart API ===== */
async function fetchChart(ticker, isKR, range = "1y") {
  const symbol = isKR ? `${ticker}.KS` : ticker;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) throw new Error(`Yahoo ${resp.status}`);
  const json = await resp.json();
  const result = json.chart?.result?.[0];
  if (!result?.timestamp) throw new Error("No data");
  
  const ts = result.timestamp;
  const q = result.indicators.quote[0];
  const adj = result.indicators.adjclose?.[0]?.adjclose;
  
  const bars = [];
  for (let i = 0; i < ts.length; i++) {
    if (q.close[i] != null && q.high[i] != null && q.low[i] != null && q.volume[i] != null) {
      bars.push({
        date: new Date(ts[i] * 1000),
        open: q.open[i],
        high: q.high[i],
        low: q.low[i],
        close: adj?.[i] || q.close[i],
        volume: q.volume[i]
      });
    }
  }
  return bars;
}

/* ===== SMA 계산 ===== */
function sma(bars, period) {
  if (bars.length < period) return null;
  let sum = 0;
  for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
  return sum / period;
}

/* ===== SEPA 8조건 템플릿 (Minervini) ===== */
function calcSEPA(bars) {
  if (bars.length < 200) return { count: 0, stage: "데이터부족", conditions: [] };
  
  const cur = bars[bars.length - 1].close;
  const s50 = sma(bars, 50);
  const s150 = sma(bars, 150);
  const s200 = sma(bars, 200);
  
  // 200일선 30일전 값
  const bars30ago = bars.slice(0, -30);
  const s200_30 = bars30ago.length >= 200 ? sma(bars30ago, 200) : s200;
  
  // 52주 고저
  const last252 = bars.slice(-252);
  const h52 = Math.max(...last252.map(b => b.high));
  const l52 = Math.min(...last252.map(b => b.low));
  
  const conditions = [
    cur > s150 && cur > s200,           // 1. 가격>150일>200일
    s150 > s200,                         // 2. 150일>200일
    s200 > s200_30,                      // 3. 200일 상승중
    s50 > s150 && s50 > s200,           // 4. 50일>150일>200일
    cur > s50,                           // 5. 가격>50일
    cur > l52 * 1.30,                    // 6. 52주저점 대비 +30%
    cur > h52 * 0.75,                    // 7. 52주고점 대비 -25% 이내
    s50 > s150                           // 8. 50일>150일 (추가확인)
  ];
  
  const count = conditions.filter(Boolean).length;
  let stage = "Stage 1";
  if (count >= 7) stage = "Stage 2 ✅";
  else if (count >= 5) stage = "Stage 2 진입중";
  else if (cur < s200 && s50 < s200) stage = "Stage 4";
  else if (cur < s50 && s50 > s200) stage = "Stage 3";
  
  let verdict = "관망";
  if (count === 8) verdict = "매수준비";
  else if (count >= 7) verdict = "워치리스트";
  else if (count >= 5) verdict = "관찰";
  
  return { count, stage, verdict, conditions, sma50: s50, sma150: s150, sma200: s200, high52: h52, low52: l52, curPrice: cur };
}

/* ===== 듀얼 모멘텀 ===== */
function calcMomentum(bars, spyBars) {
  if (bars.length < 130) return { r3m: 0, r6m: 0, r12m: 0, absM3: false, absM6: false, relM3: false, relM6: false };
  
  const cur = bars[bars.length - 1].close;
  const m3 = bars.length >= 63 ? bars[bars.length - 63].close : bars[0].close;
  const m6 = bars.length >= 126 ? bars[bars.length - 126].close : bars[0].close;
  const m12 = bars.length >= 252 ? bars[bars.length - 252].close : bars[0].close;
  
  const r3m = +((cur / m3 - 1) * 100).toFixed(1);
  const r6m = +((cur / m6 - 1) * 100).toFixed(1);
  const r12m = +((cur / m12 - 1) * 100).toFixed(1);
  
  // SPY 수익률
  let spyR3 = 4.2, spyR6 = 8.7;
  if (spyBars && spyBars.length >= 126) {
    const sc = spyBars[spyBars.length - 1].close;
    const sm3 = spyBars.length >= 63 ? spyBars[spyBars.length - 63].close : spyBars[0].close;
    const sm6 = spyBars.length >= 126 ? spyBars[spyBars.length - 126].close : spyBars[0].close;
    spyR3 = +((sc / sm3 - 1) * 100).toFixed(1);
    spyR6 = +((sc / sm6 - 1) * 100).toFixed(1);
  }
  
  return {
    r3m, r6m, r12m,
    absM3: r3m > 0, absM6: r6m > 0,
    relM3: r3m > spyR3, relM6: r6m > spyR6,
    spyR3, spyR6
  };
}

/* ===== 🔥 VCP 자동 감지 (v5 — lookback3 + rolling peak + 앵커개선) ===== */
function calcVCP(bars) {
  if (bars.length < 60) return { t1: 0, t2: 0, t3: 0, baseWeeks: 0, pivot: 0, proximity: 99, maturity: "미형성" };
  
  const closes = bars.map(b => b.close);
  const highs = bars.map(b => b.high);
  const lows = bars.map(b => b.low);
  const volumes = bars.map(b => b.volume);
  const n = closes.length;
  const curPrice = closes[n - 1];
  
  // ─── Step 1: 스윙 포인트 감지 (v4 — 2단계) ───
  const swingHighs = [];
  const swingLows = [];
  
  // lookback=3으로 완화 (강한 상승종목에서도 최근 고점 감지)
  for (let i = 2; i < n - 2; i++) {
    let isHigh = true, isLow = true;
    for (let j = 1; j <= 2; j++) {
      if (highs[i] <= highs[i - j] || highs[i] <= highs[i + j]) isHigh = false;
      if (lows[i] >= lows[i - j] || lows[i] >= lows[i + j]) isLow = false;
    }
    if (isHigh) swingHighs.push({ idx: i, price: highs[i] });
    if (isLow) swingLows.push({ idx: i, price: lows[i] });
  }
  
  // 폴백: 최근 90일에 스윙하이가 2개 미만이면 10일 window peak 추가
  if (swingHighs.filter(sh => sh.idx >= n - 90).length < 2) {
    for (let center = Math.max(5, n - 85); center < n - 5; center += 8) {
      let peakIdx = center, peakP = highs[center];
      for (let j = Math.max(0, center - 5); j <= Math.min(n - 1, center + 5); j++) {
        if (highs[j] > peakP) { peakP = highs[j]; peakIdx = j; }
      }
      if (!swingHighs.some(sh => Math.abs(sh.idx - peakIdx) < 5)) {
        swingHighs.push({ idx: peakIdx, price: peakP });
      }
    }
    swingHighs.sort((a, b) => a.idx - b.idx);
  }
  if (swingLows.filter(sl => sl.idx >= n - 90).length < 2) {
    for (let center = Math.max(5, n - 85); center < n - 5; center += 8) {
      let valIdx = center, valP = lows[center];
      for (let j = Math.max(0, center - 5); j <= Math.min(n - 1, center + 5); j++) {
        if (lows[j] < valP) { valP = lows[j]; valIdx = j; }
      }
      if (!swingLows.some(sl => Math.abs(sl.idx - valIdx) < 5)) {
        swingLows.push({ idx: valIdx, price: valP });
      }
    }
    swingLows.sort((a, b) => a.idx - b.idx);
  }
  
  if (swingHighs.length < 1 || swingLows.length < 1) {
    return { t1: 0, t2: 0, t3: 0, baseWeeks: 0, pivot: 0, proximity: 99, maturity: "미형성" };
  }
  
  // ─── Step 2: 앵커 찾기 (v5 — 20%초과 스킵) ───
  let anchor = null;
  const sortedByRecent = [...swingHighs].sort((a, b) => b.idx - a.idx);
  
  // 방법A: 최근 스윙하이부터 역순, -3% 이상 조정
  for (const sh of sortedByRecent) {
    if (sh.price < curPrice * 0.50) continue; // 현재가의 50% 미만 스킵
    if (sh.idx < n - 180) continue; // 180일 이전 스킵
    if (curPrice > sh.price * 1.20) continue; // ★v5: 현재가가 20%↑ = 이미 지나간 베이스, 스킵
    const lowsAfter = swingLows.filter(sl => sl.idx > sh.idx);
    if (lowsAfter.length === 0) continue;
    const minLow = Math.min(...lowsAfter.map(sl => sl.price));
    const drawdown = (sh.price - minLow) / sh.price;
    if (drawdown >= 0.03) { anchor = sh; break; }
  }
  
  // 방법B 폴백: 최근 90일 일간 최고가 → 앵커
  if (!anchor) {
    let maxP = 0, maxI = n - 1;
    for (let i = Math.max(0, n - 90); i < n; i++) {
      if (highs[i] > maxP) { maxP = highs[i]; maxI = i; }
    }
    anchor = { idx: maxI, price: maxP };
  }
  
  // ─── Step 3: 앵커 이후 수축 구간 감지 ───
  const lowsAfterAnchor = swingLows.filter(sl => sl.idx > anchor.idx).sort((a, b) => a.idx - b.idx);
  // 앵커보다 약간 높은 고점도 허용 (5% 이내 반등 = 베이스 안 반등으로 인정)
  const highsAfterAnchor = swingHighs.filter(sh => sh.idx > anchor.idx && sh.price <= anchor.price * 1.05).sort((a, b) => a.idx - b.idx);
  
  const contractions = [];
  
  // T1: 앵커 고점 → 첫 저점
  if (lowsAfterAnchor.length >= 1) {
    const t1Low = lowsAfterAnchor[0];
    const t1Pct = +((1 - t1Low.price / anchor.price) * 100).toFixed(1);
    contractions.push({ pct: t1Pct, highIdx: anchor.idx, lowIdx: t1Low.idx, highPrice: anchor.price, lowPrice: t1Low.price });
    
    // T2: 첫 반등고점 → 두번째 저점
    const h2Candidates = highsAfterAnchor.filter(sh => sh.idx > t1Low.idx);
    if (h2Candidates.length >= 1 && lowsAfterAnchor.length >= 2) {
      const h2 = h2Candidates[0];
      const l2Candidates = lowsAfterAnchor.filter(sl => sl.idx > h2.idx);
      if (l2Candidates.length >= 1) {
        const t2Low = l2Candidates[0];
        const t2Pct = +((1 - t2Low.price / h2.price) * 100).toFixed(1);
        contractions.push({ pct: t2Pct, highIdx: h2.idx, lowIdx: t2Low.idx, highPrice: h2.price, lowPrice: t2Low.price });
        
        // T3: 두번째 반등고점 → 세번째 저점
        const h3Candidates = highsAfterAnchor.filter(sh => sh.idx > t2Low.idx);
        if (h3Candidates.length >= 1) {
          const h3 = h3Candidates[0];
          const l3Candidates = lowsAfterAnchor.filter(sl => sl.idx > h3.idx);
          if (l3Candidates.length >= 1) {
            const t3Low = l3Candidates[0];
            const t3Pct = +((1 - t3Low.price / h3.price) * 100).toFixed(1);
            contractions.push({ pct: t3Pct, highIdx: h3.idx, lowIdx: t3Low.idx, highPrice: h3.price, lowPrice: t3Low.price });
          }
        }
      }
    }
  }
  
  const t1 = contractions[0]?.pct || 0;
  const t2 = contractions[1]?.pct || 0;
  const t3 = contractions[2]?.pct || 0;
  
  // ─── Step 4: 피봇 = 앵커 가격 (v2 수정) ───
  // 피봇 = 베이스의 좌측 고점 = 돌파해야 할 저항선
  const pivot = anchor.price;
  // 양수 = 피봇 아래 (미돌파), 음수 = 피봇 위 (돌파완료)
  const proximity = +((1 - curPrice / pivot) * 100).toFixed(1);
  
  // ─── Step 5: 베이스 기간 ───
  const baseStartIdx = anchor.idx;
  const baseDays = n - 1 - baseStartIdx;
  const baseWeeks = Math.round(baseDays / 5);
  
  // ─── Step 6: 거래량 수축 확인 ───
  const vol10 = volumes.slice(-10).reduce((a, b) => a + b, 0) / 10;
  const vol50 = volumes.slice(-50).reduce((a, b) => a + b, 0) / Math.min(50, volumes.length);
  const volDrying = vol10 < vol50 * 0.7;
  
  // ─── Step 7: 성숙도 판정 (v2 — 돌파 상태 추가) ───
  let maturity = "미형성";
  const alreadyBroken = curPrice > pivot * 1.02;
  
  if (alreadyBroken) {
    // 이미 피봇을 돌파한 종목
    if (contractions.length >= 2 && t1 > t2 && (t3 === 0 || t2 > t3)) maturity = "돌파✅"; // T3 역전 없어야 ✅
    else if (contractions.length >= 1) maturity = "돌파";
  } else if (contractions.length >= 3 && t1 > t2 && t2 > t3 && t3 > 0 && t3 <= 15 && baseWeeks >= 3) {
    maturity = volDrying ? "성숙🔥" : "성숙";
  } else if (contractions.length >= 2 && t1 > t2 && t2 > 0 && baseWeeks >= 2) {
    if (t2 <= 15 && Math.abs(proximity) <= 10) {
      maturity = "성숙";
    } else {
      maturity = "형성중";
    }
  } else if (contractions.length >= 2 && t1 > t2 && t2 > 0) {
    maturity = "형성중";   // 2단계 수축 시작, 기간 짧아도 형성중
  } else if (contractions.length >= 1 && t1 > 0 && t1 <= 40 && baseWeeks >= 1) {
    maturity = "형성중";   // 1단계 수축, 1주 이상이면 형성중 (이전: t1<=35, 2주)
  }
  
  // 추가 필터: 수축률이 너무 크면 VCP가 아님 (폭락)
  if (t1 > 50) maturity = "미형성";
  
  return {
    t1, t2, t3,
    baseWeeks,
    pivot: +pivot.toFixed(2),
    proximity,
    maturity,
    volDrying,
    contractions: contractions.length,
    anchorPrice: anchor.price,
    anchorIdx: anchor.idx
  };
}

/* ===== 보조 지표 3종 (볼린저/MACD/OBV) ===== */
function calcIndicators(bars) {
  if (bars.length < 50) return null;
  const n = bars.length;
  const closes = bars.map(b => b.close);
  const volumes = bars.map(b => b.volume);

  // ── 볼린저 밴드 스퀴즈 ──
  const bbPeriod = 20;
  function calcBBWidth(idx) {
    if (idx < bbPeriod) return 999;
    const slice = closes.slice(idx - bbPeriod, idx);
    const avg = slice.reduce((a, b) => a + b, 0) / bbPeriod;
    const std = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / bbPeriod);
    return avg > 0 ? ((std * 2 * 2) / avg * 100) : 999; // 밴드폭 %
  }
  const curBBW = calcBBWidth(n);
  // 최근 120일(6개월) 밴드폭 중 최소와 비교
  let minBBW = curBBW;
  for (let i = Math.max(bbPeriod, n - 120); i <= n; i++) {
    const w = calcBBWidth(i);
    if (w < minBBW) minBBW = w;
  }
  const bbRatio = minBBW > 0 ? curBBW / minBBW : 5;
  // 현재 밴드폭이 6개월 최소의 1.1배 이내면 스퀴즈
  const bbSignal = bbRatio <= 1.1 ? 'squeeze' : bbRatio <= 1.5 ? 'narrow' : bbRatio <= 2.5 ? 'normal' : 'wide';

  // ── MACD ──
  function ema(data, period) {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const macdCur = macdLine[n - 1];
  const signalCur = signalLine[n - 1];
  const macdPrev = macdLine[n - 2];
  const signalPrev = signalLine[n - 2];
  // 크로스 감지
  let macdSignal = 'neutral';
  let macdCrossDays = 0;
  if (macdCur > signalCur && macdPrev <= signalPrev) {
    macdSignal = 'golden'; macdCrossDays = 1;
  } else if (macdCur < signalCur && macdPrev >= signalPrev) {
    macdSignal = 'dead'; macdCrossDays = 1;
  } else if (macdCur > signalCur) {
    // 골든크로스 이후 며칠째인지
    macdSignal = 'bullish';
    for (let i = n - 2; i >= Math.max(0, n - 20); i--) {
      if (macdLine[i] <= signalLine[i]) { macdCrossDays = n - 1 - i; break; }
    }
  } else {
    // MACD < Signal이지만 히스토그램이 줄어들고 있으면 반등 초기
    const hist3ago = n >= 4 ? macdLine[n - 4] - signalLine[n - 4] : -999;
    const histNow = macdCur - signalCur;
    if (hist3ago < histNow && histNow < 0) {
      macdSignal = 'recovering'; // 하락이지만 반등 시작
    } else {
      macdSignal = 'bearish';
    }
    for (let i = n - 2; i >= Math.max(0, n - 20); i--) {
      if (macdLine[i] >= signalLine[i]) { macdCrossDays = n - 1 - i; break; }
    }
  }
  const macdHist = +(macdCur - signalCur).toFixed(3);

  // ── OBV (On Balance Volume) ──
  const obv = [0];
  for (let i = 1; i < n; i++) {
    if (closes[i] > closes[i - 1]) obv.push(obv[i - 1] + volumes[i]);
    else if (closes[i] < closes[i - 1]) obv.push(obv[i - 1] - volumes[i]);
    else obv.push(obv[i - 1]);
  }
  // OBV 20일 추세 (선형회귀 기울기)
  const obv20 = obv.slice(-20);
  const obvAvg = obv20.reduce((a, b) => a + b, 0) / 20;
  let obvSlope = 0;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < 20; i++) {
    sxx += (i - 9.5) ** 2;
    sxy += (i - 9.5) * (obv20[i] - obvAvg);
  }
  if (sxx > 0) obvSlope = sxy / sxx;
  // OBV 5일 단기 추세 (반등 초기 감지용)
  const obv5 = obv.slice(-5);
  const obv5Avg = obv5.reduce((a, b) => a + b, 0) / 5;
  let obv5Slope = 0;
  let s5xx = 0, s5xy = 0;
  for (let i = 0; i < 5; i++) { s5xx += (i - 2) ** 2; s5xy += (i - 2) * (obv5[i] - obv5Avg); }
  if (s5xx > 0) obv5Slope = s5xy / s5xx;
  const obv5Up = obv5Slope > 0;
  // 가격 20일 추세
  const price20 = closes.slice(-20);
  const priceAvg = price20.reduce((a, b) => a + b, 0) / 20;
  let priceSlope = 0;
  let psxx = 0, psxy = 0;
  for (let i = 0; i < 20; i++) {
    psxx += (i - 9.5) ** 2;
    psxy += (i - 9.5) * (price20[i] - priceAvg);
  }
  if (psxx > 0) priceSlope = psxy / psxx;
  // 가격 5일 단기 추세
  const price5Up = closes[n - 1] > closes[n - 5];
  // OBV 시그널 판정 (20일 기본 + 5일 단기 보완)
  const obvUp = obvSlope > 0;
  const priceFlat = Math.abs(priceSlope / priceAvg) < 0.002;
  const priceDown = priceSlope < 0;
  let obvSignal = 'neutral';
  if (obvUp && (priceFlat || priceDown)) obvSignal = 'accumulation';
  else if (!obvUp && (priceFlat || priceSlope > 0)) obvSignal = 'distribution';
  else if (obvUp && priceSlope > 0) obvSignal = 'confirm';
  else if (!obvUp && priceDown) obvSignal = 'confirm_down';
  // 20일은 하락이지만 5일 단기가 반등이면 → recovering
  if ((obvSignal === 'distribution' || obvSignal === 'confirm_down') && obv5Up && price5Up) {
    obvSignal = 'recovering';
  }

  return {
    bb: { width: +curBBW.toFixed(1), minWidth: +minBBW.toFixed(1), ratio: +bbRatio.toFixed(2), signal: bbSignal },
    macd: { value: +macdCur.toFixed(3), signal: macdSignal, histogram: macdHist, crossDays: macdCrossDays },
    obv: { signal: obvSignal, slopeUp: obvUp, priceSlopeUp: priceSlope > 0 }
  };
}

/* ===== 거래량 분석 엔진 ===== */
function calcVolume(bars) {
  if (bars.length < 50) return null;
  
  const n = bars.length;
  const cur = bars[n - 1];
  
  // 50일/5일 평균 거래량
  const avgVol50 = Math.round(bars.slice(-50).reduce((s, b) => s + b.volume, 0) / 50);
  const avgVol5 = Math.round(bars.slice(-5).reduce((s, b) => s + b.volume, 0) / 5);
  const volRatio = +(avgVol5 / Math.max(avgVol50, 1)).toFixed(2);
  
  // 52주 고저 위치
  const last252 = bars.slice(-252);
  const h52 = Math.max(...last252.map(b => b.high));
  const l52 = Math.min(...last252.map(b => b.low));
  const positionPct = Math.round((cur.close - l52) / Math.max(h52 - l52, 0.01) * 100);
  
  // 5일 가격변화
  const price5ago = bars[n - 6]?.close || cur.close;
  const priceChg5d = +((cur.close / price5ago - 1) * 100).toFixed(1);
  
  // 거래량 고갈 (Dry-up): 최근 5일이 50일 평균의 50% 미만
  const volDryup = volRatio < 0.5;
  
  // 급등일: 최근 5일 중 평균의 2배 이상인 날
  const surgeDay = bars.slice(-5).some(b => b.volume > avgVol50 * 2);
  
  // 거래량 추세
  const vol20 = Math.round(bars.slice(-20).reduce((s, b) => s + b.volume, 0) / 20);
  const volTrend = volRatio > 1.5 ? "급증" : volRatio > 1.1 ? "증가" : volRatio < 0.5 ? "고갈" : volRatio < 0.8 ? "감소" : "보통";
  
  // ── 컨텍스트 시그널 ──
  let signalType = "neutral";
  let signal = volTrend;
  
  if (positionPct <= 30 && priceChg5d > 0 && volRatio > 1.3) {
    signalType = "buy"; signal = "바닥매집🟢";
  } else if (positionPct <= 40 && priceChg5d > 2 && surgeDay) {
    signalType = "buy"; signal = "반등시작🟢";
  } else if (positionPct <= 50 && volDryup && priceChg5d >= -2) {
    signalType = "buy"; signal = "매도고갈💧";
  } else if (positionPct >= 80 && priceChg5d < -2 && volRatio > 1.3) {
    signalType = "sell"; signal = "고점이탈🔴";
  } else if (positionPct >= 70 && priceChg5d < 0 && surgeDay) {
    signalType = "sell"; signal = "분배경고🔴";
  } else if (positionPct >= 60 && priceChg5d < -3 && volRatio > 1.5) {
    signalType = "sell"; signal = "급락주의🔴";
  } else if (volRatio > 1.5 && Math.abs(priceChg5d) < 1) {
    signalType = "caution"; signal = "변곡점⚠️";
  } else if (positionPct >= 50 && priceChg5d > 0 && volRatio > 1.2) {
    signalType = "buy"; signal = "돌파시도🟢";
  }
  
  return {
    avgVol50, avgVol5, volRatio, positionPct, priceChg5d,
    volDryup, surgeDay, volTrend, signalType, signal
  };
}

/* ===== v1.5: Gate 검증 ===== */
function calcGates(sepa, mom) {
  // G1: 가격 > 150일선 AND 가격 > 200일선
  const G1 = sepa.sma150 > 0 && sepa.sma200 > 0
    && sepa.curPrice > sepa.sma150
    && sepa.curPrice > sepa.sma200;

  // G2: 200일선 상승 추세 (conditions[2] = s200 > s200_30일전)
  const G2 = !!(sepa.conditions && sepa.conditions[2]);

  // G3: 6M 또는 12M 수익률 양수 (절대모멘텀 최소 하나)
  const G3 = mom.r6m > 0 || mom.r12m > 0;

  return { G1, G2, G3, passed: G1 && G2 && G3 };
}

/* ===== v1.5: Risk Penalty (최대 -10pt) ===== */
function calcRiskPenalty(sepa, mom, vcp) {
  let penalty = 0;
  const reasons = [];

  // 1. Pivot 위 +15% 이상 = 추격매수 위험
  if (vcp.pivot > 0 && sepa.curPrice > vcp.pivot * 1.15) {
    penalty += 2; reasons.push('피봇과열+2');
  }
  // 2. 가격 < SMA50 = 단기 추세 이탈
  if (sepa.sma50 > 0 && sepa.curPrice < sepa.sma50) {
    penalty += 2; reasons.push('SMA50이탈+2');
  }
  // 3. 3M AND 6M 동시 음수 = 모멘텀 쌍악화
  if (mom.r3m < 0 && mom.r6m < 0) {
    penalty += 2; reasons.push('모멘텀쌍악화+2');
  }
  // 4. 52주 고점 -3% 이내 AND SMA50 대비 +20% 초과 = 단기 과열
  if (sepa.high52 > 0 && sepa.curPrice > sepa.high52 * 0.97 && sepa.sma50 > 0 && sepa.curPrice > sepa.sma50 * 1.20) {
    penalty += 2; reasons.push('단기과열+2');
  }
  // 5. 12M 수익률 -30% 이하 = 장기 하락종목
  if (mom.r12m < -30) {
    penalty += 2; reasons.push('장기하락+2');
  }

  return { penalty: Math.min(penalty, 10), reasons };
}

/* ===== v1.5: Execution Tag ===== */
function calcExecTag(vcp, vol) {
  // 거래량 매도신호 최우선
  if (vol && vol.signalType === 'sell') return 'AVOID';

  const prox = vcp.proximity;  // 양수 = 피봇 아래, 음수 = 피봇 위 (돌파)
  const mature = vcp.maturity || '';

  // BUY NOW: 피봇 0~3% 아래, 성숙 또는 성숙🔥
  if (prox >= 0 && prox <= 3 && (mature.includes('성숙') || mature.includes('돌파'))) return 'BUY NOW';
  // BUY NOW: 피봇 0~5% 아래, 성숙🔥 (거래량 수축 동반)
  if (prox >= 0 && prox <= 5 && mature === '성숙🔥') return 'BUY NOW';
  // BUY ON BREAKOUT: 피봇 5~10% 아래, 형성 진행 중
  if (prox >= 3 && prox <= 10 && (mature.includes('성숙') || mature.includes('형성'))) return 'BUY ON BREAKOUT';
  // BUY ON BREAKOUT: 막 돌파 (피봇 위 0~5%)
  if (prox < 0 && prox >= -5 && mature.includes('돌파')) return 'BUY ON BREAKOUT';
  // WATCH: 이미 5~15% 위 (돌파 후 추격 위험)
  if (prox < -5 && prox >= -15) return 'WATCH';
  // AVOID: 15% 이상 이탈
  if (prox < -15) return 'AVOID';

  return 'WATCH';
}

/* ===== 종목 분석 메인 ===== */
let spyCache = null;
async function getSpyBars() {
  if (spyCache && Date.now() - spyCache.time < 3600000) return spyCache.bars;
  try {
    const bars = await fetchChart("SPY", false, "1y");
    spyCache = { bars, time: Date.now() };
    return bars;
  } catch { return null; }
}

async function analyzeStock(stock) {
  const { t: ticker, k: isKR } = stock;
  const bars = await fetchChart(ticker, isKR, "1y");
  if (bars.length < 50) throw new Error("Insufficient data");
  
  const spyBars = await getSpyBars();
  
  // SEPA
  const sepa = calcSEPA(bars);
  
  // 모멘텀
  const mom = calcMomentum(bars, spyBars);
  
  // VCP (v2 자동감지)
  const vcp = calcVCP(bars);
  
  // 거래량
  const vol = calcVolume(bars);
  
  // 보조지표 (볼린저/MACD/OBV)
  const indicators = calcIndicators(bars);

  // v1.5: Gate / Risk Penalty / Execution Tag
  const gate = calcGates(sepa, mom);
  const risk = calcRiskPenalty(sepa, mom, vcp);
  const execTag = calcExecTag(vcp, vol);
  
  // e 배열: [판정, 스테이지, 템플릿수, RS]
  const rs = mom.relM3 && mom.relM6 ? 3 : mom.relM3 || mom.relM6 ? 2 : 1;
  const e = [sepa.verdict, sepa.stage, sepa.count, rs];
  
  // v 배열: [t1, t2, t3, baseWeeks, pivot, proximity, maturity]
  const v = [vcp.t1, vcp.t2, vcp.t3, vcp.baseWeeks, vcp.pivot, vcp.proximity, vcp.maturity];
  
  // r 배열: [3m수익률, 6m수익률]
  const r = [mom.r3m, mom.r6m];
  
  return {
    ticker,
    e, v, r,
    gate,          // v1.5: { G1, G2, G3, passed }
    riskPenalty: risk.penalty,    // v1.5: 0~10
    riskReasons: risk.reasons,    // v1.5: ['피봇과열+2', ...]
    execTag,       // v1.5: 'BUY NOW' | 'BUY ON BREAKOUT' | 'WATCH' | 'AVOID'
    sepaDetail: {
      count: sepa.count,
      stage: sepa.stage,
      verdict: sepa.verdict,
      sma50: +(sepa.sma50||0).toFixed(2),
      sma150: +(sepa.sma150||0).toFixed(2),
      sma200: +(sepa.sma200||0).toFixed(2),
      high52: sepa.high52,
      low52: sepa.low52,
      conditions: sepa.conditions
    },
    momDetail: {
      r3m: mom.r3m, r6m: mom.r6m, r12m: mom.r12m,
      absM3: mom.absM3, absM6: mom.absM6,
      relM3: mom.relM3, relM6: mom.relM6,
      spyR3: mom.spyR3, spyR6: mom.spyR6
    },
    vcpDetail: {
      t1: vcp.t1, t2: vcp.t2, t3: vcp.t3,
      baseWeeks: vcp.baseWeeks,
      pivot: vcp.pivot,
      proximity: vcp.proximity,
      maturity: vcp.maturity,
      volDrying: vcp.volDrying,
      contractions: vcp.contractions,
      anchorPrice: vcp.anchorPrice
    },
    volData: vol,
    indicators
  };
}
