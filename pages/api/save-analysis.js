/* /pages/api/save-analysis.js
 * 명관 앱에서 분석 완료 후 호출
 * - totalPt 포함된 전체 종목 데이터를 Upstash Redis에 저장
 * - Jang's Analyst가 /api/dashboard 호출 시 이 데이터 반환
 */
import { createClient } from 'redis';

// ─── Lazy Redis 클라이언트 (Vercel serverless 재사용) ───
let _redisClient = null;
async function getRedis() {
  if (!_redisClient) {
    _redisClient = createClient({ url: process.env.REDIS_URL });
    _redisClient.on('error', err => console.error('[Redis] error:', err.message));
  }
  if (!_redisClient.isOpen) {
    await _redisClient.connect();
  }
  return _redisClient;
}

export default async function handler(req, res) {
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
    
    // Redis에 저장 (24시간 TTL) — node-redis는 EX 대문자
    const payload = {
      stocks: validStocks,
      timestamp: timestamp || new Date().toISOString(),
      count: validStocks.length,
    };
    
    const client = await getRedis();
    await client.set('dashboard_analysis', JSON.stringify(payload), { EX: 86400 });
    
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
