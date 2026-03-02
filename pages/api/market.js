/* /pages/api/market.js — 시장 필터 실시간 데이터 */
export default async function handler(req, res) {
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

    /* ── 3. KOSPI ── */
    try {
      const kospiBars = await fetchChart("^KS11");
      const kospiCur = kospiBars[kospiBars.length - 1].close;
      const kospi200 = sma(kospiBars, 200);
      const kospi12m = returnPct(kospiBars, 252) || returnPct(kospiBars, kospiBars.length - 1);
      results.kospi = {
        price: +kospiCur.toFixed(2),
        sma200: kospi200 ? +kospi200.toFixed(2) : null,
        above200: kospi200 ? kospiCur > kospi200 : null,
        r12m: kospi12m
      };
    } catch (e) {
      results.kospi = { price: null, r12m: null, above200: null };
    }

    await sleep(500);

    /* ── 4. 섹터 ETF 상대강도 (3M 수익률 기준) ── */
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

    /* ── 5. 시장 건강도 판정 ── */
    const vixVal = results.vix?.value || 20;
    
    // 점수 계산 (100점 만점)
    let healthScore = 0;

    // SPY > 200MA (+25)
    if (spyAbove200) healthScore += 25;
    // SPY 200MA 상승 추세 (+10)
    if (spy200Trend) healthScore += 10;
    // SPY 50 > 200 (골든크로스) (+10)
    if (spy50 && spy200 && spy50 > spy200) healthScore += 10;
    // SPY 12M 수익률 양수 (+15)
    if (spy12m > 0) healthScore += 15;
    else if (spy12m > -10) healthScore += 5;
    // VIX < 20 (+15), < 25 (+10), < 30 (+5)
    if (vixVal < 20) healthScore += 15;
    else if (vixVal < 25) healthScore += 10;
    else if (vixVal < 30) healthScore += 5;
    // KOSPI > 200MA (+10)
    if (results.kospi?.above200) healthScore += 10;
    // 섹터 breadth: 상승 섹터 수 (+15)
    const upSectors = sectorResults.filter(s => s.r3m > 0).length;
    if (upSectors >= 9) healthScore += 15;
    else if (upSectors >= 7) healthScore += 10;
    else if (upSectors >= 5) healthScore += 5;

    // 모드 결정
    let mode, modeColor, modeIcon, modeAction;
    if (healthScore >= 70) {
      mode = "공격"; modeColor = "#3fb950"; modeIcon = "🟢";
      modeAction = "정상매매 비중100%";
    } else if (healthScore >= 50) {
      mode = "방어"; modeColor = "#ffd600"; modeIcon = "🟡";
      modeAction = "비중 50%로 축소, 신규매수 자제";
    } else if (healthScore >= 30) {
      mode = "경계"; modeColor = "#ff922b"; modeIcon = "🟠";
      modeAction = "비중 25%, 손절 타이트";
    } else {
      mode = "회피"; modeColor = "#f85149"; modeIcon = "🔴";
      modeAction = "신규매수 금지, 현금 비중 확대";
    }

    results.health = {
      score: healthScore,
      mode, modeColor, modeIcon, modeAction,
      details: {
        spyAbove200: spyAbove200,
        spy200Rising: spy200Trend,
        spyGoldenCross: spy50 && spy200 ? spy50 > spy200 : false,
        spy12mPositive: spy12m > 0,
        vixLow: vixVal < 25,
        kospiAbove200: results.kospi?.above200 || false,
        sectorBreadth: `${upSectors}/${sectorResults.length}`
      }
    };

    return res.status(200).json({ data: results, ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
