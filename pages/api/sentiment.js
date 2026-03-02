/* /pages/api/sentiment.js — 시장 심리지수 실시간 수집 (미국주식 전용) */
export default async function handler(req, res) {
  const results = {};

  async function safeFetch(url, opts = {}) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      const resp = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
        signal: controller.signal,
        ...opts
      });
      clearTimeout(timer);
      if (!resp.ok) return { ok: false, status: resp.status };
      return { ok: true, data: await resp.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  /* ── 1. CNN Fear & Greed Index ── */
  let fgDone = false;
  const fgResp = await safeFetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata");
  if (fgResp.ok && fgResp.data) {
    const d = fgResp.data;
    const fg = d.fear_and_greed || d;
    if (fg && fg.score != null) {
      const score = Math.round(fg.score);
      results.fearGreed = {
        score,
        rating: fg.rating || "",
        prev: fg.previous_close != null ? Math.round(fg.previous_close) : null,
        weekAgo: fg.previous_1_week != null ? Math.round(fg.previous_1_week) : null,
        monthAgo: fg.previous_1_month != null ? Math.round(fg.previous_1_month) : null,
        level: score <= 25 ? "극단적공포" : score <= 45 ? "공포" : score <= 55 ? "중립" : score <= 75 ? "탐욕" : "극단적탐욕"
      };
      fgDone = true;
    }
  }

  // CNN 실패 시 → VIX 기반 심리 추정
  if (!fgDone) {
    const vixResp = await safeFetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=3mo&interval=1d");
    if (vixResp.ok) {
      const result = vixResp.data?.chart?.result?.[0];
      if (result?.timestamp) {
        const closes = result.indicators.quote[0].close.filter(v => v != null);
        const vixNow = closes[closes.length - 1];
        const vix5d = closes.length >= 5 ? closes.slice(-5).reduce((a, b) => a + b, 0) / 5 : vixNow;
        // VIX → Fear/Greed 변환 (역수관계)
        const fgScore = Math.max(0, Math.min(100, Math.round(100 - (vixNow - 10) * 3.6)));
        results.fearGreed = {
          score: fgScore,
          rating: "VIX-based",
          prev: Math.max(0, Math.min(100, Math.round(100 - (vix5d - 10) * 3.6))),
          weekAgo: null, monthAgo: null,
          level: fgScore <= 25 ? "극단적공포" : fgScore <= 45 ? "공포" : fgScore <= 55 ? "중립" : fgScore <= 75 ? "탐욕" : "극단적탐욕",
          vixBased: true, vixValue: +vixNow.toFixed(2),
          note: "CNN 접근불가 → VIX 기반 추정"
        };
        fgDone = true;
      }
    }
    if (!fgDone) {
      results.fearGreed = { score: null, error: "CNN+VIX 모두 실패" };
    }
  }

  await sleep(500);

  /* ── 2. Put/Call Ratio + VIX 상세 ── */
  const vixResp2 = await safeFetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?range=1mo&interval=1d");
  if (vixResp2.ok) {
    const r = vixResp2.data?.chart?.result?.[0];
    if (r?.timestamp) {
      const closes = r.indicators.quote[0].close.filter(v => v != null);
      const vixNow = closes[closes.length - 1];
      const vixAvg = closes.length >= 20 ? closes.slice(-20).reduce((a, b) => a + b, 0) / 20 : vixNow;
      const estPC = +(0.45 + vixNow * 0.022).toFixed(2);
      results.putCall = {
        ratio: estPC, vixCur: +vixNow.toFixed(2),
        vixAvg20: +vixAvg.toFixed(2),
        level: estPC >= 1.0 ? "공포 과도 (반등 시그널)" : estPC >= 0.85 ? "경계" : estPC >= 0.7 ? "중립" : "낙관 과도 (하락 경계)",
        note: "VIX 기반 추정"
      };
    }
  }
  if (!results.putCall) results.putCall = { ratio: null, error: "VIX 조회 실패" };

  /* ── 3. 역발상 시그널 ── */
  const fgScore = results.fearGreed?.score;
  if (fgScore != null) {
    if (fgScore <= 20) results.contrarian = { signal: "극단적 공포 → 매수 기회 탐색", color: "#3fb950", icon: "🟢" };
    else if (fgScore <= 35) results.contrarian = { signal: "공포 구간 → 분할 매수 고려", color: "#58a6ff", icon: "🔵" };
    else if (fgScore <= 55) results.contrarian = { signal: "중립 → 기존 전략 유지", color: "#ffd600", icon: "🟡" };
    else if (fgScore <= 75) results.contrarian = { signal: "탐욕 → 신규 매수 비중 축소", color: "#ff922b", icon: "🟠" };
    else results.contrarian = { signal: "극단적 탐욕 → 이익실현 고려, 신규매수 자제", color: "#f85149", icon: "🔴" };
  }

  results.timestamp = new Date().toISOString();
  return res.status(200).json({ data: results, ok: true });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
