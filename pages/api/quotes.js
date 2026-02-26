const KOSDAQ = new Set(["042700","058470","403870","058610","277810","454910","098460","108490","022100","196170","253840","237690","247540","066970","278470","214450","257720","214150","192820","041190","112040","094480","063170","036930","039030","067310","036540","489790","067160","012510","377300","323410","046440","036800","035600","083650","105840","450190","253450","389260","322000","011930","229640","204320"]);
const KR_ETF = new Set(["069500","229200","114800","251340"]);

function toYahoo(t, k) {
  if (!k) return t;
  if (KR_ETF.has(t)) return t + ".KS";
  if (KOSDAQ.has(t)) return t + ".KQ";
  return t + ".KS";
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const json = await res.json();
  const meta = json.chart.result[0].meta;
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose || meta.chartPreviousClose;
  const change_pct = prevClose ? Math.round((price - prevClose) / prevClose * 10000) / 100 : 0;
  return { price, change_pct };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  try {
    const { tickers } = req.body;
    if (!tickers || !Array.isArray(tickers)) return res.status(400).json({ error: "tickers required" });

    const results = {};
    const BATCH = 5;

    for (let i = 0; i < tickers.length; i += BATCH) {
      const chunk = tickers.slice(i, i + BATCH);

      for (const tk of chunk) {
        const sym = toYahoo(tk.t, tk.k);
        try {
          const q = await fetchQuote(sym);
          results[tk.t] = {
            price: tk.k ? Math.round(q.price) : Math.round(q.price * 100) / 100,
            change_pct: q.change_pct
          };
        } catch(e) {
          console.error("Fail:", sym, e.message?.substring(0, 50));
        }
      }

      console.log(`[quotes] ${Math.min(i + BATCH, tickers.length)}/${tickers.length} done`);
      if (i + BATCH < tickers.length) await sleep(3000);
    }

    return res.status(200).json({ ok: Object.keys(results).length, total: tickers.length, data: results, timestamp: new Date().toISOString() });
  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
}
