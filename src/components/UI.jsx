import { X, AlertTriangle, Loader2 } from 'lucide-react'

// ─── Badge ───────────────────────────────────────────────
const STATUS_MAP = {
  draft: 'badge-gray', submitted: 'badge-blue', quotation_pending: 'badge-amber',
  quotation_received: 'badge-purple', approved: 'badge-green', rejected: 'badge-red',
  po_raised: 'badge-indigo', sent: 'badge-teal', acknowledged: 'badge-teal',
  partially_delivered: 'badge-orange', delivered: 'badge-green', closed: 'badge-gray',
  cancelled: 'badge-red', pending: 'badge-amber', paid: 'badge-green',
  not_sent: 'badge-gray', good: 'badge-green', damaged: 'badge-red',
  partial: 'badge-amber', active: 'badge-green', blacklisted: 'badge-red',
  in_store: 'badge-blue', assigned: 'badge-teal', under_repair: 'badge-amber',
  disposed: 'badge-gray', asset: 'badge-blue', consumable: 'badge-green',
  repair: 'badge-orange', low: 'badge-gray', medium: 'badge-amber',
  high: 'badge-orange', critical: 'badge-red', it_staff: 'badge-blue',
  it_head: 'badge-purple', branch_user: 'badge-teal', finance_head: 'badge-green',
  amended: 'badge-orange', neft: 'badge-blue', rtgs: 'badge-blue',
}

export function Badge({ status, label }) {
  const cls = STATUS_MAP[status] || 'badge-gray'
  const text = (label || status || '').replace(/_/g, ' ').toUpperCase()
  return <span className={`badge ${cls}`}>{text}</span>
}

// ─── Modal ───────────────────────────────────────────────
export function Modal({ open, onClose, title, subtitle, children, size = 'lg' }) {
  if (!open) return null
  const sizes = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl', full: 'max-w-7xl' }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`bg-white rounded-2xl shadow-2xl w-full ${sizes[size]} max-h-[90vh] flex flex-col`}>
        <div className="flex items-start justify-between p-6 border-b border-slate-100 flex-shrink-0">
          <div>
            <h2 className="text-lg font-bold text-navy">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-4 flex-shrink-0"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Spinner ─────────────────────────────────────────────
export function Spinner({ size = 24 }) {
  return <Loader2 size={size} className="animate-spin text-navy" />
}

export function FullPageSpinner() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
      <div className="text-center">
        <Spinner size={40} />
        <p className="text-sm text-slate-500 mt-3">Loading Scorpion...</p>
      </div>
    </div>
  )
}

// ─── Empty State ─────────────────────────────────────────
export function EmptyState({ icon, title, subtitle, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="text-5xl mb-4">{icon || '📭'}</div>
      <h3 className="text-base font-semibold text-slate-700">{title}</h3>
      {subtitle && <p className="text-sm text-slate-400 mt-1 max-w-xs">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

// ─── Confirm Dialog ───────────────────────────────────────
export function ConfirmDialog({ open, title, message, onConfirm, onCancel, danger = false }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${danger ? 'bg-red-100' : 'bg-amber-100'}`}>
          <AlertTriangle size={22} className={danger ? 'text-red-600' : 'text-amber-600'} />
        </div>
        <h3 className="font-bold text-slate-800 text-base mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6">{message}</p>
        <div className="flex gap-3">
          <button className="btn btn-ghost flex-1" onClick={onCancel}>Cancel</button>
          <button className={`btn flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  )
}

// ─── Stats Card ───────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'blue', icon }) {
  const colors = {
    blue: 'border-t-blue-500', gold: 'border-t-gold', purple: 'border-t-purple-500',
    red: 'border-t-red-500', green: 'border-t-green-500', teal: 'border-t-teal-500',
  }
  return (
    <div className={`card card-pad border-t-4 ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-2xl font-bold font-mono text-slate-800">{value}</p>
          <p className="text-sm font-semibold text-slate-600 mt-1">{label}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
        {icon && <span className="text-2xl opacity-60">{icon}</span>}
      </div>
    </div>
  )
}

// ─── Page Header ─────────────────────────────────────────
export function PageHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="page-sub">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

// ─── Form Field ──────────────────────────────────────────
export function Field({ label, required, error, children }) {
  return (
    <div>
      <label className="form-label">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      {children}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

// ─── Status Timeline ─────────────────────────────────────
export function StatusTimeline({ steps, currentStep }) {
  return (
    <div className="flex items-center overflow-x-auto py-2 gap-0">
      {steps.map((step, i) => {
        const done = i < currentStep
        const active = i === currentStep
        return (
          <div key={i} className="flex items-center flex-shrink-0">
            <div className="flex flex-col items-center min-w-[80px]">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-sm
                ${done ? 'bg-green-500 text-white' : active ? 'bg-navy text-white ring-4 ring-navy/20' : 'bg-slate-200 text-slate-400'}`}>
                {done ? '✓' : i + 1}
              </div>
              <p className={`text-[10px] font-semibold mt-1.5 text-center max-w-[75px] leading-tight ${active ? 'text-navy' : done ? 'text-green-600' : 'text-slate-400'}`}>{step.label}</p>
              {step.actor && <p className="text-[9px] text-slate-400 text-center">{step.actor}</p>}
            </div>
            {i < steps.length - 1 && <div className={`h-0.5 w-8 mb-5 flex-shrink-0 ${i < currentStep ? 'bg-green-400' : 'bg-slate-200'}`} />}
          </div>
        )
      })}
    </div>
  )
}
