/* /pages/api/market.js — 시장 필터 실시간 데이터 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  try {
    const results = {};

    /* ── Yahoo Finance 차트 데이터 가져오기 ── */
    async function fetchChart(symbol, range = "1y") {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d&includePrePost=false`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!resp.ok) throw new Error(`Yahoo ${resp.status}`);
      const json = await resp.json();
      const result = json.chart?.result?.[0];
      if (!result?.timestamp) throw new Error("No data");
      const ts = result.timestamp;
      const q = result.indicators.quote[0];
      const adj = result.indicators.adjclose?.[0]?.adjclose;
      const bars = [];
      for (let i = 0; i < ts.length; i++) {
        if (q.close[i] != null) {
          bars.push({ close: adj?.[i] || q.close[i], volume: q.volume?.[i] || 0 });
        }
      }
      return bars;
    }

    function sma(bars, period) {
      if (bars.length < period) return null;
      let sum = 0;
      for (let i = bars.length - period; i < bars.length; i++) sum += bars[i].close;
      return sum / period;
    }

    function returnPct(bars, days) {
      if (bars.length < days + 1) return null;
      const cur = bars[bars.length - 1].close;
      const prev = bars[bars.length - 1 - days].close;
      return +((cur - prev) / prev * 100).toFixed(2);
    }

    /* ── 1. SPY 분석 ── */
    const spyBars = await fetchChart("SPY");
    const spyCur = spyBars[spyBars.length - 1].close;
    const spy200 = sma(spyBars, 200);
    const spy150 = sma(spyBars, 150);
    const spy50 = sma(spyBars, 50);
    const spy12m = returnPct(spyBars, 252) || returnPct(spyBars, spyBars.length - 1);
    const spy6m = returnPct(spyBars, 126);
    const spy3m = returnPct(spyBars, 63);
    const spyAbove200 = spy200 ? spyCur > spy200 : true;
    const spy200Trend = spy200 && spyBars.length > 220 ? spy200 > sma(spyBars.slice(0, -20), 200) : true;

    results.spy = {
      price: +spyCur.toFixed(2),
      sma200: spy200 ? +spy200.toFixed(2) : null,
      sma150: spy150 ? +spy150.toFixed(2) : null,
      sma50: spy50 ? +spy50.toFixed(2) : null,
      above200: spyAbove200,
      sma200Rising: spy200Trend,
      r12m: spy12m, r6m: spy6m, r3m: spy3m
    };

    await sleep(500);

    /* ── 2. VIX ── */
    try {
      const vixBars = await fetchChart("^VIX", "3mo");
      const vixCur = vixBars[vixBars.length - 1].close;
      const vixAvg = sma(vixBars, 20);
      results.vix = {
        value: +vixCur.toFixed(2),
        avg20: vixAvg ? +vixAvg.toFixed(2) : null,
        level: vixCur < 15 ? "매우낮음" : vixCur < 20 ? "낮음" : vixCur < 25 ? "보통" : vixCur < 30 ? "높음" : "매우높음"
      };
    } catch (e) {
      results.vix = { value: null, level: "조회실패" };
    }

    await sleep(500);

    /* ── 3. KOSPI — Naver fchart ── */
    try {
      const kospiTs = Date.now();
      const kospiRes = await fetch(
        `https://fchart.stock.naver.com/sise.nhn?symbol=KOSPI&timeframe=day&count=320&requestType=0&_=${kospiTs}`,
        { headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://finance.naver.com/",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache"
          }
        }
      );
      if (!kospiRes.ok) throw new Error("KOSPI fchart " + kospiRes.status);
      const xml = await kospiRes.text();
      const items = xml.match(/data="([^"]+)"/g) || [];
      const closes = items.map(m => parseFloat(m.split("|")[4])).filter(v => !isNaN(v));
      if (closes.length < 10) throw new Error("KOSPI data insufficient");
      const smaK = n => closes.length >= n
        ? closes.slice(-n).reduce((a,b)=>a+b,0)/n : null;
      const kospiCur = closes[closes.length - 1];
      const kospi200 = smaK(200);
      const kospi50  = smaK(50);
      const kospi200_20ago = closes.length >= 220
        ? closes.slice(-220,-20).reduce((a,b)=>a+b,0)/200 : null;
      const retK = n => closes.length > n
        ? +((kospiCur / closes[closes.length-1-n] - 1)*100).toFixed(2) : null;
      const kospiPrev = closes.length >= 2 ? closes[closes.length-2] : null;
      const kospiDayChg = kospiPrev ? +((kospiCur-kospiPrev)/kospiPrev*100).toFixed(2) : 0;
      results.kospi = {
        price:    +kospiCur.toFixed(2),
        dayChg:   kospiDayChg,
        sma200:   kospi200 ? +kospi200.toFixed(2) : null,
        sma50:    kospi50  ? +kospi50.toFixed(2)  : null,
        above200: kospi200 ? kospiCur > kospi200 : null,
        above50:  kospi50  ? kospiCur > kospi50  : null,
        sma200Rising: (kospi200 && kospi200_20ago) ? kospi200 > kospi200_20ago : null,
        r12m: retK(252) || retK(closes.length-1),
        r6m:  retK(126),
        r3m:  retK(63)
      };
    } catch (e) {
      results.kospi = { price: null, r12m: null, above200: null };
    }

    await sleep(500);

    /* ── 4. 미국 3대 지수 현재가 ── */
    try {
      const [djiBars, gspcBars, ixicBars] = await Promise.all([
        fetchChart("%5EDJI"),
        fetchChart("%5EGSPC"),
        fetchChart("%5EIXIC"),
      ]);
      /* 지수 현재가+등락률 — fetchChart는 bars만 반환하므로 별도 meta 호출 */
      const fetchIdxMeta = async (sym) => {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d&_=${Date.now()}`;
        const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) return null;
        const j = await r.json();
        const meta = j.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return null;
        const chg = meta.regularMarketChangePercent
          ? +meta.regularMarketChangePercent.toFixed(2)
          : (() => {
              const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPreviousClose;
              return prev ? +((meta.regularMarketPrice - prev) / prev * 100).toFixed(2) : 0;
            })();
        return { price: +meta.regularMarketPrice.toFixed(2), chg };
      };
      const [djiMeta, gspcMeta, ixicMeta] = await Promise.all([
        fetchIdxMeta("%5EDJI"), fetchIdxMeta("%5EGSPC"), fetchIdxMeta("%5EIXIC")
      ]);
      results.usIndices = {
        dji:  djiMeta  || { price: djiBars[djiBars.length-1].close,   chg: 0 },
        gspc: gspcMeta || { price: gspcBars[gspcBars.length-1].close, chg: 0 },
        ixic: ixicMeta || { price: ixicBars[ixicBars.length-1].close, chg: 0 },
      };
    } catch(e) {
      results.usIndices = null;
    }

    await sleep(500);

    /* ── 5. KOSDAQ — Naver fchart ── */
    try {
      const kosdaqTs = Date.now();
      const kosdaqRes = await fetch(
        `https://fchart.stock.naver.com/sise.nhn?symbol=KOSDAQ&timeframe=day&count=5&requestType=0&_=${kosdaqTs}`,
        { headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://finance.naver.com/",
            "Cache-Control": "no-cache"
          }
        }
      );
      if (!kosdaqRes.ok) throw new Error("KOSDAQ " + kosdaqRes.status);
      const xml2 = await kosdaqRes.text();
      const items2 = xml2.match(/data="([^"]+)"/g) || [];
      const closes2 = items2.map(m => parseFloat(m.split("|")[4])).filter(v => !isNaN(v));
      if (closes2.length < 2) throw new Error("KOSDAQ insufficient");
      const cur2 = closes2[closes2.length-1];
      const prev2 = closes2[closes2.length-2];
      results.kosdaq = { price: +cur2.toFixed(2), chg: prev2 ? +((cur2-prev2)/prev2*100).toFixed(2) : 0 };
    } catch(e) {
      results.kosdaq = null;
    }

    await sleep(500);

    /* ── 6. 섹터 ETF 상대강도 (3M 수익률 기준) ── */
    const sectorETFs = ["XLK","XLC","XLI","XLY","XLV","XLU","XLE","XLF","XLB","XLP","XLRE"];
    const sectorResults = [];
    
    // 배치 처리 (5개씩)
    for (let i = 0; i < sectorETFs.length; i += 5) {
      const batch = sectorETFs.slice(i, i + 5);
      const promises = batch.map(async (sym) => {
        try {
          const bars = await fetchChart(sym, "6mo");
          const r3m = returnPct(bars, 63);
          const r1m = returnPct(bars, 21);
          return { sym, r3m: r3m || 0, r1m: r1m || 0 };
        } catch {
          return { sym, r3m: 0, r1m: 0 };
        }
      });
      const batchResults = await Promise.all(promises);
      sectorResults.push(...batchResults);
      if (i + 5 < sectorETFs.length) await sleep(1000);
    }

    // 3M 수익률 기준 정렬
    sectorResults.sort((a, b) => b.r3m - a.r3m);
    results.sectors = sectorResults;

    await sleep(800);

    /* ── 4-B. 한국 섹터 ETF 상대강도 ── */
    const krSectorETFs = [
      { sym: "091160.KS", name: "반도체" },
      { sym: "140710.KS", name: "금융" },
      { sym: "261270.KS", name: "헬스케어" },
      { sym: "266420.KS", name: "철강소재" },
      { sym: "117690.KS", name: "건설" },
      { sym: "117700.KS", name: "소비재" },
      { sym: "091230.KS", name: "산업기계" },
      { sym: "227540.KS", name: "에너지화학" },
      { sym: "305720.KS", name: "2차전지" },
    ];
    const krSectorResults = [];
    for (let i = 0; i < krSectorETFs.length; i += 4) {
      const batch = krSectorETFs.slice(i, i + 4);
      const batchR = await Promise.all(batch.map(async ({ sym, name }) => {
        try {
          const bars = await fetchChart(sym, "6mo");
          const r3m = returnPct(bars, 63);
          const r1m = returnPct(bars, 21);
          return { sym: name, r3m: r3m || 0, r1m: r1m || 0 };
        } catch {
          return { sym: name, r3m: null, r1m: null };
        }
      }));
      krSectorResults.push(...batchR.filter(s => s.r3m !== null));
      if (i + 4 < krSectorETFs.length) await sleep(800);
    }
    krSectorResults.sort((a, b) => b.r3m - a.r3m);
    results.krSectors = krSectorResults;

    /* ── 5. 시장 건강도 판정 (미국/한국 동일 구조 v2) ── */
    const vixVal = results.vix?.value || 20;

    /* ── MACD 계산 함수 ── */
    function calcMACD(bars) {
      if (bars.length < 35) return { signal: 'neutral', score: 0 };
      const ema = (b, n) => {
        const k = 2/(n+1);
        let e = b.slice(0, n).reduce((a,v)=>a+v.close,0)/n;
        for (let i = n; i < b.length; i++) e = b[i].close*k + e*(1-k);
        return e;
      };
      const ema12 = ema(bars, 12);
      const ema26 = ema(bars, 26);
      const macdLine = ema12 - ema26;
      // 이전 MACD
      const ema12p = ema(bars.slice(0,-1), 12);
      const ema26p = ema(bars.slice(0,-1), 26);
      const macdPrev = ema12p - ema26p;
      if (macdLine > 0 && macdPrev <= 0) return { signal: 'golden', score: 10 };
      if (macdLine > 0 && macdPrev > 0)  return { signal: 'bullish', score: 5 };
      if (macdLine < 0 && macdPrev >= 0) return { signal: 'dead', score: -10 };
      if (macdLine < 0 && macdPrev < 0)  return { signal: 'bearish', score: -5 };
      return { signal: 'neutral', score: 0 };
    }

    /* ── OBV 계산 함수 ── */
    function calcOBV(bars) {
      if (bars.length < 21) return { signal: 'neutral', score: 0 };
      let obv = 0;
      const obvArr = [0];
      for (let i = 1; i < bars.length; i++) {
        if (bars[i].close > bars[i-1].close) obv += bars[i].volume;
        else if (bars[i].close < bars[i-1].close) obv -= bars[i].volume;
        obvArr.push(obv);
      }
      const obvNow = obvArr[obvArr.length-1];
      const obv20ago = obvArr[obvArr.length-21];
      const obv5ago = obvArr[obvArr.length-6];
      const rising20 = obvNow > obv20ago;
      const rising5  = obvNow > obv5ago;
      if (rising20 && rising5)   return { signal: 'confirm', score: 5 };
      if (rising5 && !rising20)  return { signal: 'recovering', score: 2 };
      if (!rising5 && !rising20) return { signal: 'distribution', score: -5 };
      return { signal: 'neutral', score: 0 };
    }

    /* ── 공통 점수 계산 함수 ── */
    function calcMarketScore(bars, above200, above50, golden, r12m, r3m, upSectorCount, totalSectors, vix) {
      let score = 0;

      // ① 장기추세 — 200MA 위 (+25)
      if (above200) score += 25;

      // ② 200MA 자체 상승 중 (+10)
      const ma200now = sma(bars, 200);
      const ma200ago = bars.length > 220 ? sma(bars.slice(0,-20), 200) : null;
      if (ma200now && ma200ago && ma200now > ma200ago) score += 10;

      // ③ 골든크로스 50>200 (+10)
      if (golden) score += 10;

      // ④ 12M 수익률 (+15/+5)
      if (r12m > 0) score += 15;
      else if (r12m > -10) score += 5;

      // ⑤ 3M 수익률 (+10)
      if (r3m > 0) score += 10;

      // ⑥ 섹터 브레드스 (+10)
      if (totalSectors > 0) {
        const ratio = upSectorCount / totalSectors;
        if (ratio >= 0.8)      score += 10;
        else if (ratio >= 0.6) score += 7;
        else if (ratio >= 0.4) score += 3;
      }

      // ⑦ MACD 가감점 (-10~+10)
      const macd = calcMACD(bars);
      score += macd.score;

      // ⑧ OBV 가감점 (-5~+5)
      const obv = calcOBV(bars);
      score += obv.score;

      // ⑨ VIX 페널티 (공통)
      if (vix >= 30)      score -= 20;
      else if (vix >= 25) score -= 15;
      else if (vix >= 20) score -= 5;

      return { score: Math.max(0, Math.min(score, 100)), macd, obv };
    }

    /* ── 모드 결정 함수 ── */
    function getMode(score) {
      if (score >= 70) return { mode:"공격", color:"#3fb950", icon:"🟢", action:"정상매매", pct:100 };
      if (score >= 50) return { mode:"중립", color:"#ffd600", icon:"🟡", action:"비중 60%", pct:60 };
      if (score >= 30) return { mode:"방어", color:"#ff922b", icon:"🟠", action:"비중 30%", pct:30 };
      return              { mode:"위기", color:"#f85149", icon:"🔴", action:"비중 10%", pct:10 };
    }

    /* ── 미국 점수 계산 ── */
    const upSectors = sectorResults.filter(s => s.r3m > 0).length;
    const spyGolden = !!(spy50 && spy200 && spy50 > spy200);
    const usResult = calcMarketScore(spyBars, spyAbove200, spy50>spy200, spyGolden, spy12m, spy3m, upSectors, sectorResults.length, vixVal);
    const usMode = getMode(usResult.score);

    results.health = {
      score: usResult.score,
      mode: usMode.mode, modeColor: usMode.color, modeIcon: usMode.icon, modeAction: usMode.action,
      details: {
        spyAbove200, spy200Rising: spy200 && spyBars.length>220 ? spy200>sma(spyBars.slice(0,-20),200) : true,
        spyGoldenCross: spyGolden,
        spy12mPositive: spy12m > 0,
        vixLow: vixVal < 25,
        kospiAbove200: results.kospi?.above200 || false,
        sectorBreadth: `${upSectors}/${sectorResults.length}`,
        macd: usResult.macd.signal,
        obv: usResult.obv.signal,
      }
    };

    /* ── 한국 점수 계산 ── */
    const kospiAbove200 = results.kospi?.above200 || false;
    const kospiAbove50  = results.kospi?.above50  || false;
    const kospi12m      = results.kospi?.r12m || 0;
    const kospi3m       = results.kospi?.r3m  || 0;
    const krUpSectors   = (results.krSectors||[]).filter(s=>s.r3m>0).length;
    const krTotalSectors= (results.krSectors||[]).length || 1;
    const kospiGolden   = kospiAbove50 && kospiAbove200;

    /* KOSPI bars — Naver fchart에서 이미 받은 closes 배열로 bars 재구성 */
    let krResult = { score: 0, macd: { signal:'neutral' }, obv: { signal:'neutral' } };
    try {
      const kospiTs2 = Date.now();
      const kospiR2 = await fetch(
        `https://fchart.stock.naver.com/sise.nhn?symbol=KOSPI&timeframe=day&count=320&requestType=0&_=${kospiTs2}`,
        { headers: { "User-Agent":"Mozilla/5.0","Referer":"https://finance.naver.com/","Cache-Control":"no-cache" } }
      );
      if (kospiR2.ok) {
        const xml2 = await kospiR2.text();
        const items2 = xml2.match(/data="([^"]+)"/g)||[];
        const kBars = items2.map(m=>{
          const p=m.split("|");
          return { close:parseFloat(p[4]), volume:parseFloat(p[5])||0 };
        }).filter(b=>!isNaN(b.close));
        krResult = calcMarketScore(kBars, kospiAbove200, kospiAbove50, kospiGolden, kospi12m, kospi3m, krUpSectors, krTotalSectors, vixVal);
      }
    } catch(e) {
      // fallback: 보조지표 없이 기본 계산
      let s = 0;
      if (kospiAbove200) s+=25;
      if (kospiAbove50)  s+=10;
      if (kospiGolden)   s+=10;
      if (kospi12m>0)    s+=15; else if(kospi12m>-10) s+=5;
      if (kospi3m>0)     s+=10;
      if (vixVal>=30)    s-=20; else if(vixVal>=25) s-=15; else if(vixVal>=20) s-=5;
      krResult.score = Math.max(0, Math.min(s, 100));
    }
    const krMode = getMode(krResult.score);

    results.krHealth = {
      score: krResult.score,
      mode: krMode.mode, modeColor: krMode.color, modeIcon: krMode.icon, modeAction: krMode.action,
      details: {
        kospiAbove200, kospiAbove50, kospiGolden,
        kospi12mPositive: kospi12m>0,
        vixLow: vixVal<25,
        macd: krResult.macd.signal,
        obv: krResult.obv.signal,
      }
    };

    /* ── 허용 비중 (4단계 통일) ── */
    results.maxPositionPct   = usMode.pct;
    results.krMaxPositionPct = krMode.pct;

    return res.status(200).json({ data: results, ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
