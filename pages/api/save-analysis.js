/* /pages/api/save-analysis.js
 * 명관 앱에서 분석 완료 후 호출
 * - totalPt 포함된 전체 종목 데이터를 Vercel KV에 저장
 * - Jang's Analyst가 /api/dashboard 호출 시 이 데이터 반환
 */
import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // CORS (명관 앱 자체에서 호출되므로 사실 불필요하지만 안전장치)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }
  
  try {
    const { stocks, timestamp } = req.body || {};
    
    // 검증
    if (!Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({ error: 'stocks array required' });
    }
    
    // 너무 많거나 너무 적으면 거부 (안전장치)
    if (stocks.length < 50 || stocks.length > 1000) {
      return res.status(400).json({ 
        error: `invalid stocks count: ${stocks.length}` 
      });
    }
    
    // 각 종목에 totalPt가 있는지 검증
    const validStocks = stocks.filter(s => 
      s && typeof s.t === 'string' && typeof s.totalPt === 'number'
    );
    
    if (validStocks.length < 50) {
      return res.status(400).json({ 
        error: `not enough valid stocks with totalPt: ${validStocks.length}` 
      });
    }
    
    // KV에 저장 (24시간 TTL)
    const payload = {
      stocks: validStocks,
      timestamp: timestamp || new Date().toISOString(),
      count: validStocks.length,
    };
    
    await kv.set('dashboard_analysis', payload, { ex: 86400 }); // 24시간
    
    return res.status(200).json({ 
      ok: true,
      saved: validStocks.length,
      timestamp: payload.timestamp,
    });
  } catch (e) {
    console.error('[save-analysis] error:', e);
    return res.status(500).json({ error: e.message });
  }
}
