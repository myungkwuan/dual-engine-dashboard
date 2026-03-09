// ============================================================
// quotes.js  — 한국: 네이버금융 API / 미국: Yahoo Finance
// Yahoo Finance가 Vercel 서버 IP를 차단하므로
// 한국 주식은 네이버 금융 모바일 API 사용 (차단 없음)
// ============================================================

// ── 한국 주식: 네이버금융 모바일 API ──────────────────────
// https://m.stock.naver.com/api/stock/{code}/basic
// closePrice = 현재가(장중) or 당일종가(장마감)
// fluctuationsRatio = 등락률(%)
async function fetchKRQuote(ticker) {
  const url = `https://m.stock.naver.com/api/stock/${ticker}/basic`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
        'Referer': 'https://m.stock.naver.com/',
        'Accept': 'application/json',
      },
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Naver ${res.status}`);
    const json = await res.json();
    // closePrice는 문자열 "78,900" 형식
    const price = parseFloat((json.closePrice || '').replace(/,/g, ''));
    const pct   = parseFloat(json.fluctuationsRatio || '0');
    if (!price || isNaN(price)) throw new Error(`No price: ${JSON.stringify(json)}`);
    return { price: Math.round(price), change_pct: pct };
  } catch(e) {
    clearTimeout(timeout);
    throw e;
  }
}

// ── 미국 주식: Yahoo Finance (query2 → query1 폴백) ─────────
async function fetchUSQuote(symbol) {
  const ts = Date.now();
  const hosts = ['query2.finance.yahoo.com', 'query1.finance.yahoo.com'];
  for (const host of hosts) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d&includePrePost=false&_=${ts}`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
          'Cache-Control': 'no-cache',
        },
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (!res.ok) continue;
      const json = await res.json();
      const meta = json.chart?.result?.[0]?.meta;
      if (!meta?.regularMarketPrice) continue;
      const prevClose = meta.previousClose || meta.chartPreviousClose || meta.regularMarketPreviousClose;
      const change_pct = prevClose
        ? Math.round((meta.regularMarketPrice - prevClose) / prevClose * 10000) / 100
        : 0;
      return {
        price: Math.round(meta.regularMarketPrice * 100) / 100,
        change_pct
      };
    } catch(e) {
      clearTimeout(timeout);
    }
  }
  throw new Error(`Yahoo failed: ${symbol}`);
}

// ── 메인 핸들러 ───────────────────────────────────────────
export default async function handler(req, res) {
  // Vercel Edge 캐시 완전 비활성화
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers))
      return res.status(400).json({ error: 'tickers required' });

    const promises = tickers.map(async (tk) => {
      try {
        let q;
        if (tk.k) {
          // 한국 주식 → 네이버금융
          q = await fetchKRQuote(tk.t);
        } else {
          // 미국 주식 → Yahoo Finance
          q = await fetchUSQuote(tk.t);
        }
        return { ticker: tk.t, ok: true, data: q };
      } catch(e) {
        return { ticker: tk.t, ok: false, err: e.message };
      }
    });

    const settled = await Promise.allSettled(promises);
    const results = {};
    let okCount = 0;
    const errors = {};

    for (const s of settled) {
      if (s.status === 'fulfilled') {
        if (s.value.ok) {
          results[s.value.ticker] = s.value.data;
          okCount++;
        } else {
          errors[s.value.ticker] = s.value.err;
        }
      }
    }

    return res.status(200).json({
      ok: okCount,
      total: tickers.length,
      data: results,
      errors,
      timestamp: new Date().toISOString()
    });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
