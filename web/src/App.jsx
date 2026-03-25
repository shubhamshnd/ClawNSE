import React, { useState, useEffect, useCallback } from 'react'
import { io } from 'socket.io-client'
import Dashboard    from './pages/Dashboard.jsx'
import ScanPage     from './pages/ScanPage.jsx'
import StrategyPage from './pages/StrategyPage.jsx'
import PluginsPage  from './pages/PluginsPage.jsx'
import PortfolioPage from './pages/PortfolioPage.jsx'
import AiChatPage   from './pages/AiChatPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'

const SOCKET = io(window.location.origin, { path: '/socket.io' })

const NAV = [
  { id:'dashboard',  icon:'⬡', label:'Dashboard'  },
  { id:'scan',       icon:'◎', label:'Scanner'     },
  { id:'strategies', icon:'◈', label:'Strategies'  },
  { id:'plugins',    icon:'⬡', label:'Plugins'     },
  { id:'portfolio',  icon:'◉', label:'Portfolio'   },
  { id:'ai',         icon:'◆', label:'AI Agents'   },
  { id:'settings',   icon:'⚙', label:'Settings'    },
]

export default function App() {
  const [page, setPage]       = useState('dashboard')
  const [scanData, setScanData]   = useState([])
  const [scanning, setScanning] = useState(false)
  const [connected, setConnected] = useState(false)
  const [lastScan, setLastScan]   = useState(null)

  useEffect(() => {
    SOCKET.on('connect',        ()  => setConnected(true))
    SOCKET.on('disconnect',     ()  => setConnected(false))
    SOCKET.on('scan:start',     ()  => setScanning(true))
    SOCKET.on('scan:complete',  (d) => { setScanData(d.results || []); setLastScan(new Date()); setScanning(false) })
    return () => SOCKET.removeAllListeners()
  }, [])

  const runScan = useCallback(async (strategy, params) => {
    setScanning(true)
    try {
      const res = await fetch('/api/scan/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ strategy, params })
      })
      const data = await res.json()
      setScanData(data.results || [])
      setLastScan(new Date())
      return data
    } finally { setScanning(false) }
  }, [])

  const pages = { dashboard: Dashboard, scan: ScanPage, strategies: StrategyPage,
    plugins: PluginsPage, portfolio: PortfolioPage, ai: AiChatPage, settings: SettingsPage }
  const PageComponent = pages[page] || Dashboard

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden' }}>
      {/* Sidebar */}
      <aside style={{
        width: 200, flexShrink: 0, background: 'var(--bg2)',
        borderRight: '1px solid var(--border)', display:'flex', flexDirection:'column',
        padding: '24px 0'
      }}>
        <div style={{ padding:'0 20px 24px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontFamily:'var(--font-mono)', fontWeight:700, fontSize:18, color:'var(--accent)' }}>
            TRADE<span style={{color:'var(--accent2)'}}>PI</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
            <span style={{ display:'inline-block', width:6, height:6, borderRadius:'50%',
              background: connected ? 'var(--bull)' : 'var(--bear)',
              marginRight:5, verticalAlign:'middle' }}/>
            {connected ? 'Connected' : 'Offline'}
          </div>
        </div>

        <nav style={{ flex:1, padding:'12px 0' }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setPage(n.id)} style={{
              display:'flex', alignItems:'center', gap:10, width:'100%',
              padding:'10px 20px', background: page === n.id ? 'rgba(0,212,170,0.08)' : 'transparent',
              color: page === n.id ? 'var(--accent)' : 'var(--text2)',
              borderLeft: page === n.id ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize:13, fontFamily:'var(--font-ui)', fontWeight: page === n.id ? 600 : 400,
              transition:'all 0.15s'
            }}>
              <span style={{ fontSize:16 }}>{n.icon}</span> {n.label}
            </button>
          ))}
        </nav>

        {scanning && (
          <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--warn)', fontSize:12 }}>
              <span className="animate-spin" style={{ fontSize:14 }}>◌</span> Scanning...
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <main style={{ flex:1, overflow:'auto', background:'var(--bg)' }}>
        <PageComponent
          scanData={scanData} scanning={scanning} runScan={runScan}
          lastScan={lastScan} socket={SOCKET}
        />
      </main>
    </div>
  )
}
