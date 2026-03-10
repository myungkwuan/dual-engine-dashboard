/* pages/api/sectorTrend.js
   섹터별 주간 수익률 추세 API
   - 한국/미국 분리
   - 섹터당 점수 TOP 3 종목의 10거래일 수익률 평균
   - 기준일(D-10) 대비 누적 수익률 반환

   [핵심 버그 수정]
   - 이전: 섹터명만으로 KR+US 혼합 그룹핑 → TOP3 선정
     결과: '반도체' TOP3가 KR 종목으로 채워지면 US 반도체 = 0개 → 미국 탭 반도체 미표시
           '전력에너지' TOP3가 US 종목으로 채워지면 KR 전력에너지 = 0개 → 한국 탭 전력에너지 미표시
   - 수정: KR, US 각각 독립적으로 섹터별 TOP3 선정
*/
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  const { stocks } = req.body; // [{t, k, s, score, n, verdict, p}]
  if (!stocks || !Array.isArray(stocks)) return res.status(400).json({ error: "stocks required" });

  /* ── KR / US 먼저 분리 ── */
  const krAllStocks = stocks.filter(s => s.k);
  const usAllStocks = stocks.filter(s => !s.k && s.s !== "ETF");

  /* ── 시장별 독립 가변 바스켓 선정 ── */
  function getTop3PerSector(marketStocks) {
    const sectorMap = {};
    marketStocks.forEach(stock => {
      if (!sectorMap[stock.s]) sectorMap[stock.s] = [];
      sectorMap[stock.s].push(stock);
    });
    const targets = [];
    Object.entries(sectorMap).forEach(([sector, list]) => {
      // 가변 바스켓: 종목 수에 따라 Top3/4/5
      const n = list.length;
      const topN = n >= 13 ? 5 : n >= 7 ? 4 : 3;
      // 실시간 가격 있는 종목 우선, 점수 내림차순
      const withPrice = list.filter(s => s.p && s.p > 0);
      const pool = withPrice.length >= 2 ? withPrice : list;
      const top = pool.sort((a, b) => b.score - a.score).slice(0, topN);
      top.forEach(s => targets.push({ ...s, sector }));
    });
    return targets;
  }

  const krTargets = getTop3PerSector(krAllStocks);
  const usTargets = getTop3PerSector(usAllStocks);
  const allTargets = [...krTargets, ...usTargets];

  /* ── Yahoo Finance fetch ── */
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  async function fetchBars(ticker, isKR) {
    let symbol = isKR ? `${ticker}.KS` : ticker;
    if (ticker.endsWith('.KQ') || ticker.endsWith('.KS')) symbol = ticker;

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d&includePrePost=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000)
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
      if (q.close[i] != null) {
        bars.push({
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          close: adj?.[i] || q.close[i]
        });
      }
    }
    return bars;
  }

  /* ── 10거래일 날짜 축 생성 ── */
  function getLast10TradingDates(allBars) {
    const dateSet = new Set();
    allBars.forEach(bars => bars.forEach(b => dateSet.add(b.date)));
    return [...dateSet].sort().slice(-10);
  }

  /* ── 배치 fetch (4개씩, 1.5초 간격) ── */
  const batchSize = 4;
  const rawData = {};

  for (let i = 0; i < allTargets.length; i += batchSize) {
    const batch = allTargets.slice(i, i + batchSize);
    await Promise.all(batch.map(async s => {
      try {
        rawData[s.t] = await fetchBars(s.t, s.k);
      } catch (e) {
        rawData[s.t] = null;
      }
    }));
    if (i + batchSize < allTargets.length) await sleep(1500);
  }

  /* ── 시장별 날짜 축 확정 ── */
  const krDates = getLast10TradingDates(krTargets.map(s => rawData[s.t] || []));
  const usDates = getLast10TradingDates(usTargets.map(s => rawData[s.t] || []));

  /* ── 수익률 계산 ── */
  function calcSectorTrend(marketTargets, dates) {
    if (!dates.length) return { dates: [], sectors: [], data: [] };

    const sectors = [...new Set(marketTargets.map(s => s.sector))].sort();

    const result = dates.map(date => {
      const point = { date };
      sectors.forEach(sector => {
        const sectorStocks = marketTargets.filter(s => s.sector === sector);
        const returns = sectorStocks
          .map(s => {
            const bars = rawData[s.t];
            if (!bars || bars.length < 2) return null;
            const baseBar = bars.find(b => b.date === dates[0]) || bars[0];
            const todayBar = bars.find(b => b.date === date);
            if (!baseBar || !todayBar || baseBar.close === 0) return null;
            return ((todayBar.close - baseBar.close) / baseBar.close) * 100;
          })
          .filter(v => v !== null);

        if (returns.length > 0) {
          point[sector] = Math.round((returns.reduce((a, b) => a + b, 0) / returns.length) * 100) / 100;
        }
      });
      return point;
    });

    return { dates, sectors, data: result };
  }

  /* ── 섹터별 종목 목록 (전체 종목 + TOP3 마킹) ── */
  function getSectorStockList(allMarketStocks, top3Targets) {
    const top3Set = new Set(top3Targets.map(s => s.t));
    const map = {};
    allMarketStocks.forEach(s => {
      if (!map[s.s]) map[s.s] = [];
      map[s.s].push({ t: s.t, n: s.n, score: s.score, verdict: s.verdict, isTop3: top3Set.has(s.t) });
    });
    Object.values(map).forEach(list => list.sort((a, b) => b.score - a.score));
    return map;
  }

  const kr = calcSectorTrend(krTargets, krDates);
  const us = calcSectorTrend(usTargets, usDates);

  function getRanking(trendResult) {
    const last = trendResult.data[trendResult.data.length - 1] || {};
    return trendResult.sectors
      .map(s => ({ sector: s, ret: last[s] ?? 0 }))
      .sort((a, b) => b.ret - a.ret);
  }

  return res.status(200).json({
    kr: { ...kr, ranking: getRanking(kr), stockList: getSectorStockList(krAllStocks, krTargets) },
    us: { ...us, ranking: getRanking(us), stockList: getSectorStockList(usAllStocks, usTargets) },
    updatedAt: new Date().toISOString()
  });
}
