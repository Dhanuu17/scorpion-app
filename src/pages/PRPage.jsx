import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Badge, Modal, EmptyState, PageHeader, Field, StatusTimeline, Spinner } from '../components/UI'
import toast from 'react-hot-toast'
import { Plus, Search, Eye, X } from 'lucide-react'
import { format } from 'date-fns'

const PR_STEPS = [
  { label: 'PR Submitted', actor: 'Branch User' },
  { label: 'Quotation Sourcing', actor: 'IT Staff' },
  { label: 'Quote Approval', actor: 'IT Head' },
  { label: 'PO Issued', actor: 'IT Staff' },
  { label: 'Delivered', actor: 'Vendor' },
  { label: 'Invoiced & Paid', actor: 'Finance' },
]

const STATUS_STEP = {
  draft: 0, submitted: 0, quotation_pending: 1, quotation_received: 1,
  approved: 2, po_raised: 3, delivered: 4, closed: 5, cancelled: 0,
}

const EMPTY_FORM = {
  branch_id: '', pr_type: 'asset', priority: 'medium', justification: '',
  ticket_ref: '', required_by_date: '', items: [{ sku_id: '', quantity: 1, estimated_cost: '', notes: '' }]
}

export default function PRPage() {
  const { profile, isBranchUser, isHO, isITHead } = useAuth()
  const [prs, setPRs] = useState([])
  const [skus, setSkus] = useState([])
  const [branches, setBranches] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [viewPR, setViewPR] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [profile])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchPRs(), fetchSkus(), fetchBranches()])
    setLoading(false)
  }

  async function fetchPRs() {
    let q = supabase.from('purchase_requisitions')
      .select(`*, branch:branches(branch_name), raised_by_user:users!purchase_requisitions_raised_by_fkey(full_name),
        pr_line_items(*, sku:sku_master(sku_code, sku_name, uom))`)
      .order('created_at', { ascending: false })
    if (isBranchUser) q = q.eq('raised_by', profile.id)
    const { data, error } = await q
    if (error) toast.error('Failed to load PRs')
    else setPRs(data || [])
  }

  async function fetchSkus() {
    const { data } = await supabase.from('sku_master').select('*').eq('is_active', true).order('sku_name')
    setSkus(data || [])
  }

  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('*').eq('is_active', true).order('branch_name')
    setBranches(data || [])
  }

  async function submitPR(isDraft = false) {
    const { branch_id, pr_type, priority, justification, items } = form
    if (!branch_id) return toast.error('Please select a branch')
    if (!justification.trim()) return toast.error('Justification is required')
    if (items.some(i => !i.sku_id)) return toast.error('Please select SKU for all line items')
    if (items.some(i => !i.quantity || i.quantity < 1)) return toast.error('All quantities must be ≥ 1')

    setSaving(true)
    try {
      const prData = {
        branch_id: branch_id || (isBranchUser ? profile.branch_id : null),
        raised_by: profile.id,
        pr_type, priority, justification,
        ticket_ref: form.ticket_ref || null,
        required_by_date: form.required_by_date || null,
        status: isDraft ? 'draft' : 'submitted',
      }
      const { data: pr, error: prErr } = await supabase.from('purchase_requisitions').insert(prData).select().single()
      if (prErr) throw prErr

      const lineItems = items.map(i => ({
        pr_id: pr.pr_id,
        sku_id: i.sku_id,
        quantity: parseFloat(i.quantity),
        estimated_cost: i.estimated_cost ? parseFloat(i.estimated_cost) : null,
        notes: i.notes || null,
      }))
      const { error: lineErr } = await supabase.from('pr_line_items').insert(lineItems)
      if (lineErr) throw lineErr

      // Audit log
      await supabase.from('audit_log').insert({
        entity_type: 'pr', entity_id: pr.pr_id,
        action: isDraft ? 'draft_saved' : 'pr_submitted',
        new_value: isDraft ? 'draft' : 'submitted',
        performed_by: profile.id,
      })

      toast.success(isDraft ? 'PR saved as draft' : `PR ${pr.pr_number} submitted successfully!`)
      setShowForm(false)
      setForm(EMPTY_FORM)
      fetchPRs()
    } catch (err) {
      toast.error(err.message || 'Failed to save PR')
    } finally {
      setSaving(false)
    }
  }

  function addItem() {
    setForm(f => ({ ...f, items: [...f.items, { sku_id: '', quantity: 1, estimated_cost: '', notes: '' }] }))
  }

  function removeItem(idx) {
    setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }))
  }

  function updateItem(idx, field, value) {
    setForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [field]: value } : item) }))
  }

  const filtered = prs.filter(pr => {
    const s = search.toLowerCase()
    const matchSearch = !s || pr.pr_number?.toLowerCase().includes(s) || pr.branch?.branch_name?.toLowerCase().includes(s)
    const matchStatus = !filterStatus || pr.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-5">
      <PageHeader title="Purchase Requisitions" subtitle="Manage all IT procurement requests"
        action={<button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setShowForm(true) }}><Plus size={15} /> New PR</button>} />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="form-input pl-9" placeholder="Search by PR number or branch..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="form-select w-48" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          {['draft','submitted','quotation_pending','quotation_received','approved','po_raised','delivered','closed','cancelled'].map(s =>
            <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size={32} /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon="📋" title="No purchase requisitions found"
          subtitle="Click 'New PR' to raise your first purchase request"
          action={<button className="btn btn-primary btn-sm" onClick={() => setShowForm(true)}>+ New PR</button>} />
      ) : (
        <div className="table-container">
          <table className="w-full">
            <thead className="table-head">
              <tr>
                <th className="table-th">PR Number</th>
                <th className="table-th">Date</th>
                <th className="table-th">Branch</th>
                <th className="table-th">Type</th>
                <th className="table-th">Items</th>
                <th className="table-th">Priority</th>
                <th className="table-th">Status</th>
                <th className="table-th">Action</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filtered.map(pr => (
                <tr key={pr.pr_id} className="table-row">
                  <td className="table-td font-mono text-blue-600 font-semibold text-xs">{pr.pr_number}</td>
                  <td className="table-td text-slate-500 text-xs">{format(new Date(pr.pr_date || pr.created_at), 'dd-MMM-yyyy')}</td>
                  <td className="table-td">{pr.branch?.branch_name || '—'}</td>
                  <td className="table-td"><Badge status={pr.pr_type} /></td>
                  <td className="table-td text-slate-500 text-xs">
                    {pr.pr_line_items?.slice(0, 2).map(li => `${li.sku?.sku_name} ×${li.quantity}`).join(', ')}
                    {pr.pr_line_items?.length > 2 && ` +${pr.pr_line_items.length - 2} more`}
                  </td>
                  <td className="table-td"><Badge status={pr.priority} /></td>
                  <td className="table-td"><Badge status={pr.status} /></td>
                  <td className="table-td">
                    <button className="btn btn-sm btn-ghost" onClick={() => setViewPR(pr)}>
                      <Eye size={13} /> View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* New PR Modal */}
      <Modal open={showForm} onClose={() => setShowForm(false)} title="New Purchase Requisition"
        subtitle="Select items from SKU master — no free text allowed" size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Branch" required>
              <select className="form-select" value={form.branch_id} onChange={e => setForm({ ...form, branch_id: e.target.value })}>
                <option value="">Select branch...</option>
                {branches.map(b => <option key={b.branch_id} value={b.branch_id}>{b.branch_name}</option>)}
              </select>
            </Field>
            <Field label="PR Type" required>
              <select className="form-select" value={form.pr_type} onChange={e => setForm({ ...form, pr_type: e.target.value })}>
                <option value="asset">IT Asset</option>
                <option value="consumable">IT Consumable</option>
                <option value="repair">IT Asset Repair</option>
              </select>
            </Field>
            <Field label="Priority" required>
              <select className="form-select" value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Helpdesk Ticket Ref">
              <input className="form-input" placeholder="HD-2024-1234" value={form.ticket_ref}
                onChange={e => setForm({ ...form, ticket_ref: e.target.value })} />
            </Field>
            <Field label="Required By Date">
              <input className="form-input" type="date" value={form.required_by_date}
                onChange={e => setForm({ ...form, required_by_date: e.target.value })} />
            </Field>
          </div>

          <Field label="Business Justification" required>
            <textarea className="form-input" rows={3}
              placeholder="Explain why this procurement is required and business impact if not fulfilled..."
              value={form.justification} onChange={e => setForm({ ...form, justification: e.target.value })} />
          </Field>

          {/* Line Items */}
          <div>
            <div className="section-label">Line Items</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-3 py-2 text-left text-xs font-semibold w-64">SKU</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold w-20">Qty</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold w-28">Est. Cost (₹)</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold">Notes / Asset Tag</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {form.items.map((item, idx) => (
                    <tr key={idx} className="border-t border-slate-100">
                      <td className="px-3 py-2">
                        <select className="form-select text-xs" value={item.sku_id}
                          onChange={e => updateItem(idx, 'sku_id', e.target.value)}>
                          <option value="">Select SKU...</option>
                          {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_code} · {s.sku_name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input className="form-input w-16 text-xs" type="number" min="1" value={item.quantity}
                          onChange={e => updateItem(idx, 'quantity', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="form-input text-xs" type="number" placeholder="0.00" value={item.estimated_cost}
                          onChange={e => updateItem(idx, 'estimated_cost', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        <input className="form-input text-xs" placeholder="Notes or asset tag for repair..."
                          value={item.notes} onChange={e => updateItem(idx, 'notes', e.target.value)} />
                      </td>
                      <td className="px-3 py-2">
                        {form.items.length > 1 && (
                          <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600 p-1"><X size={13} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button onClick={addItem} className="text-blue-600 text-xs font-semibold hover:underline mt-2 flex items-center gap-1">
              <Plus size={12} /> Add Line Item
            </button>
          </div>

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-ghost" onClick={() => submitPR(true)} disabled={saving}>Save as Draft</button>
            <button className="btn btn-primary ml-auto" onClick={() => submitPR(false)} disabled={saving}>
              {saving ? 'Submitting...' : 'Submit PR →'}
            </button>
          </div>
        </div>
      </Modal>

      {/* View PR Modal */}
      {viewPR && (
        <Modal open={!!viewPR} onClose={() => setViewPR(null)} title={viewPR.pr_number}
          subtitle={`${viewPR.branch?.branch_name} · Raised by ${viewPR.raised_by_user?.full_name}`} size="lg">
          <div className="space-y-5">
            <StatusTimeline steps={PR_STEPS} currentStep={STATUS_STEP[viewPR.status] ?? 0} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ['Type', <Badge status={viewPR.pr_type} />],
                ['Priority', <Badge status={viewPR.priority} />],
                ['Status', <Badge status={viewPR.status} />],
                ['Ticket Ref', viewPR.ticket_ref || '—'],
                ['Required By', viewPR.required_by_date ? format(new Date(viewPR.required_by_date), 'dd-MMM-yyyy') : '—'],
                ['Raised On', format(new Date(viewPR.created_at), 'dd-MMM-yyyy')],
              ].map(([label, val], i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-slate-500 w-28 flex-shrink-0">{label}</span>
                  <span className="font-medium">{val}</span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase mb-1">Justification</p>
              <p className="text-sm text-slate-700 bg-slate-50 p-3 rounded-lg">{viewPR.justification}</p>
            </div>
            <div>
              <p className="section-label">Line Items</p>
              <div className="table-container">
                <table className="w-full">
                  <thead className="table-head">
                    <tr>
                      <th className="table-th">SKU Code</th>
                      <th className="table-th">Item Name</th>
                      <th className="table-th">Qty</th>
                      <th className="table-th">UOM</th>
                      <th className="table-th">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {viewPR.pr_line_items?.map((li, i) => (
                      <tr key={i} className="table-row">
                        <td className="table-td font-mono text-xs text-blue-600">{li.sku?.sku_code}</td>
                        <td className="table-td">{li.sku?.sku_name}</td>
                        <td className="table-td">{li.quantity}</td>
                        <td className="table-td text-slate-500">{li.sku?.uom}</td>
                        <td className="table-td">{li.estimated_cost ? `₹${Number(li.estimated_cost).toLocaleString('en-IN')}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {viewPR.remarks && (
              <div className="alert alert-warn">
                <span>📝</span> <span><strong>IT Head Remarks:</strong> {viewPR.remarks}</span>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
