import React, { useState } from 'react'

const CRON_PRESETS = [
  { label:'Market Open (9:00 AM)',   value:'0 9 * * 1-5'    },
  { label:'Mid Session (11:30 AM)',  value:'30 11 * * 1-5'  },
  { label:'Afternoon (2:00 PM)',     value:'0 14 * * 1-5'   },
  { label:'End of Day (3:20 PM)',    value:'20 15 * * 1-5'  },
]

export default function SettingsPage() {
  const [saved, setSaved] = useState(false)
  const [otp, setOtp]     = useState('')
  const [otpMsg, setOtpMsg] = useState('')

  const [settings, setSettings] = useState({
    telegram_bot_token: '',
    telegram_chat_id:   '',
    nubra_phone:        '',
    nubra_mpin:         '',
    nubra_device_id:    'PIBOT01',
    gemini_api_key:     '',
    default_strategy:   'EMA_CROSSOVER',
    ema_short:          9,
    ema_long:           21,
    rsi_period:         14,
    macd_fast:          12,
    macd_slow:          26,
    macd_signal:        9,
    bb_period:          20,
    crossover_proximity:1.5,
    scan_crons:         CRON_PRESETS.map(p => p.value)
  })

  const set = (key, val) => setSettings(s => ({ ...s, [key]: val }))

  const saveEnv = () => {
    const envContent = `# TradePi Configuration
NUBRA_BASE_URL=https://api.nubra.io
NUBRA_PHONE=${settings.nubra_phone}
NUBRA_MPIN=${settings.nubra_mpin}
NUBRA_DEVICE_ID=${settings.nubra_device_id}
GEMINI_API_KEY=${settings.gemini_api_key}
GEMINI_MODEL=gemini-1.5-flash
TELEGRAM_BOT_TOKEN=${settings.telegram_bot_token}
TELEGRAM_CHAT_ID=${settings.telegram_chat_id}
PORT=3000
NODE_ENV=production
DEFAULT_STRATEGY=${settings.default_strategy}
EMA_SHORT=${settings.ema_short}
EMA_LONG=${settings.ema_long}
RSI_PERIOD=${settings.rsi_period}
MACD_FAST=${settings.macd_fast}
MACD_SLOW=${settings.macd_slow}
MACD_SIGNAL=${settings.macd_signal}
BB_PERIOD=${settings.bb_period}
CROSSOVER_PROXIMITY_PERCENT=${settings.crossover_proximity}
SCAN_CRON_MARKET_OPEN=${settings.scan_crons[0]}
SCAN_CRON_MID_SESSION=${settings.scan_crons[1]}
SCAN_CRON_AFTERNOON=${settings.scan_crons[2]}
SCAN_CRON_EOD=${settings.scan_crons[3]}
`
    const blob = new Blob([envContent], { type:'text/plain' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = '.env'; a.click()
    setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  const submitOtp = async () => {
    try {
      await fetch('/api/auth/otp', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ otp }) })
      setOtpMsg('✅ OTP submitted. Check bot logs for auth result.'); setOtp('')
    } catch(e) { setOtpMsg('❌ Failed: ' + e.message) }
  }

  const Section = ({ title, children }) => (
    <div className="card" style={{ marginBottom:20 }}>
      <div style={{ fontWeight:700, marginBottom:16, fontSize:15, borderBottom:'1px solid var(--border)', paddingBottom:10 }}>{title}</div>
      {children}
    </div>
  )

  const Field = ({ label, type='text', value, onChange, placeholder }) => (
    <div style={{ marginBottom:12 }}>
      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4, fontFamily:'var(--font-mono)', letterSpacing:0.5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <div style={{ padding:32, maxWidth:760 }}>
      <h1 style={{ fontSize:28, fontWeight:800, marginBottom:8 }}>Settings</h1>
      <p style={{ color:'var(--muted)', fontSize:13, marginBottom:24 }}>Configure credentials, strategy defaults, and scan schedule</p>

      <Section title="🔐 Authentication — Nubra OTP">
        <p style={{ fontSize:13, color:'var(--muted)', marginBottom:12 }}>
          If Nubra requires OTP login, submit it here. You'll also get a Telegram prompt via /otp command.
        </p>
        <div style={{ display:'flex', gap:10 }}>
          <input value={otp} onChange={e => setOtp(e.target.value)} placeholder="Enter OTP code" style={{ maxWidth:200 }} />
          <button onClick={submitOtp} disabled={!otp} style={{ padding:'8px 20px', borderRadius:'var(--radius)', background:'var(--accent)', color:'#000', fontWeight:700 }}>Submit OTP</button>
        </div>
        {otpMsg && <div style={{ marginTop:8, fontSize:13 }}>{otpMsg}</div>}
      </Section>

      <Section title="📱 Telegram">
        <Field label="BOT TOKEN" value={settings.telegram_bot_token} onChange={v => set('telegram_bot_token', v)} placeholder="1234567890:AABBCCxxx" />
        <Field label="CHAT ID" value={settings.telegram_chat_id} onChange={v => set('telegram_chat_id', v)} placeholder="-100123456789" />
      </Section>

      <Section title="📈 Nubra API">
        <Field label="PHONE" value={settings.nubra_phone} onChange={v => set('nubra_phone', v)} placeholder="9XXXXXXXXX" />
        <Field label="MPIN" type="password" value={settings.nubra_mpin} onChange={v => set('nubra_mpin', v)} placeholder="4-6 digit MPIN" />
        <Field label="DEVICE ID" value={settings.nubra_device_id} onChange={v => set('nubra_device_id', v)} />
      </Section>

      <Section title="🤖 Gemini AI">
        <Field label="API KEY" type="password" value={settings.gemini_api_key} onChange={v => set('gemini_api_key', v)} placeholder="AIza..." />
      </Section>

      <Section title="⚙ Strategy Defaults">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          {[
            ['EMA SHORT', 'ema_short'], ['EMA LONG', 'ema_long'], ['RSI PERIOD', 'rsi_period'],
            ['MACD FAST', 'macd_fast'], ['MACD SLOW', 'macd_slow'], ['MACD SIGNAL', 'macd_signal'],
            ['BB PERIOD', 'bb_period'], ['CROSSOVER PROXIMITY %', 'crossover_proximity']
          ].map(([label, key]) => (
            <div key={key}>
              <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:4, fontFamily:'var(--font-mono)' }}>{label}</label>
              <input type="number" value={settings[key]} onChange={e => set(key, +e.target.value)} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="⏰ Scan Schedule (IST)">
        {CRON_PRESETS.map((p, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
            <label style={{ fontSize:12, color:'var(--text2)', width:200 }}>{p.label}</label>
            <input value={settings.scan_crons[i]}
              onChange={e => {
                const crons = [...settings.scan_crons]
                crons[i] = e.target.value
                set('scan_crons', crons)
              }} style={{ fontFamily:'var(--font-mono)', fontSize:12 }} />
          </div>
        ))}
      </Section>

      <button onClick={saveEnv} style={{
        padding:'12px 32px', borderRadius:'var(--radius)', fontWeight:700, fontSize:15,
        background: saved ? 'var(--bull)' : 'var(--accent)', color:'#000'
      }}>
        {saved ? '✓ Downloaded .env' : '↓ Download .env File'}
      </button>
      <p style={{ fontSize:12, color:'var(--muted)', marginTop:8 }}>
        Place the downloaded .env file in the root of your tradebot folder on the Pi, then restart.
      </p>
    </div>
  )
}
