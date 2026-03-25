import React, { useState, useEffect } from 'react'

export default function PortfolioPage() {
  const [holdings, setHoldings] = useState(null)
  const [positions, setPositions] = useState(null)
  const [funds, setFunds]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [tab, setTab]           = useState('holdings')

  useEffect(() => {
    Promise.all([
      fetch('/api/portfolio/holdings').then(r => r.json()).catch(() => null),
      fetch('/api/portfolio/positions').then(r => r.json()).catch(() => null),
      fetch('/api/portfolio/funds').then(r => r.json()).catch(() => null),
    ]).then(([h, p, f]) => {
      setHoldings(h); setPositions(p); setFunds(f)
    }).finally(() => setLoading(false))
  }, [])

  const fmt = (n) => n ? `₹${(n/100).toLocaleString('en-IN', { minimumFractionDigits:2 })}` : '—'
  const fmtPct = (n) => n ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—'

  if (loading) return <div style={{ padding:32, color:'var(--muted)' }}>Loading portfolio...</div>

  const h    = holdings?.portfolio
  const pf   = funds?.port_funds_and_margin
  const stk  = positions?.portfolio?.stock_positions || []
  const hols = h?.holdings || []

  return (
    <div style={{ padding:32 }}>
      <h1 style={{ fontSize:28, fontWeight:800, marginBottom:24 }}>Portfolio</h1>

      {/* Summary cards */}
      {(h || pf) && (
        <div style={{ display:'flex', gap:16, marginBottom:24 }}>
          {h && <>
            <div className="card" style={{ flex:1 }}>
              <div style={{ color:'var(--muted)', fontSize:11, letterSpacing:1, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>Invested</div>
              <div style={{ fontSize:26, fontWeight:800, fontFamily:'var(--font-mono)', marginTop:8 }}>{fmt(h.holding_stats?.invested_amount)}</div>
            </div>
            <div className="card" style={{ flex:1 }}>
              <div style={{ color:'var(--muted)', fontSize:11, letterSpacing:1, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>Current Value</div>
              <div style={{ fontSize:26, fontWeight:800, fontFamily:'var(--font-mono)', marginTop:8 }}>{fmt(h.holding_stats?.current_value)}</div>
            </div>
            <div className="card" style={{ flex:1 }}>
              <div style={{ color:'var(--muted)', fontSize:11, letterSpacing:1, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>Total P&L</div>
              <div style={{ fontSize:26, fontWeight:800, fontFamily:'var(--font-mono)', marginTop:8,
                color: (h.holding_stats?.total_pnl||0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                {fmt(h.holding_stats?.total_pnl)}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{fmtPct(h.holding_stats?.total_pnl_chg)}</div>
            </div>
          </>}
          {pf && (
            <div className="card" style={{ flex:1 }}>
              <div style={{ color:'var(--muted)', fontSize:11, letterSpacing:1, fontFamily:'var(--font-mono)', textTransform:'uppercase' }}>Available</div>
              <div style={{ fontSize:26, fontWeight:800, fontFamily:'var(--font-mono)', marginTop:8 }}>{fmt(pf.net_withdrawal_amount)}</div>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display:'flex', gap:2, marginBottom:16, borderBottom:'1px solid var(--border)', paddingBottom:0 }}>
        {['holdings','positions'].map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding:'8px 20px', background:'none',
            color: tab === t ? 'var(--accent)' : 'var(--muted)',
            borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
            fontWeight: tab === t ? 700 : 400, fontSize:13, textTransform:'capitalize'
          }}>{t}</button>
        ))}
      </div>

      {/* Holdings Table */}
      {tab === 'holdings' && (
        <div className="card" style={{ padding:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                {['Symbol','Qty','Avg Price','LTP','Invested','Current','Net P&L'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11,
                    fontFamily:'var(--font-mono)', color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hols.length === 0
                ? <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>No holdings found</td></tr>
                : hols.map((h,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontWeight:700 }}>{h.displayName}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{h.quantity}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(h.avg_price*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(h.last_traded_price*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(h.invested_value*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(h.current_value*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)',
                      color: (h.net_pnl||0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {fmt(h.net_pnl*100)} <span style={{ fontSize:11 }}>({fmtPct(h.net_pnl_chg)})</span>
                    </td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}

      {/* Positions Table */}
      {tab === 'positions' && (
        <div className="card" style={{ padding:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg3)', borderBottom:'1px solid var(--border)' }}>
                {['Symbol','Side','Qty','Avg Price','LTP','P&L','Product'].map(h => (
                  <th key={h} style={{ padding:'12px 16px', textAlign:'left', fontSize:11,
                    fontFamily:'var(--font-mono)', color:'var(--muted)', letterSpacing:1, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stk.length === 0
                ? <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>No open positions</td></tr>
                : stk.map((p,i) => (
                  <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', fontWeight:700 }}>{p.display_name}</td>
                    <td style={{ padding:'10px 16px' }}><span className={`badge ${p.order_side === 'BUY' ? 'badge-bull' : 'badge-bear'}`}>{p.order_side}</span></td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{p.qty}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(p.avg_price*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)' }}>{fmt(p.ltp*100)}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'var(--font-mono)', color: (p.pnl||0) >= 0 ? 'var(--bull)' : 'var(--bear)' }}>
                      {fmt(p.pnl*100)}
                    </td>
                    <td style={{ padding:'10px 16px', fontSize:11, color:'var(--muted)' }}>{p.product?.replace('ORDER_DELIVERY_TYPE_','')}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
