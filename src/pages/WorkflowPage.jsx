export default function WorkflowPage() {
  const steps = [
    { n: 1, label: 'PR Raised', actor: 'Branch User', color: '#3b82f6', desc: 'User raises PR via portal with items from SKU master and helpdesk ticket ref.' },
    { n: 2, label: 'Quotation Sourcing', actor: 'IT Staff (HO)', color: '#8b5cf6', desc: 'IT Staff contacts vendors and uploads minimum 3 quotations with line-item pricing.' },
    { n: 3, label: 'Quote Approval', actor: 'IT Head', color: '#f59e0b', desc: 'IT Head reviews L1/L2/L3 comparison matrix and approves the best quotation.' },
    { n: 4, label: 'PO Generated', actor: 'IT Staff (HO)', color: '#6366f1', desc: 'System auto-generates PO from approved quotation. IT Staff emails it to vendor.' },
    { n: 5, label: 'Vendor ACK', actor: 'IT Staff', color: '#14b8a6', desc: 'IT Staff records vendor acknowledgement of PO in the system.' },
    { n: 6, label: 'GRN Created', actor: 'IT Staff', color: '#10b981', desc: 'On delivery, IT Staff creates GRN with quantities, serial numbers and condition.' },
    { n: 7, label: 'Invoice Uploaded', actor: 'IT Staff', color: '#f97316', desc: 'Vendor bill uploaded and mapped to GRN for 3-way match.' },
    { n: 8, label: 'IT Head Approval', actor: 'IT Head', color: '#ef4444', desc: 'IT Head verifies invoice against GRN and PO, approves for payment.' },
    { n: 9, label: 'Finance Payment', actor: 'Finance Head', color: '#16a34a', desc: 'Finance Head approves payment and records UTR/cheque reference.' },
  ]
  const tables = [
    'users', 'branches', 'vendor_master', 'sku_master',
    'purchase_requisitions', 'pr_line_items', 'quotations', 'quotation_line_items',
    'purchase_orders', 'po_line_items', 'goods_receipt_notes', 'grn_line_items',
    'asset_register', 'vendor_invoices', 'audit_log',
  ]
  const roles = [
    { name: 'Branch User', color: '#3b82f6', perms: ['Raise PR', 'Track PR status', 'Receive delivery notifications'] },
    { name: 'IT Staff (HO)', color: '#8b5cf6', perms: ['Upload quotations', 'Generate PO', 'Create GRN', 'Upload invoices', 'Manage masters'] },
    { name: 'IT Head', color: '#f59e0b', perms: ['Approve quotations', 'Approve invoices', 'View all dashboards', 'Override actions'] },
    { name: 'Finance Head', color: '#16a34a', perms: ['View approved invoices', 'Approve payment', 'Record UTR/payment ref'] },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Procurement Workflow Map</h1>
        <p className="page-sub">End-to-end 9-stage process with actors and system events</p>
      </div>

      {/* Flow */}
      <div className="card card-pad">
        <p className="section-label">9-Stage Procurement Lifecycle</p>
        <div className="grid grid-cols-3 gap-4 mt-2">
          {steps.map(s => (
            <div key={s.n} className="flex gap-3 p-3 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm flex-shrink-0 shadow"
                style={{ background: s.color }}>{s.n}</div>
              <div>
                <div className="font-bold text-sm text-slate-800">{s.label}</div>
                <div className="text-xs text-slate-500 font-semibold">{s.actor}</div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-5">
        {/* DB Tables */}
        <div className="card card-pad">
          <p className="section-label">Database Tables ({tables.length})</p>
          <div className="flex flex-wrap gap-2 mt-2">
            {tables.map(t => (
              <code key={t} className="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded font-mono">{t}</code>
            ))}
          </div>
        </div>

        {/* Roles */}
        <div className="card card-pad">
          <p className="section-label">User Roles & Permissions</p>
          <div className="space-y-3 mt-2">
            {roles.map(r => (
              <div key={r.name} className="flex gap-3">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 mt-1.5" style={{ background: r.color }} />
                <div>
                  <div className="text-sm font-bold text-slate-700">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.perms.join(' · ')}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Status Reference */}
      <div className="card card-pad">
        <p className="section-label">PR Status Flow</p>
        <div className="flex flex-wrap gap-2 items-center mt-2">
          {['draft','submitted','quotation_pending','quotation_received','approved','po_raised','delivered','closed','cancelled'].map((s, i, arr) => (
            <span key={s} className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">{s.replace(/_/g,' ')}</span>
              {i < arr.length - 1 && i !== arr.length - 2 && <span className="text-slate-300">→</span>}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
