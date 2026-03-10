/* /pages/api/indices.js — 미국 3대 지수 현재가 + 당일 등락률 */
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Access-Control-Allow-Origin', '*');

  async function fetchIndex(symbol) {
    const hosts = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
    for (const host of hosts) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        /* 1분봉 + 당일 range=1d → meta에 정확한 당일 등락률 포함 */
        const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=false&_=${Date.now()}`;
        const r = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          signal: controller.signal
        });
        clearTimeout(timer);
        if (!r.ok) continue;
        const json = await r.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) continue;

        /* 등락률: regularMarketChangePercent 우선, 없으면 previousClose 계산 */
        let chg = 0;
        if (meta.regularMarketChangePercent != null) {
          chg = +meta.regularMarketChangePercent.toFixed(2);
        } else {
          const prev = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPreviousClose;
          if (prev) chg = +((meta.regularMarketPrice - prev) / prev * 100).toFixed(2);
        }

        return { price: +meta.regularMarketPrice.toFixed(2), chg };
      } catch(e) {
        clearTimeout(timer);
      }
    }
    return null;
  }

  try {
    const [dji, gspc, ixic] = await Promise.all([
      fetchIndex('^DJI'),
      fetchIndex('^GSPC'),
      fetchIndex('^IXIC'),
    ]);
    res.status(200).json({ ok: true, data: { dji, gspc, ixic } });
  } catch(e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
