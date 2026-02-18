import { useState, useEffect, useCallback, useRef, createContext, useContext } from "react"

// ============================================================
// CONFIG
// ============================================================
const API = import.meta.env.VITE_API_URL || "http://localhost:8000"
const WS_URL = API.replace("https://","wss://").replace("http://","ws://")

// ============================================================
// AUTH CONTEXT
// ============================================================
const AuthCtx = createContext(null)
function useAuth() { return useContext(AuthCtx) }

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("inv_user")) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem("inv_token") || null)

  const login = async (username, password) => {
    const fd = new FormData()
    fd.append("username", username); fd.append("password", password)
    const res = await fetch(`${API}/auth/login`, { method:"POST", body: fd })
    if (!res.ok) throw new Error((await res.json()).detail || "Login failed")
    const data = await res.json()
    localStorage.setItem("inv_token", data.access_token)
    localStorage.setItem("inv_user", JSON.stringify({ username: data.username, role: data.role, full_name: data.full_name }))
    setToken(data.access_token); setUser({ username: data.username, role: data.role, full_name: data.full_name })
    return data
  }

  const logout = () => {
    localStorage.removeItem("inv_token"); localStorage.removeItem("inv_user")
    setToken(null); setUser(null)
  }

  return <AuthCtx.Provider value={{ user, token, login, logout }}>{children}</AuthCtx.Provider>
}

// ============================================================
// API HELPER
// ============================================================
function useApi() {
  const { token } = useAuth()
  const call = useCallback(async (path, opts={}) => {
    const res = await fetch(`${API}${path}`, {
      ...opts,
      headers: { "Content-Type":"application/json", Authorization: `Bearer ${token}`, ...opts.headers }
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.detail || `Error ${res.status}`)
    }
    return res.json()
  }, [token])
  return call
}

// ============================================================
// WEBSOCKET HOOK
// ============================================================
function useWS(onMessage) {
  const wsRef = useRef(null)
  const { token } = useAuth()

  useEffect(() => {
    if (!token) return
    const clientId = Math.random().toString(36).slice(2)
    const connect = () => {
      const ws = new WebSocket(`${WS_URL}/ws/${clientId}`)
      wsRef.current = ws
      ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)) } catch {} }
      ws.onclose = () => { setTimeout(connect, 3000) }
    }
    connect()
    return () => wsRef.current?.close()
  }, [token])
}

// ============================================================
// COLORS / HELPERS
// ============================================================
const STATUS_STYLES = {
  OK:           { bg:"bg-green-100",  text:"text-green-800",  label:"✅ OK" },
  LOW:          { bg:"bg-yellow-100", text:"text-yellow-800", label:"⚠️ LOW" },
  CRITICAL:     { bg:"bg-red-100",    text:"text-red-800",    label:"🔴 CRITICAL" },
  OUT_OF_STOCK: { bg:"bg-gray-200",   text:"text-gray-700",   label:"🚫 หมด" },
  OVERSTOCK:    { bg:"bg-blue-100",   text:"text-blue-800",   label:"🔵 OVERSTOCK" },
}
const MOV_STYLES = {
  FAST_MOVING:  { bg:"bg-green-100",  text:"text-green-800",  label:"🚀 Fast Moving" },
  MOVING:       { bg:"bg-teal-100",   text:"text-teal-700",   label:"⚡ Moving" },
  NORMAL:       { bg:"bg-blue-100",   text:"text-blue-700",   label:"🔄 Normal" },
  SLOW_MOVING:  { bg:"bg-orange-100", text:"text-orange-700", label:"🐢 Slow Moving" },
  DEAD_STOCK:   { bg:"bg-red-100",    text:"text-red-700",    label:"🪦 Dead Stock" },
}
const AGING_STYLES = {
  "0_30":   { bg:"bg-green-100",  text:"text-green-800",  label:"🟢 0-30 วัน" },
  "31_60":  { bg:"bg-yellow-100", text:"text-yellow-800", label:"🟡 31-60 วัน" },
  "61_90":  { bg:"bg-orange-100", text:"text-orange-700", label:"🟠 61-90 วัน" },
  "OVER_90":{ bg:"bg-red-100",    text:"text-red-700",    label:"🔴 >90 วัน" },
  "NO_DATA":{ bg:"bg-gray-100",   text:"text-gray-500",   label:"— ไม่มีข้อมูล" },
}
const ABC_STYLES = {
  A: { bg:"bg-red-100",    text:"text-red-800" },
  B: { bg:"bg-yellow-100", text:"text-yellow-800" },
  C: { bg:"bg-green-100",  text:"text-green-800" },
}
const fmtNum  = (n) => (n||0).toLocaleString("th-TH", { minimumFractionDigits:0, maximumFractionDigits:2 })
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("th-TH") : "—"
const Badge   = ({ style, children }) =>
  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${style?.bg} ${style?.text}`}>{children}</span>

// ============================================================
// COMPONENTS
// ============================================================
function KPICard({ icon, label, value, sub, color="blue" }) {
  const colors = {
    blue:   "from-blue-600 to-blue-700",
    red:    "from-red-500 to-red-600",
    green:  "from-green-600 to-green-700",
    orange: "from-orange-500 to-orange-600",
    purple: "from-purple-600 to-purple-700",
    gray:   "from-gray-500 to-gray-600",
  }
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colors[color]} text-white p-5 shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        {sub && <span className="text-xs opacity-70">{sub}</span>}
      </div>
      <div className="text-3xl font-bold mb-1">{value}</div>
      <div className="text-sm opacity-80">{label}</div>
    </div>
  )
}

function Table({ cols, rows, loading }) {
  if (loading) return <div className="text-center py-16 text-gray-400">⏳ กำลังโหลด...</div>
  if (!rows?.length) return <div className="text-center py-16 text-gray-400">ไม่มีข้อมูล</div>
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-700 text-white">
            {cols.map(c => <th key={c.key} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i%2===0 ? "bg-white" : "bg-slate-50"}>
              {cols.map(c => (
                <td key={c.key} className="px-3 py-2.5 whitespace-nowrap">
                  {c.render ? c.render(row[c.key], row) : row[c.key] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold text-slate-700">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function Toast({ toasts }) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map(t => (
        <div key={t.id} className={`px-4 py-3 rounded-xl shadow-lg text-white font-medium text-sm
          ${t.type==="error" ? "bg-red-500" : t.type==="warn" ? "bg-orange-400" : "bg-green-500"}`}>
          {t.message}
        </div>
      ))}
    </div>
  )
}

function useToast() {
  const [toasts, setToasts] = useState([])
  const show = (message, type="success") => {
    const id = Date.now()
    setToasts(t => [...t, { id, message, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500)
  }
  return { toasts, show }
}

// ============================================================
// LOGIN PAGE
// ============================================================
function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e) => {
    e.preventDefault(); setError(""); setLoading(true)
    try { await login(username, password) }
    catch (err) { setError(err.message) }
    finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏭</div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-gray-500 text-sm mt-1">ระบบจัดการสต็อกสินค้า Realtime</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อผู้ใช้</label>
            <input value={username} onChange={e=>setUsername(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="admin / manager / staff1 / viewer" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">รหัสผ่าน</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 outline-none"
              placeholder="admin1234 / manager1234 / staff1234" required />
          </div>
          {error && <p className="text-red-500 text-sm bg-red-50 p-3 rounded-xl">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full bg-slate-700 hover:bg-slate-800 text-white font-bold py-3 rounded-xl transition disabled:opacity-50">
            {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
          </button>
        </form>

        <div className="mt-6 p-4 bg-gray-50 rounded-xl text-xs text-gray-500">
          <p className="font-semibold mb-2">👤 บัญชีทดสอบ:</p>
          <div className="grid grid-cols-2 gap-1">
            <span>admin / admin1234</span><span className="text-blue-600">ผู้ดูแลระบบ</span>
            <span>manager / manager1234</span><span className="text-green-600">ผู้จัดการ</span>
            <span>staff1 / staff1234</span><span className="text-orange-600">พนักงาน</span>
            <span>viewer / viewer1234</span><span className="text-gray-600">ดูอย่างเดียว</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// DASHBOARD PAGE
// ============================================================
function DashboardPage() {
  const api = useApi()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setData(await api("/api/analytics/dashboard")) }
    catch(e) { console.error(e) }
    finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])
  useWS(msg => { if (msg.type === "STOCK_UPDATED") load() })

  if (loading) return <div className="text-center py-20 text-gray-400">⏳ กำลังโหลด Dashboard...</div>
  if (!data) return null

  const { kpi, abc_breakdown, balance_summary } = data
  const statuses = balance_summary?.reduce((acc, b) => { acc[b?.status]=(acc[b?.status]||0)+1; return acc }, {}) || {}

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">📊 Dashboard</h1>
        <span className="text-sm text-gray-400">🟢 อัพเดต Realtime</span>
      </div>

      {/* KPI Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon="📦" label="สินค้าทั้งหมด" value={kpi.total_items} color="blue" />
        <KPICard icon="💰" label="มูลค่าสต็อกรวม (฿)" value={`฿${fmtNum(kpi.total_stock_value)}`} color="green" />
        <KPICard icon="🔴" label="Critical / Low" value={`${kpi.critical_items} / ${kpi.low_items}`} sub="ต้องดำเนินการ" color="red" />
        <KPICard icon="✅" label="สต็อกปกติ" value={kpi.ok_items} color="gray" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard icon="🔬" label="QC Hold" value={kpi.qc_hold_count} sub={`฿${fmtNum(kpi.qc_hold_value)}`} color="orange" />
        <KPICard icon="🏗️" label="Active Projects" value={kpi.active_projects} color="purple" />
        <KPICard icon="📥" label="GRN ทั้งหมด" value={kpi.total_grn} color="blue" />
        <KPICard icon="📤" label="Issue ทั้งหมด" value={kpi.total_issues} color="gray" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ABC Breakdown */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-bold text-slate-700 mb-4">📊 ABC Class Breakdown</h2>
          {["A","B","C"].map(cls => {
            const s = abc_breakdown?.[cls] || {}
            const total = Object.values(abc_breakdown||{}).reduce((a,b)=>a+(b.value||0),0)
            const pct = total ? (s.value/total*100) : 0
            return (
              <div key={cls} className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className={`font-bold ${ABC_STYLES[cls]?.text}`}>Class {cls} — {s.count||0} รายการ</span>
                  <span className="text-gray-600">฿{fmtNum(s.value)} ({pct.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3">
                  <div className={`h-3 rounded-full ${cls==="A"?"bg-red-400":cls==="B"?"bg-yellow-400":"bg-green-400"}`}
                       style={{ width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Stock Status */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="font-bold text-slate-700 mb-4">🏷️ Stock Status Summary</h2>
          <div className="space-y-3">
            {Object.entries(STATUS_STYLES).map(([k,v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className={`text-sm font-medium ${v.text}`}>{v.label}</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${v.bg}`}
                         style={{ width: `${((statuses[k]||0) / kpi.total_items) * 100}%` }} />
                  </div>
                  <span className="text-sm font-bold w-8 text-right">{statuses[k]||0}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Balance Table */}
      <div className="bg-white rounded-2xl shadow p-6">
        <h2 className="font-bold text-slate-700 mb-4">📦 Balance On Hand (Realtime)</h2>
        <Table
          cols={[
            { key:"item_code",         label:"Item Code" },
            { key:"item_name",         label:"ชื่อสินค้า" },
            { key:"uom",               label:"หน่วย" },
            { key:"abc_class",         label:"ABC", render: v => <Badge style={ABC_STYLES[v]}>{v}</Badge> },
            { key:"available_stock",   label:"Available", render: v => <span className="font-bold">{fmtNum(v)}</span> },
            { key:"qc_hold",           label:"QC Hold",
              render: v => v>0 ? <span className="text-orange-600 font-bold">{fmtNum(v)}</span> : "—" },
            { key:"project_reserved",  label:"Project",
              render: v => v>0 ? <span className="text-purple-600 font-bold">{fmtNum(v)}</span> : "—" },
            { key:"total_in_warehouse",label:"Total In WH", render: v => fmtNum(v) },
            { key:"total_value",       label:"มูลค่า (฿)", render: v => `฿${fmtNum(v)}` },
            { key:"status",            label:"Status",
              render: v => <Badge style={STATUS_STYLES[v]}>{STATUS_STYLES[v]?.label||v}</Badge> },
          ]}
          rows={balance_summary || []}
          loading={loading}
        />
      </div>
    </div>
  )
}

// ============================================================
// RECEIVE PAGE
// ============================================================
function ReceivePage() {
  const api = useApi()
  const { toasts, show } = useToast()
  const { user } = useAuth()
  const [grns, setGrns] = useState([]); const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([]); const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ po_no:"", supplier:"", remarks:"" })
  const [lines, setLines] = useState([{ item_code:"", qty_ordered:0, qty_received:0, qty_pass_qc:0, qty_fail_qc:0, qc_reason:"" }])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [g, i] = await Promise.all([api("/api/receive/"), api("/api/items/")])
      setGrns(g); setItems(i)
    } catch {} finally { setLoading(false) }
  }, [api])

  useEffect(() => { load() }, [load])
  useWS(msg => { if (msg.type==="STOCK_UPDATED") load() })

  const addLine = () => setLines(l => [...l, { item_code:"", qty_ordered:0, qty_received:0, qty_pass_qc:0, qty_fail_qc:0, qc_reason:"" }])
  const updateLine = (i, field, val) => setLines(l => l.map((ln,idx) => idx===i ? {...ln, [field]: val} : ln))

  const submit = async () => {
    if (!form.supplier) return show("กรุณากรอก Supplier","error")
    setSaving(true)
    try {
      const res = await api("/api/receive/", {
        method:"POST", body: JSON.stringify({ ...form, created_by: user.username,
          lines: lines.map(l => ({ ...l, qty_ordered:+l.qty_ordered, qty_received:+l.qty_received,
            qty_pass_qc:+l.qty_pass_qc, qty_fail_qc:+l.qty_fail_qc }))
        })
      })
      show(`✅ บันทึก ${res.grn_no} สำเร็จ`)
      setShowModal(false); setForm({ po_no:"", supplier:"", remarks:"" })
      setLines([{ item_code:"", qty_ordered:0, qty_received:0, qty_pass_qc:0, qty_fail_qc:0, qc_reason:"" }])
      load()
    } catch(e) { show(e.message,"error") }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">📥 รับสินค้า / GRN</h1>
        {user?.role !== "viewer" && (
          <button onClick={() => setShowModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white font-bold px-5 py-2.5 rounded-xl transition">
            + สร้าง GRN ใหม่
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        <Table loading={loading}
          cols={[
            { key:"grn_no",       label:"GRN No.", render:v=><span className="font-bold text-blue-700">{v}</span> },
            { key:"po_no",        label:"PO No." },
            { key:"supplier",     label:"Supplier" },
            { key:"created_by",   label:"ผู้บันทึก" },
            { key:"receive_date", label:"วันที่รับ", render:v=>fmtDate(v) },
            { key:"lines",        label:"# รายการ", render:v=>`${v?.length||0} รายการ` },
            { key:"lines",        label:"QC Fail",
              render: v => {
                const fail = v?.reduce((a,l)=>a+(l.qty_fail_qc||0),0)||0
                return fail>0 ? <span className="text-orange-600 font-bold">{fail} QC Hold</span> : "—"
              }
            },
            { key:"remarks", label:"หมายเหตุ" },
          ]}
          rows={grns}
        />
      </div>

      <Modal open={showModal} onClose={() => setShowModal(false)} title="📥 สร้าง GRN ใหม่">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">PO No.</label>
              <input value={form.po_no} onChange={e=>setForm(f=>({...f,po_no:e.target.value}))}
                className="w-full border rounded-xl px-3 py-2 mt-1" placeholder="PO-XXXX" />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Supplier *</label>
              <input value={form.supplier} onChange={e=>setForm(f=>({...f,supplier:e.target.value}))}
                className="w-full border rounded-xl px-3 py-2 mt-1" required />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">หมายเหตุ</label>
            <input value={form.remarks} onChange={e=>setForm(f=>({...f,remarks:e.target.value}))}
              className="w-full border rounded-xl px-3 py-2 mt-1" />
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>
                  {["Item","สั่ง","รับ","ผ่าน QC","ไม่ผ่าน QC","เหตุผล QC"].map(h =>
                    <th key={h} className="px-2 py-2 text-left">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <select value={line.item_code} onChange={e=>updateLine(i,"item_code",e.target.value)}
                        className="border rounded px-2 py-1 w-36">
                        <option value="">เลือก</option>
                        {items.map(it => <option key={it.code} value={it.code}>{it.code} – {it.name}</option>)}
                      </select>
                    </td>
                    {["qty_ordered","qty_received","qty_pass_qc","qty_fail_qc"].map(f => (
                      <td key={f} className="p-1">
                        <input type="number" value={line[f]} onChange={e=>updateLine(i,f,e.target.value)}
                          className="border rounded px-2 py-1 w-16" min="0" />
                      </td>
                    ))}
                    <td className="p-1">
                      <input value={line.qc_reason} onChange={e=>updateLine(i,"qc_reason",e.target.value)}
                        className="border rounded px-2 py-1 w-28" placeholder="ระบุเหตุผล" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addLine} className="text-sm text-blue-600 hover:underline">+ เพิ่มรายการ</button>

          <div className="flex gap-3 pt-2">
            <button onClick={submit} disabled={saving}
              className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
              {saving ? "กำลังบันทึก..." : "✅ บันทึก GRN"}
            </button>
            <button onClick={() => setShowModal(false)}
              className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-2.5 rounded-xl">
              ยกเลิก
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// ISSUE PAGE
// ============================================================
function IssuePage() {
  const api = useApi(); const { user } = useAuth()
  const { toasts, show } = useToast()
  const [issues, setIssues] = useState([]); const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([]); const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ req_no:"", department:"", remarks:"" })
  const [lines, setLines] = useState([{ item_code:"", qty_requested:0, qty_issued:0, issue_type:"General", project_code:"" }])
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const [is, it] = await Promise.all([api("/api/issue/"), api("/api/items/")])
      setIssues(is); setItems(it)
    } catch {} finally { setLoading(false) }
  }, [api])
  useEffect(() => { load() }, [load])
  useWS(msg => { if (msg.type==="STOCK_UPDATED") load() })

  const addLine = () => setLines(l=>[...l,{item_code:"",qty_requested:0,qty_issued:0,issue_type:"General",project_code:""}])
  const updateLine = (i,f,v) => setLines(l=>l.map((ln,idx)=>idx===i?{...ln,[f]:v}:ln))

  const submit = async () => {
    if (!form.department) return show("กรุณากรอก Department","error")
    setSaving(true)
    try {
      const res = await api("/api/issue/", {
        method:"POST", body: JSON.stringify({ ...form, created_by:user.username,
          lines: lines.map(l=>({...l, qty_requested:+l.qty_requested, qty_issued:+l.qty_issued}))
        })
      })
      show(`✅ บันทึก ${res.issue_no} สำเร็จ`)
      setShowModal(false)
      setLines([{item_code:"",qty_requested:0,qty_issued:0,issue_type:"General",project_code:""}])
      load()
    } catch(e) { show(e.message,"error") }
    finally { setSaving(false) }
  }

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">📤 จ่ายสินค้า / Issue</h1>
        {user?.role !== "viewer" && (
          <button onClick={()=>setShowModal(true)}
            className="bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl">
            + สร้าง Issue ใหม่
          </button>
        )}
      </div>
      <div className="bg-white rounded-2xl shadow p-6">
        <Table loading={loading} rows={issues}
          cols={[
            {key:"issue_no",   label:"Issue No.", render:v=><span className="font-bold text-red-700">{v}</span>},
            {key:"req_no",     label:"Req No."},
            {key:"department", label:"หน่วยงาน"},
            {key:"created_by", label:"ผู้บันทึก"},
            {key:"issue_date", label:"วันที่จ่าย", render:v=>fmtDate(v)},
            {key:"lines",      label:"# รายการ", render:v=>`${v?.length||0} รายการ`},
            {key:"lines",      label:"Project",  render:v=>{
              const projs=[...new Set(v?.map(l=>l.project_code).filter(Boolean))]
              return projs.length ? <span className="text-purple-600 font-bold">{projs.join(", ")}</span>:"General"
            }},
          ]}
        />
      </div>
      <Modal open={showModal} onClose={()=>setShowModal(false)} title="📤 สร้าง Issue ใหม่">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium">Req No.</label>
              <input value={form.req_no} onChange={e=>setForm(f=>({...f,req_no:e.target.value}))}
                className="w-full border rounded-xl px-3 py-2 mt-1" />
            </div>
            <div>
              <label className="text-sm font-medium">หน่วยงาน / Department *</label>
              <input value={form.department} onChange={e=>setForm(f=>({...f,department:e.target.value}))}
                className="w-full border rounded-xl px-3 py-2 mt-1" required />
            </div>
          </div>
          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-slate-700 text-white">
                <tr>{["Item","ขอ","จ่าย","ประเภท","Project Code"].map(h=><th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {lines.map((line,i)=>(
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <select value={line.item_code} onChange={e=>updateLine(i,"item_code",e.target.value)}
                        className="border rounded px-2 py-1 w-36">
                        <option value="">เลือก</option>
                        {items.map(it=><option key={it.code} value={it.code}>{it.code}–{it.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1"><input type="number" value={line.qty_requested} onChange={e=>updateLine(i,"qty_requested",e.target.value)} className="border rounded px-2 py-1 w-16" min="0" /></td>
                    <td className="p-1"><input type="number" value={line.qty_issued} onChange={e=>updateLine(i,"qty_issued",e.target.value)} className="border rounded px-2 py-1 w-16" min="0" /></td>
                    <td className="p-1">
                      <select value={line.issue_type} onChange={e=>updateLine(i,"issue_type",e.target.value)} className="border rounded px-2 py-1">
                        <option>General</option><option>Project</option>
                      </select>
                    </td>
                    <td className="p-1"><input value={line.project_code} onChange={e=>updateLine(i,"project_code",e.target.value)} className="border rounded px-2 py-1 w-24" placeholder="PRJ-XXX" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={addLine} className="text-sm text-blue-600 hover:underline">+ เพิ่มรายการ</button>
          <div className="flex gap-3 pt-2">
            <button onClick={submit} disabled={saving}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
              {saving?"กำลังบันทึก...":"✅ บันทึก Issue"}
            </button>
            <button onClick={()=>setShowModal(false)} className="flex-1 bg-gray-100 text-gray-700 font-bold py-2.5 rounded-xl">ยกเลิก</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ============================================================
// QC PAGE
// ============================================================
function QCPage() {
  const api = useApi(); const { user } = useAuth()
  const { toasts, show } = useToast()
  const [holds, setHolds] = useState([]); const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setHolds(await api("/api/qc/")) } catch {} finally { setLoading(false) }
  }, [api])
  useEffect(() => { load() }, [load])
  useWS(msg => { if (msg.type==="STOCK_UPDATED") load() })

  const updateStatus = async (id, status, action="") => {
    try {
      await api(`/api/qc/${id}`, { method:"PUT", body: JSON.stringify({ status, action }) })
      show(`✅ อัพเดต QC สำเร็จ — ${status}`)
      load()
    } catch(e) { show(e.message,"error") }
  }

  const totalValue = holds.reduce((a,h)=>a+(h.hold_value||0),0)

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">🔬 QC Hold Stock</h1>
        <div className="bg-orange-100 text-orange-800 px-4 py-2 rounded-xl font-bold">
          {holds.length} รายการ | ฿{fmtNum(totalValue)}
        </div>
      </div>
      <div className="bg-white rounded-2xl shadow p-6">
        <Table loading={loading} rows={holds}
          cols={[
            {key:"qc_ref",      label:"QC Ref", render:v=><span className="font-bold">{v}</span>},
            {key:"grn_no",      label:"GRN No."},
            {key:"item_code",   label:"Item Code"},
            {key:"item_name",   label:"ชื่อสินค้า"},
            {key:"uom",         label:"หน่วย"},
            {key:"qty_hold",    label:"จำนวน Hold", render:v=><span className="font-bold text-orange-600">{fmtNum(v)}</span>},
            {key:"reason",      label:"เหตุผล"},
            {key:"status",      label:"Status", render:v=>{
              const s={pending:"⏳ Pending",review:"🔄 Review",approved:"✅ Approved",rejected:"❌ Rejected"}
              const c={pending:"text-yellow-700 bg-yellow-100",review:"text-blue-700 bg-blue-100",
                       approved:"text-green-700 bg-green-100",rejected:"text-red-700 bg-red-100"}
              return <span className={`text-xs font-bold px-2 py-1 rounded-full ${c[v]}`}>{s[v]||v}</span>
            }},
            {key:"days_on_hold",label:"วันที่ Hold", render:v=>{
              const color=v>30?"text-red-600":v>14?"text-orange-500":"text-gray-600"
              return <span className={`font-bold ${color}`}>{v} วัน</span>
            }},
            {key:"hold_value",  label:"มูลค่า (฿)", render:v=>`฿${fmtNum(v)}`},
            {key:"id",          label:"Action", render:(id,row)=>user?.role!=="viewer"&&row.status==="pending"?(
              <div className="flex gap-1">
                <button onClick={()=>updateStatus(id,"approved","ผ่าน QC")}
                  className="bg-green-500 text-white text-xs px-2 py-1 rounded hover:bg-green-600">✅ ผ่าน</button>
                <button onClick={()=>updateStatus(id,"rejected","ส่งคืน")}
                  className="bg-red-500 text-white text-xs px-2 py-1 rounded hover:bg-red-600">❌ คืน</button>
              </div>
            ):null},
          ]}
        />
      </div>
    </div>
  )
}

// ============================================================
// PROJECT PAGE
// ============================================================
function ProjectPage() {
  const api = useApi(); const { user } = useAuth()
  const { toasts, show } = useToast()
  const [projects, setProjects] = useState([]); const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try { setProjects(await api("/api/project/")) } catch {} finally { setLoading(false) }
  }, [api])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="text-center py-20 text-gray-400">⏳ กำลังโหลด...</div>

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} />
      <h1 className="text-2xl font-bold text-slate-800">🏗️ Project Stock</h1>
      <div className="grid gap-4">
        {projects.map(p => (
          <div key={p.id} className="bg-white rounded-2xl shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="font-bold text-lg text-slate-800">{p.code}</span>
                <span className="ml-3 text-gray-600">{p.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-bold
                  ${p.status==="active"?"bg-green-100 text-green-700":
                    p.status==="completed"?"bg-gray-100 text-gray-600":"bg-purple-100 text-purple-700"}`}>
                  {p.status==="active"?"🟢 Active":p.status==="completed"?"✅ Completed":"📋 Planned"}
                </span>
                <span className="text-sm font-bold text-slate-700">฿{fmtNum(p.total_value)}</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-200 text-gray-500 text-xs">
                  {["Item","ชื่อ","จอง","จ่ายแล้ว","คงเหลือ","% ใช้","มูลค่า"].map(h=>
                    <th key={h} className="text-left pb-2 pr-4">{h}</th>)}
                </tr></thead>
                <tbody>
                  {p.stocks.map((s,i)=>(
                    <tr key={i} className="border-t">
                      <td className="py-2 pr-4 font-medium text-purple-700">{s.item_code}</td>
                      <td className="py-2 pr-4">{s.item_name}</td>
                      <td className="py-2 pr-4 font-bold">{fmtNum(s.qty_reserved)}</td>
                      <td className="py-2 pr-4 text-red-600">{fmtNum(s.qty_issued)}</td>
                      <td className="py-2 pr-4 font-bold text-blue-700">{fmtNum(s.remaining)}</td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-100 rounded-full h-2">
                            <div className="h-2 rounded-full bg-purple-400" style={{width:`${Math.min(s.pct_used,100)}%`}}/>
                          </div>
                          <span className="text-xs">{s.pct_used.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="py-2 font-bold">฿{fmtNum(s.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
        {!projects.length && <div className="text-center py-16 text-gray-400 bg-white rounded-2xl">ไม่มี Project</div>}
      </div>
    </div>
  )
}

// ============================================================
// ANALYTICS PAGE
// ============================================================
function AnalyticsPage() {
  const api = useApi()
  const [tab, setTab] = useState("movement")
  const [movement, setMovement] = useState([]); const [aging, setAging] = useState(null)
  const [abc, setAbc] = useState([]); const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, ag, ab] = await Promise.all([
        api("/api/analytics/movement"),
        api("/api/analytics/aging"),
        api("/api/analytics/abc"),
      ])
      setMovement(m); setAging(ag); setAbc(ab)
    } catch {} finally { setLoading(false) }
  }, [api])
  useEffect(() => { load() }, [load])

  const tabs = [
    { id:"movement", label:"⚡ Fast/Slow Moving" },
    { id:"aging",    label:"⏳ Stock Aging" },
    { id:"abc",      label:"📊 ABC Analysis" },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-800">📈 Analytics</h1>

      <div className="flex gap-2 flex-wrap">
        {tabs.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            className={`px-4 py-2 rounded-xl font-medium transition ${
              tab===t.id ? "bg-slate-700 text-white" : "bg-white text-gray-600 hover:bg-gray-50 border"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* MOVEMENT */}
      {tab==="movement" && (
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex gap-3 mb-4 flex-wrap">
            {Object.entries(MOV_STYLES).map(([k,v])=>(
              <span key={k} className={`text-xs font-bold px-3 py-1 rounded-full ${v.bg} ${v.text}`}>
                {v.label}: {movement.filter(m=>m.movement_category===k).length}
              </span>
            ))}
          </div>
          <Table loading={loading} rows={movement}
            cols={[
              {key:"item_code",          label:"Code"},
              {key:"item_name",          label:"ชื่อสินค้า"},
              {key:"abc_class",          label:"ABC", render:v=><Badge style={ABC_STYLES[v]}>{v}</Badge>},
              {key:"current_stock",      label:"คงเหลือ", render:v=>fmtNum(v)},
              {key:"total_qty_issued",   label:"จ่ายรวม", render:v=><span className="font-bold">{fmtNum(v)}</span>},
              {key:"txn_count",          label:"# Txn"},
              {key:"days_since_last_issue", label:"วันล่าสุด",
                render:v=>v!=null?<span className={v>90?"text-red-600 font-bold":v>60?"text-orange-500":""}>{v} วัน</span>:"—"},
              {key:"movement_category",  label:"Category",
                render:v=><Badge style={MOV_STYLES[v]}>{MOV_STYLES[v]?.label||v}</Badge>},
            ]}
          />
        </div>
      )}

      {/* AGING */}
      {tab==="aging" && aging && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {key:"0_30",    label:"0-30 วัน (Fresh)",    color:"green"},
              {key:"31_60",   label:"31-60 วัน (Watch)",   color:"yellow"},
              {key:"61_90",   label:"61-90 วัน (At Risk)", color:"orange"},
              {key:"OVER_90", label:">90 วัน (!)",         color:"red"},
            ].map(b => (
              <div key={b.key} className={`rounded-xl p-4 border-2
                ${b.color==="green"?"border-green-300 bg-green-50":
                  b.color==="yellow"?"border-yellow-300 bg-yellow-50":
                  b.color==="orange"?"border-orange-300 bg-orange-50":
                  "border-red-300 bg-red-50"}`}>
                <div className="text-xs font-medium text-gray-600">{b.label}</div>
                <div className="text-2xl font-bold mt-1">{aging.summary[b.key]?.count||0}</div>
                <div className="text-xs text-gray-500">฿{fmtNum(aging.summary[b.key]?.total_value)}</div>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <Table loading={loading} rows={aging.items||[]}
              cols={[
                {key:"item_code",             label:"Code"},
                {key:"item_name",             label:"ชื่อสินค้า"},
                {key:"abc_class",             label:"ABC", render:v=><Badge style={ABC_STYLES[v]}>{v}</Badge>},
                {key:"current_stock",         label:"สต็อก", render:v=>fmtNum(v)},
                {key:"days_since_last_receive",label:"วันตั้งแต่รับ",
                  render:v=>v!=null?<span className={v>90?"text-red-600 font-bold":v>60?"text-orange-500":""}>{v} วัน</span>:"—"},
                {key:"days_since_last_issue",  label:"วันตั้งแต่จ่าย",
                  render:v=>v!=null?<span className={v>90?"text-red-600 font-bold":v>60?"text-orange-500":""}>{v} วัน</span>:"—"},
                {key:"aging_bucket",           label:"Aging",
                  render:v=><Badge style={AGING_STYLES[v]}>{AGING_STYLES[v]?.label||v}</Badge>},
                {key:"stock_value",            label:"มูลค่า", render:v=>`฿${fmtNum(v)}`},
              ]}
            />
          </div>
        </div>
      )}

      {/* ABC */}
      {tab==="abc" && (
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="grid grid-cols-3 gap-4 mb-6">
            {["A","B","C"].map(cls => {
              const items = abc.filter(i=>i.abc_class===cls)
              const val = items.reduce((a,i)=>a+i.stock_value,0)
              const total = abc.reduce((a,i)=>a+i.stock_value,0)
              return (
                <div key={cls} className={`rounded-xl p-4 ${ABC_STYLES[cls]?.bg}`}>
                  <div className={`text-2xl font-bold ${ABC_STYLES[cls]?.text}`}>Class {cls}</div>
                  <div className="text-sm mt-1">{items.length} รายการ</div>
                  <div className="font-bold">฿{fmtNum(val)}</div>
                  <div className="text-xs">{total?(val/total*100).toFixed(1):0}% ของมูลค่ารวม</div>
                </div>
              )
            })}
          </div>
          <Table loading={loading} rows={abc}
            cols={[
              {key:"rank",           label:"#"},
              {key:"item_code",      label:"Code"},
              {key:"item_name",      label:"ชื่อสินค้า"},
              {key:"abc_class",      label:"ABC",    render:v=><Badge style={ABC_STYLES[v]}>{v}</Badge>},
              {key:"total_qty_issued",label:"จ่ายรวม",render:v=>fmtNum(v)},
              {key:"current_stock",  label:"คงเหลือ",render:v=>fmtNum(v)},
              {key:"stock_value",    label:"มูลค่า", render:v=>`฿${fmtNum(v)}`},
              {key:"pct_value",      label:"% มูลค่า",render:v=>`${(v||0).toFixed(2)}%`},
              {key:"cumulative_pct", label:"% สะสม",
                render:v=>{
                  const pct=v||0
                  return <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-blue-500" style={{width:`${Math.min(pct,100)}%`}}/>
                    </div>
                    <span>{pct.toFixed(1)}%</span>
                  </div>
                }},
            ]}
          />
        </div>
      )}
    </div>
  )
}

// ============================================================
// LAYOUT / NAV
// ============================================================
const PAGES = [
  { id:"dashboard", label:"Dashboard",       icon:"📊", roles:["admin","manager","staff","viewer"] },
  { id:"receive",   label:"รับสินค้า / GRN", icon:"📥", roles:["admin","manager","staff"] },
  { id:"issue",     label:"จ่ายสินค้า",       icon:"📤", roles:["admin","manager","staff"] },
  { id:"qc",        label:"QC Hold",          icon:"🔬", roles:["admin","manager","staff"] },
  { id:"project",   label:"Project Stock",    icon:"🏗️", roles:["admin","manager"] },
  { id:"analytics", label:"Analytics",        icon:"📈", roles:["admin","manager","viewer"] },
]

function Layout({ page, setPage }) {
  const { user, logout } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const allowedPages = PAGES.filter(p => p.roles.includes(user?.role))

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-slate-800 text-white min-h-screen">
        <div className="p-5 border-b border-slate-700">
          <div className="text-xl font-bold">🏭 Inventory</div>
          <div className="text-xs text-slate-400 mt-1">Management System</div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {allowedPages.map(p => (
            <button key={p.id} onClick={() => setPage(p.id)}
              className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 text-sm transition
                ${page===p.id ? "bg-slate-600 text-white font-bold" : "text-slate-300 hover:bg-slate-700"}`}>
              <span>{p.icon}</span><span>{p.label}</span>
            </button>
          ))}
        </nav>
        <div className="p-4 border-t border-slate-700">
          <div className="text-sm font-medium">{user?.full_name}</div>
          <div className="text-xs text-slate-400 capitalize">{user?.role}</div>
          <button onClick={logout} className="mt-3 text-xs text-slate-400 hover:text-white transition">ออกจากระบบ →</button>
        </div>
      </aside>

      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-slate-800 text-white px-4 py-3 flex items-center justify-between">
        <span className="font-bold">🏭 Inventory</span>
        <button onClick={() => setMenuOpen(!menuOpen)} className="text-2xl">☰</button>
      </div>
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-800/95 pt-16">
          <nav className="p-4 space-y-2">
            {allowedPages.map(p => (
              <button key={p.id} onClick={() => { setPage(p.id); setMenuOpen(false) }}
                className="w-full text-left px-4 py-3 rounded-xl text-white flex items-center gap-3">
                <span>{p.icon}</span><span>{p.label}</span>
              </button>
            ))}
            <button onClick={logout} className="w-full text-left px-4 py-3 text-slate-400">ออกจากระบบ</button>
          </nav>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 p-4 md:p-8 mt-14 md:mt-0 max-w-7xl">
        {page==="dashboard" && <DashboardPage />}
        {page==="receive"   && <ReceivePage />}
        {page==="issue"     && <IssuePage />}
        {page==="qc"        && <QCPage />}
        {page==="project"   && <ProjectPage />}
        {page==="analytics" && <AnalyticsPage />}
      </main>
    </div>
  )
}

// ============================================================
// APP ROOT
// ============================================================
export default function App() {
  const [page, setPage] = useState("dashboard")
  return (
    <AuthProvider>
      <AppGate page={page} setPage={setPage} />
    </AuthProvider>
  )
}

function AppGate({ page, setPage }) {
  const { user } = useAuth()
  if (!user) return <LoginPage />
  return <Layout page={page} setPage={setPage} />
}
