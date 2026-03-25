import React, { useState } from 'react'

const STRATEGIES = ['EMA_CROSSOVER','MACD_CROSSOVER','RSI_OVERSOLD','BOLLINGER_BANDS','SUPERTREND','MULTI_CONFLUENCE']
const BULL_SIGS  = ['GOLDEN_CROSS','NEAR_GOLDEN','MACD_BULL','STRONG_BUY','BUY','ST_BUY','OVERSOLD','RSI_RECOVERY','BB_OVERSOLD','BB_SQUEEZE']
const SIGNAL_COLOR = s => BULL_SIGS.includes(s) ? 'var(--bull)' : s === 'NONE' ? 'var(--muted)' : 'var(--bear)'

export default function ScanPage({ scanData, scanning, runScan }) {
  const [strategy, setStrategy]   = useState('EMA_CROSSOVER')
  const [filter, setFilter]       = useState('ALL')
  const [search, setSearch]       = useState('')
  const [sortKey, setSortKey]     = useState('confidence')
  const [detail, setDetail]       = useState(null)
  const [aiExplain, setAiExplain] = useState('')
  const [explaining, setExplaining] = useState(false)

  const filtered = (scanData || [])
    .filter(r => r && r.signal !== 'NONE')
    .filter(r => filter === 'ALL' || (filter === 'BULL' ? BULL_SIGS.includes(r.signal) : !BULL_SIGS.includes(r.signal)))
    .filter(r => !search || r.symbol?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => sortKey === 'confidence' ? b.confidence - a.confidence : a.symbol?.localeCompare(b.symbol))

  const explainSignal = async (row) => {
    setDetail(row); setExplaining(true); setAiExplain('')
    try {
      const res = await fetch('/api/ai/explain', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ signal: row })
      })
      const data = await res.json()
      setAiExplain(data.response)
    } catch(e) { setAiExplain('Error fetching explanation') }
    finally { setExplaining(false) }
  }

  return (
    <div style={{ padding:32 }}>
      <h1 style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>Scanner</h1>
      <p style={{ color:'var(--muted)', fontSize:13, marginBottom:24 }}>
        Scan all NSE equities for technical signals across strategies
      </p>

      {/* Controls */}
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        <select value={strategy} onChange={e => setStrategy(e.target.value)} style={{ width:'auto' }}>
          {STRATEGIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => runScan(strategy)} disabled={scanning} style={{
          padding:'8px 20px', borderRadius:'var(--radius)', fontWeight:700,
          background: scanning ? 'var(--bg3)' : 'var(--accent)', color: scanning ? 'var(--muted)' : '#000'
        }}>
          {scanning ? '⟳ Scanning...' : '▶ Run Scan'}
        </button>
        <input placeholder="Search symbol..." value={search} onChange={e => setSearch(e.target.value)}
          style={{ width:160 }} />
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width:'auto' }}>
          <option value="ALL">All Signals</option>
          <option value="BULL">Bullish Only</option>
          <option value="BEAR">Bearish Only</option>
        </select>
        <select value={sortKey} onChange={e => setSortKey(e.target.value)} style={{ width:'auto' }}>
          <option value="confidence">Sort: Confidence</option>
          <option value="symbol">Sort: Symbol</option>
        </select>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: detail ? '1fr 380px' : '1fr', gap:16 }}>
        {/* Table */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                {['Symbol','Signal','Confidence','Price','Notes','Action'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11,
                    fontFamily:'var(--font-mono)', color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0
                ? <tr><td colSpan={6} style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>
                    {scanning ? 'Scanning in progress...' : 'No signals yet. Run a scan.'}
                  </td></tr>
                : filtered.slice(0,100).map((r,i) => (
                  <tr key={i} style={{
                    borderBottom:'1px solid var(--border)', cursor:'pointer',
                    background: detail?.symbol === r.symbol ? 'rgba(0,212,170,0.05)' : 'transparent'
                  }} onClick={() => explainSignal(r)}>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontWeight:700, color:'var(--text)' }}>{r.symbol}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ color: SIGNAL_COLOR(r.signal), fontFamily:'var(--font-mono)', fontSize:12, fontWeight:600 }}>{r.signal}</span>
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <div style={{ flex:1, height:4, background:'var(--bg3)', borderRadius:2, maxWidth:80 }}>
                          <div style={{ height:'100%', width:`${r.confidence}%`, borderRadius:2,
                            background: r.confidence >= 70 ? 'var(--bull)' : 'var(--warn)' }} />
                        </div>
                        <span style={{ fontSize:12, fontFamily:'var(--font-mono)', color:'var(--text2)' }}>{r.confidence}%</span>
                      </div>
                    </td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontSize:12 }}>₹{r.price?.toLocaleString('en-IN', {minimumFractionDigits:2})}</td>
                    <td style={{ padding:'10px 16px', color:'var(--muted)', fontSize:12, maxWidth:200 }}>{r.notes?.slice(0,50)}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <button style={{ padding:'4px 10px', borderRadius:'var(--radius)', fontSize:11,
                        background:'var(--bg3)', color:'var(--accent2)', border:'1px solid var(--border)' }}>
                        AI ✦
                      </button>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>

        {/* Detail Panel */}
        {detail && (
          <div className="card animate-slide">
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:16 }}>{detail.symbol}</span>
              <button onClick={() => setDetail(null)} style={{ background:'var(--bg3)', color:'var(--text2)',
                padding:'4px 10px', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>✕</button>
            </div>

            <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap' }}>
              <span style={{ color: SIGNAL_COLOR(detail.signal), fontFamily:'var(--font-mono)', fontWeight:700, fontSize:14 }}>{detail.signal}</span>
              <span className={`badge ${detail.confidence >= 70 ? 'badge-bull' : 'badge-warn'}`}>{detail.confidence}%</span>
            </div>

            <div className="card" style={{ background:'var(--bg3)', marginBottom:16, padding:12 }}>
              {Object.entries(detail.indicators || {}).map(([k,v]) => (
                <div key={k} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <span style={{ fontFamily:'var(--font-mono)', color:'var(--muted)' }}>{k}</span>
                  <span style={{ fontFamily:'var(--font-mono)', color:'var(--text)' }}>{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                </div>
              ))}
              {detail.gapPct !== undefined && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                  <span style={{ fontFamily:'var(--font-mono)', color:'var(--muted)' }}>Gap %</span>
                  <span style={{ fontFamily:'var(--font-mono)', color:'var(--warn)' }}>{detail.gapPct?.toFixed(3)}%</span>
                </div>
              )}
            </div>

            <div style={{ fontWeight:700, marginBottom:8, fontSize:13, color:'var(--accent2)' }}>✦ AI Analysis</div>
            {explaining
              ? <div style={{ color:'var(--muted)', fontSize:13 }}>
                  <span className="animate-spin" style={{ display:'inline-block', marginRight:8 }}>◌</span>Analyzing...
                </div>
              : <div style={{ fontSize:13, color:'var(--text2)', lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                  {aiExplain || 'Click a signal row to get AI explanation'}
                </div>
            }
          </div>
        )}
      </div>
    </div>
  )
}
