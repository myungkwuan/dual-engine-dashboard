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
/* ===== 한국: 네이버금융 차트 API / 미국: Yahoo Finance ===== */
/* Yahoo Finance가 Vercel 서버 IP를 차단하므로 KR은 네이버 사용  */

async function fetchKRChart(ticker) {
  // ✅ 네이버 fchart API — 형식 완전 검증됨
  // 응답: <item data="20241231|시가|고가|저가|종가|거래량" />
  // count=320 → 약 15개월치 (SEPA 200일봉 충분히 확보)
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${ticker}&timeframe=day&count=320&requestType=0`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://finance.naver.com/",
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) throw new Error(`Naver fchart ${resp.status}`);
  const text = await resp.text();

  // XML 파싱: <item data="YYYYMMDD|open|high|low|close|volume" />
  const bars = [];
  const regex = /data="([^"]+)"/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const parts = m[1].split("|");
    if (parts.length < 6) continue;
    const [dateStr, open, high, low, close, volume] = parts;
    const c = parseFloat(close);
    const h = parseFloat(high);
    const l = parseFloat(low);
    if (!c || !h || !l) continue;
    // YYYYMMDD → Date
    const y = dateStr.slice(0,4), mo = dateStr.slice(4,6), d = dateStr.slice(6,8);
    bars.push({
      date:   new Date(`${y}-${mo}-${d}`),
      open:   parseFloat(open)  || c,
      high:   h,
      low:    l,
      close:  c,
      volume: parseFloat(volume) || 0
    });
  }
  if (bars.length === 0) throw new Error("fchart: no bars parsed");

  // fchart는 오래된→최신 순(오름차순) 반환 — 그대로 사용
  return bars;
}

async function fetchUSChart(symbol, range = "1y") {
  const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache" },
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
        open: q.open[i], high: q.high[i], low: q.low[i],
        close: adj?.[i] || q.close[i], volume: q.volume[i]
      });
    }
  }
  return bars;
}

async function fetchChart(ticker, isKR, range = "1y") {
  if (isKR) return fetchKRChart(ticker);
  return fetchUSChart(ticker, range);
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
  
  return { count, stage, verdict, conditions, sma50: s50, sma150: s150, sma200: s200, sma30: sma(bars,30), high52: h52, low52: l52, curPrice: cur };
}

/* ===== 듀얼 모멘텀 ===== */
function calcMomentum(bars, spyBars) {
  if (bars.length < 130) return { r3m: 0, r6m: 0, r12m: 0, absM3: false, absM6: false, relM3: false, relM6: false, relM12: false, benchmarkFallbackUsed: true };
  
  const cur = bars[bars.length - 1].close;
  const m3  = bars.length >= 63  ? bars[bars.length - 63].close  : bars[0].close;
  const m6  = bars.length >= 126 ? bars[bars.length - 126].close : bars[0].close;
  const m12 = bars.length >= 252 ? bars[bars.length - 252].close : bars[0].close;
  
  const r3m  = +((cur / m3  - 1) * 100).toFixed(1);
  const r6m  = +((cur / m6  - 1) * 100).toFixed(1);
  const r12m = +((cur / m12 - 1) * 100).toFixed(1);

  // 가속도: 최근 3M 수익이 6M의 절반 이상이면 가속 중
  const accelerating = r3m > r6m * 0.5;

  // 벤치마크 수익률 (SPY or KOSPI/Q)
  let spyR3 = 4.2, spyR6 = 8.7, spyR12 = 18.0;
  let benchmarkFallbackUsed = true;

  if (spyBars && spyBars.length >= 126) {
    const sc  = spyBars[spyBars.length - 1].close;
    const sm3 = spyBars.length >= 63  ? spyBars[spyBars.length - 63].close  : spyBars[0].close;
    const sm6 = spyBars.length >= 126 ? spyBars[spyBars.length - 126].close : spyBars[0].close;
    spyR3 = +((sc / sm3 - 1) * 100).toFixed(1);
    spyR6 = +((sc / sm6 - 1) * 100).toFixed(1);
    if (spyBars.length >= 252) {
      const sm12 = spyBars[spyBars.length - 252].close;
      spyR12 = +((sc / sm12 - 1) * 100).toFixed(1);
    }
    benchmarkFallbackUsed = false;
  }
  
  return {
    r3m, r6m, r12m,
    absM3: r3m > 0, absM6: r6m > 0, absM12: r12m > 0,
    relM3: r3m > spyR3, relM6: r6m > spyR6, relM12: r12m > spyR12,
    spyR3, spyR6, spyR12,
    accelerating,
    benchmarkFallbackUsed
  };
}

/* ===== 🔥 VCP 자동 감지 (v5 — lookback3 + rolling peak + 앵커개선) ===== */
function calcVCP(bars) {
  const INVALID = { t1:0, t2:0, t3:0, baseWeeks:0, pivot:0, proximity:99, maturity:"미형성",
    volDrying:false, contractions:0, anchorPrice:0, anchorIdx:0,
    earlyPivot:0, macroPivot:0, priceTight:false };
  if (bars.length < 60) return INVALID;

  const n = bars.length;
  const closes = bars.map(b => b.close);
  const highs  = bars.map(b => b.high);
  const lows   = bars.map(b => b.low);
  const vols   = bars.map(b => b.volume);
  const curPrice = closes[n - 1];
  const cur = bars[n - 1];

  // ── 보조 통계 ──
  const atr20 = (()=>{
    let s = 0, cnt = 0;
    for (let i = Math.max(1, n-20); i < n; i++) {
      s += Math.max(highs[i]-lows[i], Math.abs(highs[i]-closes[i-1]), Math.abs(lows[i]-closes[i-1]));
      cnt++;
    }
    return cnt ? s/cnt : curPrice*0.02;
  })();
  const atrPct = atr20 / curPrice * 100;
  const minSwingPct = Math.max(2.5, atrPct * 1.2); // 유의미 진폭 기준

  const avgVol10 = vols.slice(-10).reduce((a,b)=>a+b,0)/10;
  const avgVol20 = vols.slice(-20).reduce((a,b)=>a+b,0)/20;
  const avgVol50 = vols.slice(-Math.min(50,n)).reduce((a,b)=>a+b,0)/Math.min(50,n);
  const volDrying       = avgVol10 < avgVol50 * 0.70;
  const strongVolDrying = avgVol10 < avgVol50 * 0.60;
  const range10 = (()=>{
    const sl = bars.slice(-10);
    return (Math.max(...sl.map(b=>b.high)) - Math.min(...sl.map(b=>b.low))) / curPrice * 100;
  })();
  const priceTight       = range10 <= 8;
  const strongPriceTight = range10 <= 5;

  // ── Step 1: Raw 스윙 감지 (좌우 2봉) ──
  const rawHighs = [], rawLows = [];
  for (let i = 2; i < n-2; i++) {
    let isH = highs[i] > highs[i-1] && highs[i] > highs[i-2] && highs[i] > highs[i+1] && highs[i] > highs[i+2];
    let isL = lows[i]  < lows[i-1]  && lows[i]  < lows[i-2]  && lows[i]  < lows[i+1]  && lows[i]  < lows[i+2];
    if (isH) rawHighs.push({ idx:i, price:highs[i] });
    if (isL) rawLows.push({ idx:i, price:lows[i] });
  }

  // ── Step 2: 스윙 정제 ──
  function cleanSwings(raws, isHigh) {
    // (a) 최소 진폭 + 최소 간격 필터
    const filtered = [];
    for (const s of raws) {
      if (filtered.length === 0) { filtered.push(s); continue; }
      const prev = filtered[filtered.length-1];
      const gap = s.idx - prev.idx;
      const amp = Math.abs(s.price - prev.price) / prev.price * 100;
      if (gap < 3) {
        // 간격 짧음 — 더 극단적인 값으로 교체
        if (isHigh ? s.price > prev.price : s.price < prev.price) filtered[filtered.length-1] = s;
      } else if (amp < 2.0) {
        // 진폭 너무 작음 — 더 극단적인 값 유지
        if (isHigh ? s.price > prev.price : s.price < prev.price) filtered[filtered.length-1] = s;
      } else {
        filtered.push(s);
      }
    }
    // (b) 같은 방향 연속 제거: 고점이면 더 높은 것, 저점이면 더 낮은 것만 남김
    const cleaned = [];
    for (const s of filtered) {
      if (!cleaned.length) { cleaned.push(s); continue; }
      const prev = cleaned[cleaned.length-1];
      if (isHigh ? s.price > prev.price : s.price < prev.price) cleaned[cleaned.length-1] = s;
      else cleaned.push(s);
    }
    return cleaned;
  }

  // 폴백: 최근 90일 스윙이 부족하면 윈도우 피크 보완
  function ensureSwings(rawList, isHigh, minCount) {
    let cleaned = cleanSwings(rawList, isHigh);
    if (cleaned.filter(s=>s.idx >= n-90).length < minCount) {
      const extra = [];
      for (let c = Math.max(5, n-85); c < n-5; c += 8) {
        let best = c;
        for (let j = Math.max(0,c-5); j <= Math.min(n-1,c+5); j++) {
          if (isHigh ? highs[j]>highs[best] : lows[j]<lows[best]) best = j;
        }
        const p = isHigh ? highs[best] : lows[best];
        if (!cleaned.some(s=>Math.abs(s.idx-best)<5)) extra.push({idx:best, price:p});
      }
      cleaned = [...cleaned, ...extra].sort((a,b)=>a.idx-b.idx);
    }
    return cleaned;
  }

  const swingHighs = ensureSwings(rawHighs, true, 2);
  const swingLows  = ensureSwings(rawLows, false, 2);
  if (swingHighs.length < 1 || swingLows.length < 1) return INVALID;

  // ── Step 3: 앵커 선택 (점수 기반) ──
  const sortedByRecent = [...swingHighs].sort((a,b)=>b.idx-a.idx);
  let bestAnchor = null, bestScore = -1;

  for (const sh of sortedByRecent) {
    if (sh.price < curPrice * 0.50) continue;
    if (sh.idx < n - 180) continue;
    if (curPrice > sh.price * 1.20) continue;
    if (n - 1 - sh.idx < 10) continue; // 너무 최근 고점

    const lowsAfter = swingLows.filter(sl=>sl.idx > sh.idx);
    if (!lowsAfter.length) continue;
    const minLow = Math.min(...lowsAfter.map(sl=>sl.price));
    const drawdown = (sh.price - minLow) / sh.price;
    if (drawdown < 0.04) continue;

    // 앵커 점수
    let sc = 0;
    if (sh.idx >= n-90) sc += 2;
    const dist = (sh.price - curPrice) / sh.price;
    if (dist >= 0 && dist <= 0.15) sc += 2;
    if (drawdown >= 0.06 && drawdown <= 0.25) sc += 2;
    const baseDaysHere = (n-1-sh.idx);
    if (baseDaysHere >= 15) sc += 2;
    if (baseDaysHere >= 20) sc += 2;
    // 저점이 점진적으로 높아지는지
    if (lowsAfter.length >= 2) {
      let rising = true;
      for (let k=1; k<lowsAfter.length; k++) if (lowsAfter[k].price < lowsAfter[k-1].price) { rising=false; break; }
      if (rising) sc += 2;
    }
    if (sc > bestScore) { bestScore = sc; bestAnchor = sh; }
  }

  // 폴백: 최근 90일 최고가
  if (!bestAnchor) {
    let maxP=0, maxI=n-1;
    for (let i=Math.max(0,n-90); i<n; i++) if (highs[i]>maxP) { maxP=highs[i]; maxI=i; }
    const lowsAfter = swingLows.filter(sl=>sl.idx>maxI);
    if (!lowsAfter.length) return INVALID;
    bestAnchor = { idx:maxI, price:maxP };
  }

  const anchor = bestAnchor;

  // ── Step 4: 수축 구간 추출 ──
  const lowsA  = swingLows.filter(sl=>sl.idx > anchor.idx).sort((a,b)=>a.idx-b.idx);
  const highsA = swingHighs.filter(sh=>sh.idx > anchor.idx && sh.price <= anchor.price*1.05).sort((a,b)=>a.idx-b.idx);

  const contrList = [];
  let H = { idx:anchor.idx, price:anchor.price };

  if (lowsA.length >= 1) {
    const L1 = lowsA[0];
    const t1Pct = +((1 - L1.price/H.price)*100).toFixed(1);
    if (t1Pct >= 2.5) {
      contrList.push({ pct:t1Pct, H, L:L1 });

      const h2Cands = highsA.filter(sh=>sh.idx > L1.idx);
      if (h2Cands.length && lowsA.length >= 2) {
        const H1 = h2Cands[0];
        const l2Cands = lowsA.filter(sl=>sl.idx > H1.idx);
        if (l2Cands.length) {
          const L2 = l2Cands[0];
          const t2Pct = +((1 - L2.price/H1.price)*100).toFixed(1);
          // 잡음 병합: T2가 T1의 40% 미만이고 간격이 짧으면 제외
          const gap2 = L2.idx - H1.idx;
          if (t2Pct >= 2.5 && !(t2Pct < t1Pct*0.40 && gap2 < 5)) {
            contrList.push({ pct:t2Pct, H:H1, L:L2 });

            const h3Cands = highsA.filter(sh=>sh.idx > L2.idx);
            if (h3Cands.length) {
              const H2 = h3Cands[0];
              const l3Cands = lowsA.filter(sl=>sl.idx > H2.idx);
              if (l3Cands.length) {
                const L3 = l3Cands[0];
                const t3Pct = +((1 - L3.price/H2.price)*100).toFixed(1);
                const gap3 = L3.idx - H2.idx;
                if (t3Pct >= 2.5 && !(t3Pct < t2Pct*0.40 && gap3 < 5)) {
                  contrList.push({ pct:t3Pct, H:H2, L:L3 });
                }
              }
            }
          }
        }
      }
    }
  }

  const t1 = contrList[0]?.pct || 0;
  const t2 = contrList[1]?.pct || 0;
  const t3 = contrList[2]?.pct || 0;

  // ── Step 5: 이중 피봇 ──
  const macroPivot = anchor.price;
  // earlyPivot = 베이스 안 가장 최근 반등 고점 (H1 or H2)
  const earlyPivotCand = highsA.slice().sort((a,b)=>b.idx-a.idx)[0];
  const earlyPivot = earlyPivotCand
    ? +earlyPivotCand.price.toFixed(2)
    : +macroPivot.toFixed(2);

  // 실용 pivot: macro/early 차이 3% 이내면 macro, 아니면 early (더 가까운 저항)
  const macroEarlyDiff = (macroPivot - earlyPivot) / macroPivot * 100;
  const pivot = (macroEarlyDiff <= 3 || earlyPivot <= 0) ? macroPivot : earlyPivot;
  const proximity = +((1 - curPrice/pivot)*100).toFixed(1);

  // ── Step 6: 베이스 기간 ──
  const baseDays = n - 1 - anchor.idx;
  const baseWeeks = Math.round(baseDays / 5);

  // ── 추가 맥락 ──
  const price10ago = closes[n-11] || closes[0];
  const recentRunup10d = (curPrice/price10ago - 1)*100;
  const overextended       = proximity <= -7;
  const extremeOverextended = proximity <= -12;

  // 당일 봉 구조
  const hiLo = Math.max(cur.high - cur.low, 0.0001);
  const closePos        = (cur.close - cur.low) / hiLo;
  const upperWickRatio  = (cur.high - Math.max(cur.open||cur.close, cur.close)) / hiLo;
  const todayVolRatio   = vols[n-1] / Math.max(avgVol20, 1);

  // ── Step 7: 성숙도 판정 ──
  let maturity = "미형성";
  const alreadyBroken = curPrice > pivot * 1.02;

  if (t1 > 50) {
    maturity = "미형성"; // 폭락 베이스
  } else if (alreadyBroken) {
    // 돌파 판정
    const goodBreakout = t1 > t2 && closePos >= 0.70 && upperWickRatio < 0.30 && todayVolRatio >= 1.3;
    if (contrList.length >= 2 && t1 > t2 && (t3 === 0 || t2 > t3) && goodBreakout) {
      maturity = "돌파✅";
    } else {
      maturity = "돌파";
    }
  } else if (
    contrList.length >= 3 && t1 > t2 && t2 > t3 && t3 > 0 && t3 <= 8 &&
    baseWeeks >= 4 && volDrying && priceTight &&
    proximity >= 0 && proximity <= 8 && !overextended
  ) {
    maturity = "성숙🔥"; // 가장 엄격한 조건
  } else if (
    (contrList.length >= 3 && t1 > t2 && t2 > t3 && t3 > 0 && t3 <= 12 && baseWeeks >= 3 && proximity <= 10) ||
    (contrList.length >= 2 && t1 > t2 && t2 <= 15 && baseWeeks >= 3 && (volDrying || priceTight) && proximity <= 10)
  ) {
    maturity = "성숙";
  } else if (
    contrList.length >= 2 && t1 > t2 && t2 > 0 && baseWeeks >= 2 &&
    t1 <= 35 && recentRunup10d > -8 // 급락 없음
  ) {
    maturity = "형성중";
  } else if (
    contrList.length >= 1 && t1 > 0 && t1 <= 35 && baseWeeks >= 2
  ) {
    maturity = "형성중";
  }

  // 과열 추격 무효화
  if (extremeOverextended) maturity = "미형성";

  // ── VCP 점수 (0~15) ──
  let score = 0;
  // 구조 (0~7)
  if (t1 > 0) score += 2;
  if (t1 > t2 && t2 > 0) score += 2;
  if (t1 > t2 && t2 > t3 && t3 > 0) score += 3;
  // 품질 (0~4)
  if (baseWeeks >= 3) score += 1;
  if (baseWeeks >= 4) score += 1;
  if (t3 > 0 && t3 <= 12) score += 1;
  if (t3 > 0 && t3 <= 8)  score += 1;
  // 수급/타이트 (0~2)
  if (volDrying)   score += 1;
  if (priceTight)  score += 1;
  // 피봇 근접 (0~2)
  if (proximity >= 0 && proximity <= 10) score += 1;
  if (proximity >= 0 && proximity <= 5)  score += 1;
  // 감점
  if (overextended)        score -= 2;
  if (extremeOverextended) score -= 2; // 추가 -2 (총 -4)
  if (t1 > 35)             score -= 3;
  score = Math.max(0, Math.min(15, score));

  return {
    t1, t2, t3,
    baseWeeks,
    pivot: +pivot.toFixed(2),
    proximity,
    maturity,
    volDrying,
    contractions: contrList.length,
    anchorPrice: +anchor.price.toFixed(2),
    anchorIdx: anchor.idx,
    // v2 추가 필드
    macroPivot: +macroPivot.toFixed(2),
    earlyPivot: +earlyPivot.toFixed(2),
    priceTight,
    score,
    recentRunup10d: +recentRunup10d.toFixed(1)
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
function calcVolume(bars, pivot) {
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
  const volTrend = volRatio > 1.5 ? "급증" : volRatio > 1.1 ? "증가" : volRatio < 0.5 ? "고갈" : volRatio < 0.8 ? "감소" : "보통";

  // ── 보완 3요소 ──
  // 1) 피봇 거리 (pivot이 없으면 positionPct 기반 추정)
  const pivotRef = pivot && pivot > 0 ? pivot : h52 * 0.97; // 없으면 52주 고점 -3%로 대체
  const pivotDistancePct = +((cur.close / pivotRef - 1) * 100).toFixed(1);
  const isNearPivot   = pivotDistancePct >= -3 && pivotDistancePct <= 3;
  const isOverextended = pivotDistancePct >= 7;

  // 2) 당일 봉 구조
  const hiLoRange = Math.max(cur.high - cur.low, 0.0001);
  const closePos = +((cur.close - cur.low) / hiLoRange).toFixed(2);          // 1=완전 고가마감, 0=완전 저가마감
  const upperWickRatio = +((cur.high - Math.max(cur.open || cur.close, cur.close)) / hiLoRange).toFixed(2);
  const strongClose  = closePos >= 0.65;   // 고가권 마감
  const weakClose    = closePos <= 0.40;   // 저가권 마감 (밀린 봉)
  const upperWick    = upperWickRatio >= 0.35; // 윗꼬리 분배 의심

  // 3) 직전 맥락
  const price10ago = bars[n - 11]?.close || cur.close;
  const recentRunup10d = +((cur.close / price10ago - 1) * 100).toFixed(1);   // 최근 10일 상승률
  const isOverheated = recentRunup10d >= 12;                                  // 단기 과열
  // 분배일: 고위치에서 하락 + 거래량 증가
  const distDays20 = bars.slice(-20).filter(b => {
    const pos = (b.close - l52) / Math.max(h52 - l52, 0.01) * 100;
    return pos >= 60 && b.close < (b.open || b.close) && b.volume > avgVol50 * 1.2;
  }).length;

  // ── 시그널 판정 (기존 구조 유지 + 보완 조건으로 정교화) ──
  let signalType = "neutral";
  let signal = volTrend;

  // 바닥매집: 위치 낮음 + 상승 + 거래량 증가
  if (positionPct <= 30 && priceChg5d > 0 && volRatio > 1.3) {
    signalType = "buy"; signal = "바닥매집🟢";

  // 반등시작: 위치 낮음 + 단기 급등 + 강한 봉
  } else if (positionPct <= 40 && priceChg5d > 2 && surgeDay) {
    signalType = "buy"; signal = "반등시작🟢";

  // 매도고갈: 위치 중하 + 거래량 고갈 → 매도 힘 소진
  } else if (positionPct <= 50 && volDryup && priceChg5d >= -2) {
    signalType = "buy"; signal = "매도고갈💧";

  // 고점이탈: 위치 고점 + 피봇 과이탈 + 하락 + 약한 봉 or 윗꼬리
  } else if (positionPct >= 70 && priceChg5d < -2 && volRatio > 1.3
             && (isOverextended || isOverheated)
             && (weakClose || upperWick)) {
    signalType = "sell"; signal = "고점이탈🔴";

  // 분배경고: 위치 고점 + 분배일 누적 + 당일 하락 + 거래량 급증
  } else if (positionPct >= 70 && priceChg5d < 0 && surgeDay
             && (distDays20 >= 3 || weakClose)) {
    signalType = "sell"; signal = "분배경고🔴";

  // 급락주의: 위치 중고점 + 급락 + 거래량 폭발
  } else if (positionPct >= 60 && priceChg5d < -3 && volRatio > 1.5) {
    signalType = "sell"; signal = "급락주의🔴";

  // 돌파시도: 피봇 근처 + 상승 + 강한 봉 + 거래량 증가 + 과열 아님
  } else if (positionPct >= 50 && isNearPivot && priceChg5d > 0
             && volRatio > 1.2 && strongClose && !isOverheated) {
    signalType = "buy"; signal = "돌파시도🟢";

  // 변곡점: 거래량 급증 + 방향 불명
  } else if (volRatio > 1.5 && Math.abs(priceChg5d) < 1) {
    signalType = "caution"; signal = "변곡점⚠️";

  // 기존 돌파시도 fallback (피봇 없거나 조건 완화)
  } else if (positionPct >= 50 && priceChg5d > 0 && volRatio > 1.2) {
    signalType = "buy"; signal = "돌파시도🟢";
  }
  
  return {
    avgVol50, avgVol5, volRatio, positionPct, priceChg5d,
    volDryup, surgeDay, volTrend, signalType, signal,
    // 보완 데이터 (모달 상세 표시용)
    pivotDistancePct, isNearPivot, isOverextended,
    closePos, upperWick, strongClose, weakClose,
    recentRunup10d, isOverheated, distDays20
  };
}

/* ===== 종목 분석 메인 ===== */
/* ===== v1.5: Gate 검증 ===== */
function calcGates(sepa, mom) {
  const G1 = sepa.sma150 > 0 && sepa.sma200 > 0
    && sepa.curPrice > sepa.sma150
    && sepa.curPrice > sepa.sma200;
  const G2 = !!(sepa.conditions && sepa.conditions[2]);
  const G3 = mom.r6m > 0 || mom.r12m > 0;
  return { G1, G2, G3, passed: G1 && G2 && G3 };
}

/* ===== v1.5: Risk Penalty (최대 -10pt) ===== */
function calcRiskPenalty(sepa, mom, vcp) {
  let penalty = 0;
  const reasons = [];
  if (vcp.pivot > 0 && sepa.curPrice > vcp.pivot * 1.15) {
    penalty += 2; reasons.push('피봇과열+2');
  }
  if (sepa.sma50 > 0 && sepa.curPrice < sepa.sma50) {
    penalty += 2; reasons.push('SMA50이탈+2');
  }
  if (mom.r3m < 0 && mom.r6m < 0) {
    penalty += 2; reasons.push('모멘텀쌍악화+2');
  }
  if (sepa.high52 > 0 && sepa.curPrice > sepa.high52 * 0.97 && sepa.sma50 > 0 && sepa.curPrice > sepa.sma50 * 1.20) {
    penalty += 2; reasons.push('단기과열+2');
  }
  if (mom.r12m < -30) {
    penalty += 2; reasons.push('장기하락+2');
  }
  return { penalty: Math.min(penalty, 10), reasons };
}

/* ===== v1.5: Execution Tag ===== */
function calcExecTag(vcp, vol) {
  if (vol && vol.signalType === 'sell') return 'AVOID';
  const prox = vcp.proximity; // 양수=피봇까지 남은거리, 음수=피봇 초과
  const mature = vcp.maturity || '';

  // 피봇 20% 이상 초과 → 완전 과열, 진입금지
  if (prox < -20) return 'AVOID';

  // 피봇 10~20% 초과 → 너무 올라있음, 관망
  if (prox < -10 && prox >= -20) return 'WATCH';

  // 피봇 5~10% 초과 + 돌파 확인 → 눌림목 대기
  if (prox < -5 && prox >= -10 && mature.includes('돌파')) return 'BUY ON BREAKOUT';

  // 피봇 0~5% 초과 + 돌파 → 즉시 또는 눌림목 매수
  if (prox < 0 && prox >= -5 && mature.includes('돌파')) return 'BUY ON BREAKOUT';

  // 피봇 0~3% 아래 + 성숙/돌파 → 즉시 매수 가능
  if (prox >= 0 && prox <= 3 && (mature.includes('성숙') || mature.includes('돌파'))) return 'BUY NOW';
  if (prox >= 0 && prox <= 5 && mature === '성숙🔥') return 'BUY NOW';

  // 피봇 3~10% 아래 + 패턴 형성 → 돌파 대기
  if (prox >= 3 && prox <= 10 && (mature.includes('성숙') || mature.includes('형성'))) return 'BUY ON BREAKOUT';

  // 그 외
  if (prox < -5) return 'WATCH';
  return 'WATCH';
}

// ── KOSDAQ 종목 집합 (벤치마크 분리용) ──
const KOSDAQ_SET = new Set([
  "042700","058470","403870","240810","036930","039030","067310","036540",
  "489790","189300","099320","211270","450190","058610","277810","454910",
  "098460","108490","022100","196170","253840","237690","247540","066970",
  "278470","214450","257720","192820","214150","041190","112040","094480",
  "063170","067160","229640","083650","105840","039790","007660","102120",
  "087010","018290","241710","089030","095340","166090","033100","071970",
  "009420","141080","229200","251340"
]);

// ── 지수 bars 캐시 (Vercel 서버리스: 동일 인스턴스 내 재사용) ──
async function fetchIndexBars(symbol) {
  const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${symbol}&timeframe=day&count=320&requestType=0`;
  const resp = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "https://finance.naver.com/",
    },
    signal: AbortSignal.timeout(15000)
  });
  if (!resp.ok) throw new Error(`${symbol} fchart ${resp.status}`);
  const text = await resp.text();
  const bars = [];
  const regex = /data="([^"]+)"/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    const parts = m[1].split("|");
    if (parts.length < 6) continue;
    const c = parseFloat(parts[4]);
    if (!c) continue;
    bars.push({ close: c });
  }
  return bars;
}

let spyCache = null;
async function getSpyBars() {
  if (spyCache && Date.now() - spyCache.time < 3600000) return spyCache.bars;
  try {
    const bars = await fetchChart("SPY", false, "1y");
    spyCache = { bars, time: Date.now() };
    return bars;
  } catch { return null; }
}

let kospiCache = null;
async function getKospiBars() {
  if (kospiCache && Date.now() - kospiCache.time < 3600000) return kospiCache.bars;
  try {
    const bars = await fetchIndexBars("KOSPI");
    kospiCache = { bars, time: Date.now() };
    return bars;
  } catch { return null; }
}

let kosdaqCache = null;
async function getKosdaqBars() {
  if (kosdaqCache && Date.now() - kosdaqCache.time < 3600000) return kosdaqCache.bars;
  try {
    const bars = await fetchIndexBars("KOSDAQ");
    kosdaqCache = { bars, time: Date.now() };
    return bars;
  } catch { return null; }
}

async function analyzeStock(stock) {
  const { t: ticker, k: isKR } = stock;
  const bars = await fetchChart(ticker, isKR, "1y");
  if (bars.length < 50) throw new Error("Insufficient data");

  // 벤치마크: KR주식→KOSPI/KOSDAQ, 미국→SPY
  let benchBars = null;
  if (isKR) {
    benchBars = KOSDAQ_SET.has(ticker) ? await getKosdaqBars() : await getKospiBars();
  } else {
    benchBars = await getSpyBars();
  }

  // SEPA
  const sepa = calcSEPA(bars);

  // 모멘텀
  const mom = calcMomentum(bars, benchBars);
  
  // VCP (v2 자동감지)
  const vcp = calcVCP(bars);
  
  // 거래량
  const vol = calcVolume(bars, vcp.pivot);
  
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
    gate,
    riskPenalty: risk.penalty,
    riskReasons: risk.reasons,
    execTag,
    sepaDetail: {
      count: sepa.count,
      stage: sepa.stage,
      verdict: sepa.verdict,
      sma50: +(sepa.sma50||0).toFixed(2),
      sma150: +(sepa.sma150||0).toFixed(2),
      sma200: +(sepa.sma200||0).toFixed(2),
      sma30: +(sepa.sma30||0).toFixed(2),
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
