import React, { useState, useEffect } from 'react'

const BUILTIN = ['EMA_CROSSOVER','MACD_CROSSOVER','RSI_OVERSOLD','BOLLINGER_BANDS','SUPERTREND','MULTI_CONFLUENCE']
const OPERATORS = ['>','<','>=','<=','==']
const INDICATORS = ['rsi','emaShort','emaLong','price','atr']
const INDICATOR_FIELDS = { macd: ['MACD','signal','histogram'], bb: ['upper','middle','lower','bandwidth'] }

export default function StrategyPage() {
  const [customs, setCustoms]   = useState({})
  const [building, setBuilding] = useState(false)
  const [mode, setMode]         = useState('list') // list | builder | nlp
  const [nlpDesc, setNlpDesc]   = useState('')
  const [nlpLoading, setNlpLoading] = useState(false)
  const [draft, setDraft]       = useState({ name:'', signal:'CUSTOM_SIGNAL', confidence:70, logic:'AND', conditions:[] })
  const [error, setError]       = useState('')

  useEffect(() => {
    fetch('/api/strategies/custom').then(r => r.json()).then(setCustoms).catch(() => {})
  }, [])

  const addCondition = () => {
    setDraft(d => ({ ...d, conditions: [...d.conditions, { indicator:'rsi', field:'', operator:'>',value:50 }] }))
  }

  const removeCondition = (i) => {
    setDraft(d => ({ ...d, conditions: d.conditions.filter((_,j) => j !== i) }))
  }

  const updateCondition = (i, key, val) => {
    setDraft(d => {
      const conds = [...d.conditions]
      conds[i] = { ...conds[i], [key]: val }
      return { ...d, conditions: conds }
    })
  }

  const saveStrategy = async () => {
    if (!draft.name.trim()) { setError('Strategy name required'); return }
    if (!draft.conditions.length) { setError('Add at least one condition'); return }
    setError('')
    try {
      await fetch('/api/strategies/custom', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ name: draft.name, definition: draft })
      })
      setCustoms(c => ({ ...c, [draft.name]: draft }))
      setMode('list')
      setDraft({ name:'', signal:'CUSTOM_SIGNAL', confidence:70, logic:'AND', conditions:[] })
    } catch(e) { setError(e.message) }
  }

  const buildFromNlp = async () => {
    if (!nlpDesc.trim()) return
    setNlpLoading(true)
    try {
      const res = await fetch('/api/strategies/build', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ description: nlpDesc })
      })
      const data = await res.json()
      setDraft(data.definition)
      setMode('builder')
    } catch(e) { setError('AI build failed: ' + e.message) }
    finally { setNlpLoading(false) }
  }

  const deleteStrategy = async (name) => {
    await fetch(`/api/strategies/custom/${name}`, { method:'DELETE' })
    setCustoms(c => { const x = {...c}; delete x[name]; return x })
  }

  return (
    <div style={{ padding:32 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800 }}>Strategies</h1>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>Built-in & custom trading strategies</p>
        </div>
        {mode === 'list' && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setMode('nlp')} style={{
              padding:'8px 16px', borderRadius:'var(--radius)', fontWeight:600, fontSize:13,
              background:'var(--bg3)', color:'var(--accent2)', border:'1px solid var(--border)' }}>
              ✦ Build with AI
            </button>
            <button onClick={() => setMode('builder')} style={{
              padding:'8px 16px', borderRadius:'var(--radius)', fontWeight:600, fontSize:13,
              background:'var(--accent)', color:'#000' }}>
              + New Strategy
            </button>
          </div>
        )}
        {mode !== 'list' && (
          <button onClick={() => setMode('list')} style={{
            padding:'8px 16px', borderRadius:'var(--radius)', background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)' }}>
            ← Back
          </button>
        )}
      </div>

      {/* NLP Builder */}
      {mode === 'nlp' && (
        <div className="card animate-slide" style={{ maxWidth:640 }}>
          <div style={{ fontWeight:700, marginBottom:16, color:'var(--accent2)', fontSize:16 }}>✦ AI Strategy Builder</div>
          <p style={{ color:'var(--muted)', fontSize:13, marginBottom:16 }}>
            Describe your strategy in plain English. The AI will convert it to a rule set.
          </p>
          <textarea value={nlpDesc} onChange={e => setNlpDesc(e.target.value)}
            placeholder="e.g. Buy when RSI is below 35 AND the 9 EMA is above the 21 EMA, indicating oversold in an uptrend..."
            style={{ height:100, resize:'vertical', marginBottom:12 }} />
          <button onClick={buildFromNlp} disabled={nlpLoading} style={{
            padding:'10px 20px', background:'var(--accent2)', color:'#fff', borderRadius:'var(--radius)', fontWeight:700 }}>
            {nlpLoading ? '⟳ Building...' : '✦ Generate Strategy'}
          </button>
          {error && <div style={{ color:'var(--bear)', marginTop:8, fontSize:13 }}>{error}</div>}
        </div>
      )}

      {/* Manual Builder */}
      {mode === 'builder' && (
        <div className="card animate-slide" style={{ maxWidth:700 }}>
          <div style={{ fontWeight:700, marginBottom:20, fontSize:16 }}>Strategy Builder</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
            <div>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Strategy Name</label>
              <input value={draft.name} onChange={e => setDraft(d => ({...d, name: e.target.value.toUpperCase().replace(/\s/g,'_')}))} placeholder="MY_STRATEGY" />
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Signal Name</label>
              <input value={draft.signal} onChange={e => setDraft(d => ({...d, signal: e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Confidence %</label>
              <input type="number" min={0} max={100} value={draft.confidence} onChange={e => setDraft(d => ({...d, confidence: +e.target.value}))} />
            </div>
            <div>
              <label style={{ fontSize:12, color:'var(--muted)', display:'block', marginBottom:4 }}>Logic</label>
              <select value={draft.logic} onChange={e => setDraft(d => ({...d, logic: e.target.value}))}>
                <option value="AND">AND — All conditions must match</option>
                <option value="OR">OR — Any condition must match</option>
              </select>
            </div>
          </div>

          <div style={{ fontWeight:600, marginBottom:12, fontSize:13 }}>Conditions</div>
          {draft.conditions.map((c, i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
              <select value={c.indicator} onChange={e => updateCondition(i,'indicator',e.target.value)} style={{ width:'auto', flex:1 }}>
                {[...INDICATORS, 'macd', 'bb'].map(s => <option key={s}>{s}</option>)}
              </select>
              {INDICATOR_FIELDS[c.indicator] && (
                <select value={c.field} onChange={e => updateCondition(i,'field',e.target.value)} style={{ width:'auto', flex:1 }}>
                  <option value="">-- field --</option>
                  {INDICATOR_FIELDS[c.indicator].map(f => <option key={f}>{f}</option>)}
                </select>
              )}
              <select value={c.operator} onChange={e => updateCondition(i,'operator',e.target.value)} style={{ width:60 }}>
                {OPERATORS.map(o => <option key={o}>{o}</option>)}
              </select>
              <input type="number" value={c.value} onChange={e => updateCondition(i,'value',+e.target.value)} style={{ width:80 }} />
              <button onClick={() => removeCondition(i)} style={{ padding:'6px 10px', background:'var(--bg3)', color:'var(--bear)', border:'1px solid var(--border)', borderRadius:'var(--radius)' }}>✕</button>
            </div>
          ))}

          <button onClick={addCondition} style={{ padding:'6px 14px', marginTop:4, background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:13 }}>
            + Add Condition
          </button>

          {error && <div style={{ color:'var(--bear)', marginTop:8, fontSize:13 }}>{error}</div>}

          <div style={{ marginTop:20, display:'flex', gap:10 }}>
            <button onClick={saveStrategy} style={{ padding:'10px 24px', background:'var(--accent)', color:'#000', borderRadius:'var(--radius)', fontWeight:700 }}>
              Save Strategy
            </button>
          </div>
        </div>
      )}

      {/* Strategy List */}
      {mode === 'list' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:16 }}>
          {BUILTIN.map(s => (
            <div key={s} className="card" style={{ borderColor:'var(--border)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:13 }}>{s}</span>
                <span className="badge badge-bull">Built-in</span>
              </div>
              <div style={{ color:'var(--muted)', fontSize:12, marginTop:8 }}>
                {s === 'EMA_CROSSOVER'    && 'Detects golden/death crosses and near-crossover setups'}
                {s === 'MACD_CROSSOVER'   && 'MACD line vs signal line crossovers + histogram momentum'}
                {s === 'RSI_OVERSOLD'     && 'RSI-based oversold/overbought and recovery signals'}
                {s === 'BOLLINGER_BANDS'  && 'Band touch signals, squeeze detection for breakouts'}
                {s === 'SUPERTREND'       && 'Trend-following with ATR-based Supertrend flips'}
                {s === 'MULTI_CONFLUENCE' && 'All 4 indicators combined — requires 2+ alignment'}
              </div>
            </div>
          ))}

          {Object.entries(customs).map(([name, def]) => (
            <div key={name} className="card" style={{ borderColor:'var(--accent2)', borderStyle:'dashed' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <span style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:13, color:'var(--accent2)' }}>{name}</span>
                <div style={{ display:'flex', gap:6 }}>
                  <span className="badge badge-purple">Custom</span>
                  <button onClick={() => deleteStrategy(name)} style={{ background:'none', color:'var(--bear)', fontSize:14, padding:'0 4px' }}>✕</button>
                </div>
              </div>
              <div style={{ color:'var(--muted)', fontSize:12, marginTop:8 }}>
                {def.conditions?.length} condition(s) · Logic: {def.logic} · {def.confidence}% conf
              </div>
              <div style={{ marginTop:8 }}>
                {def.conditions?.map((c,i) => (
                  <code key={i} style={{ fontSize:11, display:'block', color:'var(--text2)', fontFamily:'var(--font-mono)' }}>
                    {c.indicator}{c.field ? `.${c.field}` : ''} {c.operator} {c.value}
                  </code>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
