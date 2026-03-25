import React, { useState, useEffect } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'

const SIGNAL_COLORS = {
  GOLDEN_CROSS:'#00d4aa', NEAR_GOLDEN:'#7b6cff', DEATH_CROSS:'#ff4d6d', NEAR_DEATH:'#ff8c42',
  BULL_TREND:'#00d4aa', BEAR_TREND:'#ff4d6d', MACD_BULL:'#00d4aa', MACD_BEAR:'#ff4d6d',
  STRONG_BUY:'#00ffa3', STRONG_SELL:'#ff1744', BUY:'#00d4aa', SELL:'#ff4d6d',
  NONE:'#6b7280', BB_SQUEEZE:'#ffc107', ST_BUY:'#00d4aa', ST_SELL:'#ff4d6d',
  OVERSOLD:'#7b6cff', OVERBOUGHT:'#ff8c42'
}

const BULL_SIGNALS = ['GOLDEN_CROSS','NEAR_GOLDEN','MACD_BULL','STRONG_BUY','BUY','ST_BUY','OVERSOLD','RSI_RECOVERY','BB_OVERSOLD']
const BEAR_SIGNALS = ['DEATH_CROSS','NEAR_DEATH','MACD_BEAR','STRONG_SELL','SELL','ST_SELL','OVERBOUGHT','RSI_PULLBACK','BB_OVERBOUGHT']

export default function Dashboard({ scanData, scanning, runScan, lastScan }) {
  const [config, setConfig] = useState(null)

  useEffect(() => {
    fetch('/api/config').then(r => r.json()).then(setConfig).catch(() => {})
  }, [])

  const signals   = (scanData || []).filter(r => r?.signal !== 'NONE')
  const bullCount = signals.filter(r => BULL_SIGNALS.includes(r.signal)).length
  const bearCount = signals.filter(r => BEAR_SIGNALS.includes(r.signal)).length
  const highConf  = signals.filter(r => r.confidence >= 70)
  const nearCross = signals.filter(r => ['NEAR_GOLDEN','NEAR_DEATH'].includes(r.signal))

  const StatCard = ({ label, value, sub, color }) => (
    <div className="card" style={{ flex:1 }}>
      <div style={{ color:'var(--muted)', fontSize:11, fontFamily:'var(--font-mono)', letterSpacing:1, textTransform:'uppercase' }}>{label}</div>
      <div style={{ fontSize:36, fontWeight:800, color: color||'var(--text)', fontFamily:'var(--font-mono)', margin:'8px 0 4px' }}>{value}</div>
      {sub && <div style={{ color:'var(--muted)', fontSize:12 }}>{sub}</div>}
    </div>
  )

  return (
    <div style={{ padding:32 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:32 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800 }}>Dashboard</h1>
          <div style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>
            {lastScan ? `Last scan: ${lastScan.toLocaleTimeString('en-IN')}` : 'No scan run yet'}
          </div>
        </div>
        <button onClick={() => runScan(config?.activeStrategy || 'EMA_CROSSOVER')} disabled={scanning}
          style={{
            padding:'10px 24px', borderRadius:'var(--radius)', fontWeight:700, fontSize:14,
            background: scanning ? 'var(--bg3)' : 'var(--accent)', color: scanning ? 'var(--muted)' : '#000',
          }}>
          {scanning ? '⟳ Scanning...' : '▶ Run Scan'}
        </button>
      </div>

      {/* Stats Row */}
      <div style={{ display:'flex', gap:16, marginBottom:24 }}>
        <StatCard label="Signals Found"  value={signals.length}  sub={`of ${scanData?.length || 0} scanned`} />
        <StatCard label="Bullish"  value={bullCount}  color='var(--bull)' sub="buy signals" />
        <StatCard label="Bearish"  value={bearCount}  color='var(--bear)' sub="sell signals" />
        <StatCard label="Near Crossover" value={nearCross.length} color='var(--warn)' sub="watch closely" />
        <StatCard label="High Confidence" value={highConf.length} color='var(--accent2)' sub="≥70% confidence" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Near Crossovers */}
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:16, display:'flex', justifyContent:'space-between' }}>
            <span>⚡ Near Crossovers</span>
            <span className="badge badge-warn">{nearCross.length}</span>
          </div>
          {nearCross.length === 0
            ? <div style={{ color:'var(--muted)', fontSize:13 }}>No crossovers approaching</div>
            : nearCross.slice(0,8).map((r,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{r.symbol}</span>
                <span className={`badge ${r.signal === 'NEAR_GOLDEN' ? 'badge-bull' : 'badge-bear'}`}>{r.signal}</span>
                <span style={{ color:'var(--muted)', fontSize:12 }}>{r.gapPct?.toFixed(2)}% gap</span>
              </div>
            ))
          }
        </div>

        {/* Top Signals */}
        <div className="card">
          <div style={{ fontWeight:700, marginBottom:16, display:'flex', justifyContent:'space-between' }}>
            <span>🎯 Top Signals</span>
            <span className="badge badge-purple">{highConf.length} high conf</span>
          </div>
          {highConf.length === 0
            ? <div style={{ color:'var(--muted)', fontSize:13 }}>No high-confidence signals yet. Run a scan.</div>
            : highConf.slice(0,8).map((r,i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:600 }}>{r.symbol}</span>
                <span style={{ color: SIGNAL_COLORS[r.signal]||'#fff', fontSize:12, fontFamily:'var(--font-mono)' }}>{r.signal}</span>
                <span className="badge badge-muted">{r.confidence}%</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* Signal distribution */}
      {signals.length > 0 && (
        <div className="card" style={{ marginTop:16 }}>
          <div style={{ fontWeight:700, marginBottom:16 }}>📊 Signal Distribution</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {Object.entries(
              signals.reduce((acc, r) => { acc[r.signal] = (acc[r.signal]||0)+1; return acc }, {})
            ).sort((a,b) => b[1]-a[1]).map(([sig, cnt]) => (
              <div key={sig} style={{ padding:'6px 14px', borderRadius:20, fontSize:12,
                background:'var(--bg3)', border:`1px solid ${SIGNAL_COLORS[sig]||'var(--border)'}`,
                color: SIGNAL_COLORS[sig]||'var(--text2)', fontFamily:'var(--font-mono)' }}>
                {sig} <strong>{cnt}</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
