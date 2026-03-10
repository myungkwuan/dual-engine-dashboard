/* /pages/api/indices.js — 미국 3대 지수 현재가 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const symbols = [
    { key: 'dji',  sym: '%5EDJI'  },
    { key: 'gspc', sym: '%5EGSPC' },
    { key: 'ixic', sym: '%5EIXIC' },
  ];

  async function fetchIndex(sym) {
    const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    for (const host of hosts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const url = `https://${host}/v8/finance/chart/${sym}?interval=1d&range=5d&includePrePost=false&_=${Date.now()}`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!res.ok) continue;
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;
        const chg = meta.regularMarketChangePercent
          ? +meta.regularMarketChangePercent.toFixed(2)
          : (() => {
              const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPreviousClose;
              return prev ? +((meta.regularMarketPrice - prev) / prev * 100).toFixed(2) : 0;
            })();
        return { price: +meta.regularMarketPrice.toFixed(2), chg };
      } catch(e) {
        clearTimeout(timer);
      }
    }
    return null;
  }

  try {
    const results = {};
    await Promise.all(symbols.map(async ({ key, sym }) => {
      results[key] = await fetchIndex(sym);
    }));
    res.status(200).json({ ok: true, data: results });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
