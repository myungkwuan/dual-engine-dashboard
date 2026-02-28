# 듀얼엔진 대시보드 수정 지시서 (Claude Code용)

> 이 파일을 Claude Code에서 열고 "이 지시서대로 수정해줘"라고 말하세요.

---

## 프로젝트 위치
```
cd Desktop/dual-engine-dashboard
```

## 수정 범위
총 3가지 수정을 적용합니다:
- **수정 #1**: 메인 테이블에 '종합판정' 컬럼 추가
- **수정 #2**: 체크리스트를 4엔진 기반 10단계로 교체
- **수정 #3**: 종목 클릭 시 4엔진 상세분석 모달 추가

---

## 수정 #1: '종합판정' 컬럼 추가

### 위치
메인 테이블 (pages/index.js 또는 해당 컴포넌트)의 테이블 헤더와 각 행에 새 컬럼을 추가합니다.

### 로직
각 종목의 4엔진 일치도를 자동 계산하여 5단계 종합판정을 표시합니다.

```javascript
// 종합판정 계산 함수 - 기존 코드에 추가
function getVerdict(stock) {
  // 1) MF 점수 확인
  const mfScore = stock.total || stock.mfScore || 0;
  const qualityScore = stock.q || stock.quality || 0;
  const mfGrade = mfScore >= 80 ? 'A' : mfScore >= 70 ? 'B' : mfScore >= 60 ? 'C' : 'F';
  
  // 2) SEPA 신호 확인 (22일/50일 고가 돌파)
  const getSepaLevel = (signal) => {
    if (!signal) return 0;
    const s = String(signal);
    if (s.includes('🚀') || s.includes('돌파')) return 3; // 돌파
    const num = parseFloat(s);
    if (isNaN(num)) return 0;
    if (num > -5) return 2;   // 근접
    if (num > -10) return 1;  // 조정
    return 0;                  // 이탈
  };
  const sepa22 = getSepaLevel(stock.s22 || stock.signal22);
  const sepa50 = getSepaLevel(stock.s50 || stock.signal50);
  const sepaLevel = sepa22 >= 3 && sepa50 >= 3 ? '강력매수' 
                  : sepa22 >= 3 ? '매수'
                  : sepa22 >= 2 ? '관심'
                  : sepa22 >= 1 ? '대기' : '회피';
  
  // 3) VCP 점수 확인 (대시보드의 VCP 성숙도)
  const vcpScore = stock.vcp || stock.vcpScore || 0;
  
  // 4) CF(FCF) 확인
  const hasFCF = stock.fcf === true || stock.fcf === '✔' || stock.cf === true || 
                 (stock.b && (stock.b === '✔' || stock.b > 0));
  
  // --- 종합판정 ---
  let verdict, color, stars;
  
  const sepaOK = (sepaLevel === '강력매수' || sepaLevel === '매수');
  const sepaWatch = (sepaLevel === '관심');
  
  if (mfScore >= 80 && sepaOK && vcpScore >= 7 && hasFCF) {
    verdict = '🔥최강'; color = '#ff1744'; stars = 5;
  } else if (mfScore >= 80 && sepaOK && vcpScore >= 5 && hasFCF) {
    verdict = '🟢강력'; color = '#00e676'; stars = 4;
  } else if (mfScore >= 70 && (sepaOK || sepaWatch) && vcpScore >= 5) {
    verdict = '🔵양호'; color = '#448aff'; stars = 3;
  } else if (mfScore >= 60 && sepa22 >= 3) {
    verdict = '🟡모멘텀'; color = '#ffd600'; stars = 2;
  } else {
    verdict = '⛔금지'; color = '#78909c'; stars = 1;
  }
  
  return { verdict, color, stars, 
           details: { mfGrade, mfScore, sepaLevel, vcpScore, hasFCF } };
}
```

### 테이블 헤더 수정
'등급' 컬럼 앞에 '종합판정' 컬럼을 추가합니다:

```
기존: # | 종목 | 섹터 | 현재가 | 등락 | 펀더 | B | 단기 | 중기 | 장기 | 등급
수정: # | 종목 | 섹터 | 현재가 | 등락 | 펀더 | B | 종합판정 | 단기 | 중기 | 장기 | 등급
```

### 종합판정 컬럼 렌더링
```jsx
// 테이블 각 행에 종합판정 셀 추가
<td style={{
  textAlign: 'center',
  padding: '4px 8px',
  background: verdict.color + '15',
  borderLeft: `2px solid ${verdict.color}`,
  minWidth: '80px'
}}>
  <div style={{ fontSize: '13px', fontWeight: 800, color: verdict.color }}>
    {verdict.verdict}
  </div>
  <div style={{ fontSize: '10px', color: '#666', marginTop: '2px' }}>
    {'⭐'.repeat(verdict.stars)}
  </div>
</td>
```

### '종합판정' 정렬 버튼 추가
기존 정렬 옵션(듀얼, MF, SEPA, VCP, CF)에 '종합판정순' 정렬 추가:
- 정렬 기준: stars 내림차순 → mfScore 내림차순

### 상단 요약 바에 종합판정 카운트 추가
```
기존: 127 상승 | 82 하락 | 14 매수준비 | 33 VCP성숙
추가: 🔥N최강 | 🟢N강력 도 표시
```

---

## 수정 #2: 체크리스트 4엔진 기반 10단계로 교체

### 위치
'체크리스트' 탭 (현재 9개 항목)을 아래 10개 항목으로 완전 교체합니다.

### 새 체크리스트 구조
종목을 선택하면 #1~#7이 자동으로 체크/언체크됩니다.

```jsx
// 체크리스트 상태 관리
const [selectedStock, setSelectedStock] = useState(null);
const [manualChecks, setManualChecks] = useState({ c9: false, c10: false });

// 체크리스트 아이템 정의
const checklistItems = [
  { id: 'c1', engine: 'MF', label: 'MF 종합점수 70점 이상인가?', 
    auto: true, check: (s) => (s.total || 0) >= 70 },
  { id: 'c2', engine: 'MF', label: '품질점수 15점 이상인가?',
    auto: true, check: (s) => (s.q || 0) >= 15 },
  { id: 'c3', engine: 'SEPA', label: '22일 고가 대비 -5% 이내인가?',
    auto: true, check: (s) => {
      const sig = String(s.s22 || '');
      if (sig.includes('🚀')) return true;
      const n = parseFloat(sig);
      return !isNaN(n) && n > -5;
    }},
  { id: 'c4', engine: 'SEPA', label: '50일 고가 대비 -10% 이내인가?',
    auto: true, check: (s) => {
      const sig = String(s.s50 || '');
      if (sig.includes('🚀')) return true;
      const n = parseFloat(sig);
      return !isNaN(n) && n > -10;
    }},
  { id: 'c5', engine: 'SEPA', label: '듀얼모멘텀 "매수" 이상 신호인가?',
    auto: true, check: (s) => {
      const s22 = String(s.s22 || '');
      return s22.includes('🚀') || (parseFloat(s22) > -5);
    }},
  { id: 'c6', engine: 'VCP', label: 'VCP 성숙도 5점 이상인가?',
    auto: true, check: (s) => (s.vcp || 0) >= 5 },
  { id: 'c7', engine: 'CF', label: 'FCF가 양수인가?',
    auto: true, check: (s) => s.fcf === true || s.b > 0 || s.cf === true },
  { id: 'c8', engine: '시장', label: '주요 지수가 상승추세인가?',
    auto: true, check: () => {
      // 시장필터 탭의 공격모드 여부와 연동
      // 현재 시장필터에서 '공격 모드' 표시 중이면 true
      return true; // 시장필터 상태와 연동 필요
    }},
  { id: 'c9', engine: '리스크', label: '손절가를 설정했는가? (매수가 -7~8%)',
    auto: false },
  { id: 'c10', engine: '리스크', label: '총 투자금의 5% 이하인가?',
    auto: false },
];
```

### 체크리스트 UI

```jsx
// 체크리스트 탭 렌더링
<div style={{ padding: '20px', background: '#111', borderRadius: '12px', margin: '16px' }}>
  <h3 style={{ color: '#b197fc', fontSize: '18px', marginBottom: '16px' }}>
    ✅ 4엔진 매수 전 체크리스트
  </h3>
  
  {/* 종목 선택 드롭다운 */}
  <div style={{ marginBottom: '16px' }}>
    <label style={{ color: '#888', fontSize: '12px' }}>종목 선택 (자동 체크):</label>
    <select 
      value={selectedStock?.code || ''}
      onChange={(e) => {
        const stock = allStocks.find(s => s.code === e.target.value);
        setSelectedStock(stock);
      }}
      style={{ 
        width: '100%', padding: '10px', marginTop: '4px',
        background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px',
        color: '#eee', fontSize: '14px'
      }}
    >
      <option value="">-- 종목을 선택하세요 --</option>
      {allStocks.filter(s => !s.isIndex).map(s => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code}) - MF: {s.total || 'N/A'}
        </option>
      ))}
    </select>
  </div>

  {/* 선택된 종목 요약 */}
  {selectedStock && (
    <div style={{ 
      padding: '12px', background: '#0a0a2e', borderRadius: '8px', 
      marginBottom: '16px', border: '1px solid #222'
    }}>
      <div style={{ fontSize: '16px', fontWeight: 700, color: '#eee' }}>
        {selectedStock.name} 
        <span style={{ fontSize: '12px', color: '#666', marginLeft: '8px' }}>
          {selectedStock.code}
        </span>
      </div>
      <div style={{ display: 'flex', gap: '16px', marginTop: '8px' }}>
        <span style={{ fontSize: '12px', color: '#4dabf7' }}>
          MF: {selectedStock.total || 'N/A'}
        </span>
        <span style={{ fontSize: '12px', color: '#69db7c' }}>
          22일: {selectedStock.s22}
        </span>
        <span style={{ fontSize: '12px', color: '#ffd43b' }}>
          50일: {selectedStock.s50}
        </span>
      </div>
    </div>
  )}

  {/* 체크리스트 항목들 */}
  <div style={{ display: 'grid', gap: '8px' }}>
    {checklistItems.map((item, idx) => {
      const isAutoChecked = item.auto && selectedStock ? item.check(selectedStock) : false;
      const isManualChecked = !item.auto ? manualChecks[item.id] : false;
      const isChecked = item.auto ? isAutoChecked : isManualChecked;
      
      return (
        <div key={item.id} style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '10px 14px', borderRadius: '8px',
          background: isChecked ? '#0d2818' : '#1a1a1a',
          border: `1px solid ${isChecked ? '#00ff8833' : '#222'}`,
          cursor: item.auto ? 'default' : 'pointer',
          opacity: !selectedStock && item.auto ? 0.5 : 1
        }}
        onClick={() => {
          if (!item.auto) {
            setManualChecks(prev => ({ ...prev, [item.id]: !prev[item.id] }));
          }
        }}
        >
          {/* 체크 아이콘 */}
          <div style={{
            width: 24, height: 24, borderRadius: 6,
            background: isChecked ? '#00ff88' : '#333',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '14px', color: isChecked ? '#000' : '#555',
            flexShrink: 0
          }}>
            {isChecked ? '✓' : idx + 1}
          </div>
          
          {/* 엔진 뱃지 */}
          <span style={{
            padding: '2px 6px', borderRadius: 4, fontSize: '10px',
            background: item.engine === 'MF' ? '#4dabf720' : 
                        item.engine === 'SEPA' ? '#69db7c20' :
                        item.engine === 'VCP' ? '#ffd43b20' :
                        item.engine === 'CF' ? '#ff922b20' :
                        item.engine === '시장' ? '#b197fc20' : '#ff6b6b20',
            color: item.engine === 'MF' ? '#4dabf7' :
                   item.engine === 'SEPA' ? '#69db7c' :
                   item.engine === 'VCP' ? '#ffd43b' :
                   item.engine === 'CF' ? '#ff922b' :
                   item.engine === '시장' ? '#b197fc' : '#ff6b6b',
            fontWeight: 700, flexShrink: 0
          }}>
            {item.engine}
          </span>
          
          {/* 항목 텍스트 */}
          <span style={{ fontSize: '13px', color: isChecked ? '#eee' : '#888' }}>
            {item.label}
          </span>
          
          {/* 자동/수동 표시 */}
          {item.auto && (
            <span style={{ marginLeft: 'auto', fontSize: '9px', color: '#555' }}>
              자동
            </span>
          )}
        </div>
      );
    })}
  </div>

  {/* 결과 요약 */}
  {selectedStock && (() => {
    const autoCount = checklistItems.filter(i => i.auto && i.check(selectedStock)).length;
    const manualCount = Object.values(manualChecks).filter(Boolean).length;
    const total = autoCount + manualCount;
    const color = total >= 8 ? '#00ff88' : total >= 6 ? '#ffd43b' : '#ff6b6b';
    const msg = total >= 8 ? '✅ 매수 조건 충족!' : total >= 6 ? '⚠️ 조건부 매수 가능' : '❌ 매수 비추천';
    
    return (
      <div style={{
        marginTop: '16px', padding: '16px', borderRadius: '10px',
        background: color + '15', border: `2px solid ${color}33`,
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '24px', fontWeight: 800, color }}>
          {total}/10
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color, marginTop: '4px' }}>
          {msg}
        </div>
      </div>
    );
  })()}
</div>
```

---

## 수정 #3: 종목 클릭 시 4엔진 상세분석 모달

### 위치
메인 테이블에서 종목명을 클릭하면 모달/슬라이드패널이 열립니다.

### 모달 상태 관리
```javascript
const [detailStock, setDetailStock] = useState(null);
const [showDetail, setShowDetail] = useState(false);

// 종목 클릭 핸들러 (테이블 행의 종목명에 onClick 추가)
const handleStockClick = (stock) => {
  setDetailStock(stock);
  setShowDetail(true);
};
```

### 모달 컴포넌트

```jsx
// 4엔진 상세분석 모달 컴포넌트
function StockDetailModal({ stock, onClose }) {
  if (!stock) return null;
  
  const verdict = getVerdict(stock);
  const radarData = [
    { label: '품질', value: stock.q || 0, max: 25 },
    { label: '성장', value: stock.g || 0, max: 20 },
    { label: '수익', value: stock.p || 0, max: 20 },
    { label: '안정', value: stock.st || 0, max: 15 },
    { label: '밸류', value: stock.v || 0, max: 10 },
    { label: '경쟁', value: stock.c || 0, max: 10 },
  ];
  
  // SEPA 신호 해석
  const parseSignal = (sig) => {
    const s = String(sig || '');
    if (s.includes('🚀')) return { text: '🚀 돌파!', color: '#00ff88' };
    const n = parseFloat(s);
    if (isNaN(n)) return { text: '-', color: '#555' };
    if (n > -5) return { text: `${n.toFixed(1)}% (근접)`, color: '#4dabf7' };
    if (n > -15) return { text: `${n.toFixed(1)}% (조정)`, color: '#ffd43b' };
    return { text: `${n.toFixed(1)}% (이탈)`, color: '#ff6b6b' };
  };
  
  const sig22 = parseSignal(stock.s22);
  const sig50 = parseSignal(stock.s50);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.85)', zIndex: 9999,
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      padding: '20px'
    }} onClick={onClose}>
      <div style={{
        background: '#0d0d1a', borderRadius: '16px', maxWidth: '700px',
        width: '100%', maxHeight: '90vh', overflow: 'auto',
        border: '1px solid #333', padding: '24px'
      }} onClick={e => e.stopPropagation()}>
        
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ fontSize: '10px', color: '#666', padding: '2px 6px', background: '#1a1a2e', borderRadius: 4, display: 'inline-block', marginBottom: '4px' }}>
              {stock.sector}
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 800, color: '#eee', margin: 0 }}>
              {stock.name}
              <span style={{ fontSize: '14px', color: '#666', marginLeft: '8px' }}>{stock.code}</span>
            </h2>
            <div style={{ fontSize: '20px', fontWeight: 700, color: '#fff', marginTop: '4px', fontFamily: 'monospace' }}>
              {stock.price?.toLocaleString()}
              <span style={{ fontSize: '14px', color: stock.change >= 0 ? '#ff5252' : '#448aff', marginLeft: '8px' }}>
                {stock.change >= 0 ? '▲' : '▼'}{Math.abs(stock.change).toFixed(2)}%
              </span>
            </div>
          </div>
          
          {/* 종합판정 뱃지 */}
          <div style={{
            padding: '12px 16px', borderRadius: '12px',
            background: verdict.color + '20',
            border: `2px solid ${verdict.color}`,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: verdict.color }}>
              {verdict.verdict}
            </div>
            <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>
              {'⭐'.repeat(verdict.stars)}
            </div>
          </div>
        </div>

        {/* 4엔진 분석 그리드 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
          
          {/* 엔진1: MF 멀티팩터 */}
          <div style={{ background: '#080818', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#4dabf7', marginBottom: '10px' }}>
              ◈ 엔진1: MF 멀티팩터
            </div>
            {stock.total ? (
              <>
                {/* SVG 레이더 차트 */}
                <svg width="100%" viewBox="0 0 160 160" style={{ maxWidth: '160px', margin: '0 auto', display: 'block' }}>
                  {/* 그리드 */}
                  {[0.25, 0.5, 0.75, 1].map((f, i) => (
                    <polygon key={i}
                      points={radarData.map((_, j) => {
                        const angle = (Math.PI * 2 * j) / 6 - Math.PI / 2;
                        return `${80 + 60 * f * Math.cos(angle)},${80 + 60 * f * Math.sin(angle)}`;
                      }).join(' ')}
                      fill="none" stroke="#222" strokeWidth="0.5"
                    />
                  ))}
                  {/* 축 */}
                  {radarData.map((_, i) => {
                    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                    return <line key={i} x1="80" y1="80" x2={80 + 60 * Math.cos(angle)} y2={80 + 60 * Math.sin(angle)} stroke="#222" strokeWidth="0.5" />;
                  })}
                  {/* 데이터 */}
                  <polygon
                    points={radarData.map((d, i) => {
                      const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                      const val = (d.value / d.max) * 60;
                      return `${80 + val * Math.cos(angle)},${80 + val * Math.sin(angle)}`;
                    }).join(' ')}
                    fill="rgba(77,171,247,0.25)" stroke="#4dabf7" strokeWidth="2"
                  />
                  {/* 라벨 */}
                  {radarData.map((d, i) => {
                    const angle = (Math.PI * 2 * i) / 6 - Math.PI / 2;
                    return (
                      <text key={i} x={80 + 75 * Math.cos(angle)} y={80 + 75 * Math.sin(angle)}
                        fill="#888" fontSize="8" textAnchor="middle" dominantBaseline="middle">
                        {d.label}
                      </text>
                    );
                  })}
                </svg>
                
                {/* 팩터별 점수 바 */}
                {radarData.map(d => (
                  <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                    <span style={{ width: '28px', fontSize: '10px', color: '#888', textAlign: 'right' }}>{d.label}</span>
                    <div style={{ flex: 1, height: '5px', background: '#1a1a2e', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ width: `${(d.value / d.max) * 100}%`, height: '100%', background: '#4dabf7', borderRadius: '3px' }} />
                    </div>
                    <span style={{ width: '36px', fontSize: '10px', color: '#ccc', textAlign: 'right' }}>{d.value}/{d.max}</span>
                  </div>
                ))}
                
                {/* MF 등급 */}
                <div style={{ marginTop: '8px', textAlign: 'center', padding: '6px', background: '#0a1628', borderRadius: '6px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 800, color: '#4dabf7' }}>{stock.total}점</span>
                  <span style={{ fontSize: '12px', color: '#4dabf799', marginLeft: '4px' }}>({verdict.details.mfGrade}등급)</span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 0', color: '#444', fontSize: '12px' }}>
                MF 분석 데이터 없음
              </div>
            )}
          </div>

          {/* 엔진2: SEPA + 듀얼모멘텀 */}
          <div style={{ background: '#080818', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#69db7c', marginBottom: '10px' }}>
              ◈ 엔진2: SEPA + 듀얼모멘텀
            </div>
            
            <div style={{ display: 'grid', gap: '8px' }}>
              {/* 22일 고가 */}
              <div style={{ padding: '8px 10px', background: '#0d0d1a', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>22일 최고가</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: sig22.color }}>{sig22.text}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#ccc', fontFamily: 'monospace', marginTop: '2px' }}>
                  {stock.h22?.toLocaleString()}
                </div>
              </div>
              
              {/* 50일 고가 */}
              <div style={{ padding: '8px 10px', background: '#0d0d1a', borderRadius: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '11px', color: '#888' }}>50일 최고가</span>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: sig50.color }}>{sig50.text}</span>
                </div>
                <div style={{ fontSize: '12px', color: '#ccc', fontFamily: 'monospace', marginTop: '2px' }}>
                  {stock.h50?.toLocaleString()}
                </div>
              </div>
              
              {/* 듀얼모멘텀 판정 */}
              <div style={{ 
                padding: '10px', background: verdict.details.sepaLevel === '강력매수' ? '#00ff8815' : '#1a1a2e',
                borderRadius: '6px', textAlign: 'center',
                border: `1px solid ${sig22.color}33`
              }}>
                <div style={{ fontSize: '10px', color: '#888' }}>듀얼모멘텀 판정</div>
                <div style={{ fontSize: '16px', fontWeight: 800, color: sig22.color, marginTop: '2px' }}>
                  {verdict.details.sepaLevel}
                </div>
              </div>
            </div>
          </div>

          {/* 엔진3: VCP */}
          <div style={{ background: '#080818', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#ffd43b', marginBottom: '10px' }}>
              ◈ 엔진3: VCP 변동성수축
            </div>
            
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: '36px', fontWeight: 800, color: (stock.vcp || 0) >= 7 ? '#00ff88' : (stock.vcp || 0) >= 5 ? '#ffd43b' : '#ff6b6b' }}>
                {stock.vcp || 'N/A'}
              </div>
              <div style={{ fontSize: '11px', color: '#888' }}>/ 10점</div>
              
              {/* VCP 상태 바 */}
              <div style={{ margin: '12px auto', width: '80%', height: '8px', background: '#1a1a2e', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${((stock.vcp || 0) / 10) * 100}%`, height: '100%',
                  background: (stock.vcp || 0) >= 7 ? '#00ff88' : (stock.vcp || 0) >= 5 ? '#ffd43b' : '#ff6b6b',
                  borderRadius: '4px', transition: 'width 0.5s'
                }} />
              </div>
              
              <div style={{ fontSize: '12px', fontWeight: 600, color: (stock.vcp || 0) >= 7 ? '#00ff88' : (stock.vcp || 0) >= 5 ? '#ffd43b' : '#ff6b6b' }}>
                {(stock.vcp || 0) >= 8 ? '✅ VCP 성숙 - 돌파 임박' :
                 (stock.vcp || 0) >= 5 ? '⏳ VCP 진행중' : '❌ VCP 미성숙'}
              </div>
            </div>
          </div>

          {/* 엔진4: CF 현금흐름 */}
          <div style={{ background: '#080818', borderRadius: '10px', padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#ff922b', marginBottom: '10px' }}>
              ◈ 엔진4: CF 현금흐름
            </div>
            
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              {verdict.details.hasFCF ? (
                <>
                  <div style={{ fontSize: '36px' }}>✅</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#00ff88', marginTop: '8px' }}>
                    FCF 양수
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    실제로 돈을 버는 회사
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: '36px' }}>⚠️</div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: '#ff6b6b', marginTop: '8px' }}>
                    FCF 음수 / 미확인
                  </div>
                  <div style={{ fontSize: '11px', color: '#888', marginTop: '4px' }}>
                    현금흐름 주의 필요
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 종합 판단 코멘트 */}
        <div style={{
          padding: '14px 16px', background: verdict.color + '10',
          borderRadius: '10px', border: `1px solid ${verdict.color}33`
        }}>
          <div style={{ fontSize: '11px', color: '#888', marginBottom: '6px' }}>◈ 4엔진 종합 판단</div>
          <div style={{ fontSize: '14px', color: '#eee', lineHeight: 1.7 }}>
            {verdict.verdict === '🔥최강' && '4엔진 모두 일치! MF 우량 + SEPA 돌파 + VCP 성숙 + FCF 양수. 최대 포지션(5~10%)으로 즉시 매수 고려.'}
            {verdict.verdict === '🟢강력' && '3~4엔진 일치. 우량한 기업이 상승 추세에 있으며 현금흐름도 건전. 표준 포지션(3~5%)으로 매수 적기.'}
            {verdict.verdict === '🔵양호' && '2~3엔진 일치. 펀더멘탈은 양호하나 일부 엔진이 미충족. 소량(1~2%) 진입 후 추가매수 검토.'}
            {verdict.verdict === '🟡모멘텀' && 'MF는 보통이나 SEPA 돌파 신호. 단기 모멘텀 매매로만 접근. 손절 철저히 관리.'}
            {verdict.verdict === '⛔금지' && '엔진 일치도 부족. 현재 시점에서 매수 비추천. 조건 개선 시까지 대기.'}
          </div>
        </div>

        {/* 닫기 버튼 */}
        <button onClick={onClose} style={{
          width: '100%', marginTop: '16px', padding: '12px',
          background: '#1a1a2e', border: '1px solid #333', borderRadius: '8px',
          color: '#888', fontSize: '14px', cursor: 'pointer'
        }}>
          닫기
        </button>
      </div>
    </div>
  );
}
```

### 메인 테이블에서 종목 클릭 연결
```jsx
// 종목명 셀에 onClick 추가
<td onClick={() => handleStockClick(stock)} style={{ cursor: 'pointer' }}>
  <span style={{ fontWeight: 700, color: '#eee' }}>{stock.name}</span>
  <span style={{ fontSize: '10px', color: '#555', marginLeft: '4px' }}>{stock.code}</span>
</td>

// 페이지 하단에 모달 렌더링
{showDetail && (
  <StockDetailModal stock={detailStock} onClose={() => setShowDetail(false)} />
)}
```

---

## 적용 순서

1. `pages/index.js` (또는 메인 컴포넌트 파일) 열기
2. `getVerdict()` 함수 추가 (수정 #1)
3. 테이블 헤더에 '종합판정' 컬럼 추가 (수정 #1)
4. 테이블 각 행에 종합판정 셀 추가 (수정 #1)
5. 상단 요약 바에 최강/강력 카운트 추가 (수정 #1)
6. 체크리스트 탭 전체 교체 (수정 #2)
7. `StockDetailModal` 컴포넌트 추가 (수정 #3)
8. 종목명 클릭 핸들러 연결 (수정 #3)

## 적용 후 확인
```bash
npm run dev
```
→ localhost:3001 접속하여 확인

## 완료 후 배포
```bash
git add -A && git commit -m "feat: 4엔진 통합판정 + 체크리스트 교체 + 상세분석 모달" && git push
```
→ Vercel 자동 배포됨
