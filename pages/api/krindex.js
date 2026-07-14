/* 네이버 fchart 프록시 — KOSPI/KOSDAQ 지수
   클라이언트 직접 호출 시 CORS 차단되므로 서버 라우트에서 대신 조회 */
export default async function handler(req, res) {
  const fetchIdx = async (sym) => {
    const url = `https://fchart.stock.naver.com/sise.nhn?symbol=${sym}&timeframe=day&count=3&requestType=0&_=${Date.now()}`;
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://finance.naver.com/" },
    });
    if (!r.ok) return null;
    const xml = await r.text();
    const items = xml.match(/data="([^"]+)"/g) || [];
    const closes = items.map(m => parseFloat(m.split("|")[4])).filter(v => !isNaN(v));
    if (closes.length < 2) return null;
    const cur = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    return { price: +cur.toFixed(2), chg: prev ? +((cur - prev) / prev * 100).toFixed(2) : 0 };
  };
  try {
    const [kospi, kosdaq] = await Promise.all([fetchIdx("KOSPI"), fetchIdx("KOSDAQ")]);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=120");
    res.status(200).json({ kospi, kosdaq });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
