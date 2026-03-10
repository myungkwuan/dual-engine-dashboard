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

    // KR 별도 건강도
    const kospiAbove200 = results.kospi?.above200 || false;
    const kospiAbove50  = results.kospi?.above50  || false;
    const kospi12m      = results.kospi?.r12m || 0;
    const kospi3m       = results.kospi?.r3m  || 0;
    let krScore = 0;
    if (kospiAbove200) krScore += 35;
    if (kospiAbove50)  krScore += 20;
    if (kospi12m > 0)  krScore += 25;
    else if (kospi12m > -10) krScore += 10;
    if (kospi3m > 0)   krScore += 20;
    // VIX 페널티
    if (vixVal >= 30)      krScore -= 45;
    else if (vixVal >= 25) krScore -= 35;
    krScore = Math.max(0, krScore);
    let krMode, krColor, krIcon, krAction;
    if (krScore >= 70)      { krMode="공격"; krColor="#3fb950"; krIcon="🟢"; krAction="정상매매 비중100%"; }
    else if (krScore >= 50) { krMode="방어"; krColor="#ffd600"; krIcon="🟡"; krAction="비중 50% 축소"; }
    else if (krScore >= 30) { krMode="경계"; krColor="#ff922b"; krIcon="🟠"; krAction="비중 25%, 신중"; }
    else                    { krMode="회피"; krColor="#f85149"; krIcon="🔴"; krAction="신규매수 금지"; }
    results.krHealth = { score: krScore, mode: krMode, modeColor: krColor, modeIcon: krIcon, modeAction: krAction };

    // maxPositionPct (US/KR 각각)
    results.maxPositionPct   = healthScore >= 70 ? 100 : healthScore >= 50 ? 50 : healthScore >= 30 ? 25 : 0;
    results.krMaxPositionPct = krScore >= 70 ? 100 : krScore >= 50 ? 50 : krScore >= 30 ? 25 : 0;

    return res.status(200).json({ data: results, ok: true });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
