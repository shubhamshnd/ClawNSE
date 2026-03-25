import React, { useState, useEffect } from 'react'

const TYPE_BADGE = { webhook:'badge-warn', data:'badge-bull', analysis:'badge-purple', utility:'badge-muted' }

export default function PluginsPage() {
  const [data, setData]         = useState({ installed:{}, available:{} })
  const [installing, setInst]   = useState(null)
  const [customRepo, setCustom] = useState('')
  const [customId, setCustomId] = useState('')
  const [msg, setMsg]           = useState('')

  useEffect(() => {
    fetch('/api/plugins').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  const install = async (id, repoUrl) => {
    setInst(id); setMsg('')
    try {
      const res = await fetch('/api/plugins/install', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ pluginId: id, repoUrl })
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setMsg(`✅ ${id} installed successfully`)
      const r = await fetch('/api/plugins').then(x => x.json())
      setData(r)
    } catch(e) { setMsg(`❌ ${e.message}`) }
    finally { setInst(null) }
  }

  const uninstall = async (id) => {
    await fetch(`/api/plugins/${id}`, { method:'DELETE' })
    const r = await fetch('/api/plugins').then(x => x.json())
    setData(r)
    setMsg(`🗑 ${id} removed`)
  }

  const toggle = async (id, enabled) => {
    await fetch(`/api/plugins/${id}/toggle`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ enabled })
    })
    const r = await fetch('/api/plugins').then(x => x.json())
    setData(r)
  }

  const installed = data.installed || {}
  const available = data.available || {}

  return (
    <div style={{ padding:32 }}>
      <h1 style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>MCP Plugins</h1>
      <p style={{ color:'var(--muted)', fontSize:13, marginBottom:24 }}>
        Extend TradePi with marketplace plugins installed directly from GitHub
      </p>

      {msg && <div style={{ padding:'10px 16px', borderRadius:'var(--radius)', background:'var(--bg3)', border:'1px solid var(--border)', marginBottom:16, fontSize:13 }}>{msg}</div>}

      {/* Custom install */}
      <div className="card" style={{ marginBottom:24 }}>
        <div style={{ fontWeight:700, marginBottom:12 }}>Install from GitHub</div>
        <div style={{ display:'flex', gap:10 }}>
          <input value={customId} onChange={e => setCustomId(e.target.value)} placeholder="plugin-id" style={{ maxWidth:160 }} />
          <input value={customRepo} onChange={e => setCustom(e.target.value)} placeholder="https://github.com/user/repo" />
          <button onClick={() => install(customId, customRepo)} disabled={!customId||!customRepo}
            style={{ padding:'8px 20px', whiteSpace:'nowrap', borderRadius:'var(--radius)', background:'var(--accent)', color:'#000', fontWeight:700 }}>
            Install
          </button>
        </div>
      </div>

      {/* Installed */}
      {Object.keys(installed).length > 0 && (
        <div style={{ marginBottom:28 }}>
          <div style={{ fontWeight:700, marginBottom:12, fontSize:16 }}>Installed</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:12 }}>
            {Object.entries(installed).map(([id, info]) => (
              <div key={id} className="card" style={{ borderColor:'var(--accent)' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontWeight:700, fontFamily:'var(--font-mono)', fontSize:13 }}>{id}</span>
                  <span className={`badge ${TYPE_BADGE[info.type]||'badge-muted'}`}>{info.type}</span>
                </div>
                <div style={{ color:'var(--muted)', fontSize:12, marginBottom:12 }}>{info.description || info.name}</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => toggle(id, info.status !== 'enabled')} style={{
                    flex:1, padding:'6px', borderRadius:'var(--radius)', fontSize:12, fontWeight:600,
                    background: info.status === 'enabled' ? 'rgba(0,212,170,0.1)' : 'var(--bg3)',
                    color: info.status === 'enabled' ? 'var(--bull)' : 'var(--muted)',
                    border: `1px solid ${info.status === 'enabled' ? 'var(--bull)' : 'var(--border)'}` }}>
                    {info.status === 'enabled' ? '● Enabled' : '○ Disabled'}
                  </button>
                  <button onClick={() => uninstall(id)} style={{ padding:'6px 12px', borderRadius:'var(--radius)', fontSize:12,
                    background:'var(--bg3)', color:'var(--bear)', border:'1px solid var(--border)' }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Marketplace */}
      <div>
        <div style={{ fontWeight:700, marginBottom:12, fontSize:16 }}>Marketplace</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(300px,1fr))', gap:12 }}>
          {Object.entries(available).map(([id, info]) => {
            const isInstalled = !!installed[id]
            return (
              <div key={id} className="card" style={{ opacity: isInstalled ? 0.6 : 1 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontWeight:700, fontSize:13 }}>{info.name}</span>
                  <span className={`badge ${TYPE_BADGE[info.type]||'badge-muted'}`}>{info.type}</span>
                </div>
                <div style={{ color:'var(--muted)', fontSize:12, marginBottom:12 }}>{info.description}</div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, fontFamily:'var(--font-mono)', color:'var(--muted)' }}>v{info.version}</span>
                  <button onClick={() => !isInstalled && install(id, info.repo)} disabled={isInstalled || installing === id}
                    style={{ padding:'5px 14px', borderRadius:'var(--radius)', fontSize:12, fontWeight:600,
                      background: isInstalled ? 'var(--bg3)' : 'var(--accent2)',
                      color: isInstalled ? 'var(--muted)' : '#fff' }}>
                    {isInstalled ? 'Installed' : installing === id ? '⟳...' : 'Install'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
