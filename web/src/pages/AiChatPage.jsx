import React, { useState, useRef, useEffect } from 'react'

const AGENTS = [
  { id:'MarketAnalyst', label:'Market Analyst',   icon:'📊', desc:'Technical analysis & signal interpretation' },
  { id:'RiskAdvisor',   label:'Risk Advisor',     icon:'⚠️', desc:'Risk flags, stop-loss, false signal warnings' },
  { id:'StrategyCoach', label:'Strategy Coach',   icon:'📚', desc:'Explains setups, confirms crossovers' },
  { id:'NewsCorrelator',label:'News Correlator',  icon:'📰', desc:'Correlates signals with news & macro themes' },
]

const STARTERS = [
  'What does a golden cross on RELIANCE mean right now?',
  'How do I confirm an EMA crossover is real and not a fake-out?',
  'What sectors look bullish this week based on current signals?',
  'Explain Bollinger Band squeeze and what to do when it triggers',
  'What\'s the best risk management for momentum trades in NSE?',
]

export default function AiChatPage({ scanData }) {
  const [agent, setAgent]   = useState('MarketAnalyst')
  const [msgs, setMsgs]     = useState([])
  const [input, setInput]   = useState('')
  const [loading, setLoad]  = useState(false)
  const endRef              = useRef(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior:'smooth' }) }, [msgs])

  const send = async (text) => {
    const q = text || input.trim()
    if (!q || loading) return
    setInput('')
    setMsgs(m => [...m, { role:'user', text: q }])
    setLoad(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          message: `[Agent: ${agent}] ${q}`,
          context: { recentSignals: (scanData||[]).filter(r=>r?.signal!=='NONE').slice(0,10) }
        })
      })
      const data = await res.json()
      setMsgs(m => [...m, { role:'assistant', text: data.response, agent }])
    } catch(e) {
      setMsgs(m => [...m, { role:'assistant', text: 'Error: ' + e.message, agent }])
    } finally { setLoad(false) }
  }

  const clear = () => setMsgs([])

  return (
    <div style={{ padding:32, height:'100%', display:'flex', flexDirection:'column' }}>
      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800 }}>AI Agents</h1>
          <p style={{ color:'var(--muted)', fontSize:13, marginTop:4 }}>Gemini-powered multi-agent market intelligence</p>
        </div>
        <button onClick={clear} style={{ padding:'6px 14px', background:'var(--bg3)', color:'var(--muted)', border:'1px solid var(--border)', borderRadius:'var(--radius)', fontSize:12 }}>Clear Chat</button>
      </div>

      {/* Agent selector */}
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {AGENTS.map(a => (
          <button key={a.id} onClick={() => setAgent(a.id)} style={{
            display:'flex', alignItems:'center', gap:8, padding:'8px 14px',
            borderRadius:'var(--radius)', fontWeight: agent === a.id ? 700 : 400,
            background: agent === a.id ? 'rgba(123,108,255,0.15)' : 'var(--bg3)',
            color: agent === a.id ? 'var(--accent2)' : 'var(--text2)',
            border: `1px solid ${agent === a.id ? 'var(--accent2)' : 'var(--border)'}`,
            fontSize:13
          }}>
            <span>{a.icon}</span> {a.label}
          </button>
        ))}
      </div>
      <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
        {AGENTS.find(a => a.id === agent)?.desc}
      </div>

      {/* Chat area */}
      <div style={{ flex:1, overflowY:'auto', minHeight:0, marginBottom:16 }}>
        {msgs.length === 0 && (
          <div>
            <div style={{ color:'var(--muted)', fontSize:13, marginBottom:16 }}>Try asking:</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
              {STARTERS.map((s,i) => (
                <button key={i} onClick={() => send(s)} style={{
                  padding:'8px 14px', borderRadius:20, fontSize:12,
                  background:'var(--bg3)', color:'var(--text2)', border:'1px solid var(--border)',
                  textAlign:'left', cursor:'pointer', maxWidth:280
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m,i) => (
          <div key={i} className="animate-slide" style={{
            display:'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
            marginBottom:12
          }}>
            <div style={{
              maxWidth:'75%', padding:'12px 16px', borderRadius:12,
              background: m.role === 'user' ? 'var(--accent2)' : 'var(--bg2)',
              color: m.role === 'user' ? '#fff' : 'var(--text)',
              border: m.role !== 'user' ? '1px solid var(--border)' : 'none',
              fontSize:14, lineHeight:1.7, whiteSpace:'pre-wrap'
            }}>
              {m.role === 'assistant' && (
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6, fontFamily:'var(--font-mono)' }}>
                  {AGENTS.find(a => a.id === m.agent)?.icon} {m.agent}
                </div>
              )}
              {m.text}
            </div>
          </div>
        ))}

        {loading && (
          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--muted)', fontSize:13 }}>
            <span className="animate-spin">◌</span> {AGENTS.find(a=>a.id===agent)?.label} is thinking...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div style={{ display:'flex', gap:10 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder={`Ask the ${agent}...`}
          style={{ flex:1, padding:'12px 16px', fontSize:14 }} />
        <button onClick={() => send()} disabled={loading || !input.trim()} style={{
          padding:'12px 24px', borderRadius:'var(--radius)', fontWeight:700, fontSize:14,
          background: input.trim() ? 'var(--accent2)' : 'var(--bg3)',
          color: input.trim() ? '#fff' : 'var(--muted)'
        }}>Send</button>
      </div>
    </div>
  )
}
