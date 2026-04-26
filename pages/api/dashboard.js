/* /pages/api/dashboard.js
 * 듀얼엔진 종목 풀 데이터 노출 엔드포인트
 * - data.js의 D 배열 그대로 반환
 * - Jang's Analyst 등 외부 앱에서 사용
 * - 명관 화면 분석 결과와 동일한 데이터
 */
import D from '../../src/data';

export default function handler(req, res) {
  // CORS 허용 (외부 앱에서 호출 가능)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // OPTIONS 프리플라이트 응답
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'GET only' });
  }
  
  // 캐시 정책: 5분 (CDN 캐싱)
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
  
  try {
    // 통계 정보 추가
    const us = D.filter(s => s.k === 0);
    const kr = D.filter(s => s.k === 1);
    const high80 = D.filter(s => s.f >= 80).length;
    
    return res.status(200).json({
      data: D,
      meta: {
        total: D.length,
        us_count: us.length,
        kr_count: kr.length,
        high_score_count: high80,  // f >= 80 종목 수
        timestamp: new Date().toISOString(),
        version: '1.0'
      }
    });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
