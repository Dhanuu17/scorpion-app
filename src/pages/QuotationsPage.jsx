import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Badge, Modal, EmptyState, PageHeader, Field, Spinner } from '../components/UI'
import toast from 'react-hot-toast'
import { Plus, Eye, Check, X, Upload } from 'lucide-react'
import { format } from 'date-fns'

const RANK_COLORS = { L1: 'bg-green-500', L2: 'bg-amber-500', L3: 'bg-red-400' }

export default function QuotationsPage() {
  const { profile, isITHead, isHO } = useAuth()
  const [quotes, setQuotes] = useState([])
  const [prs, setPRs] = useState([])
  const [vendors, setVendors] = useState([])
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [compareGroup, setCompareGroup] = useState(null) // array of quotes for same PR
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    pr_id: '', vendor_id: '', quotation_date: '', vendor_ref_no: '',
    validity_date: '', delivery_days: '', payment_terms: '',
    items: [{ sku_id: '', quantity: 1, unit_price: '', gst_percent: 18 }]
  })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchQuotes(), fetchPRs(), fetchVendors(), fetchSkus()])
    setLoading(false)
  }

  async function fetchQuotes() {
    const { data } = await supabase.from('quotations')
      .select(`*, pr:purchase_requisitions(pr_number, branch:branches(branch_name)),
        vendor:vendor_master(vendor_name),
        approved_by_user:users!quotations_approved_by_fkey(full_name),
        quotation_line_items(*, sku:sku_master(sku_name, sku_code))`)
      .order('created_at', { ascending: false })
    setQuotes(data || [])
  }

  async function fetchPRs() {
    const { data } = await supabase.from('purchase_requisitions')
      .select('pr_id, pr_number, branch:branches(branch_name)')
      .in('status', ['submitted', 'quotation_pending', 'quotation_received'])
      .order('created_at', { ascending: false })
    setPRs(data || [])
  }

  async function fetchVendors() {
    const { data } = await supabase.from('vendor_master').select('vendor_id, vendor_name').eq('is_active', true).eq('is_blacklisted', false)
    setVendors(data || [])
  }

  async function fetchSkus() {
    const { data } = await supabase.from('sku_master').select('sku_id, sku_code, sku_name').eq('is_active', true)
    setSkus(data || [])
  }

  async function uploadQuotation() {
    const { pr_id, vendor_id, quotation_date, items } = form
    if (!pr_id || !vendor_id || !quotation_date) return toast.error('Please fill required fields')
    if (items.some(i => !i.sku_id || !i.unit_price)) return toast.error('All line items need SKU and price')
    setSaving(true)
    try {
      const total = items.reduce((s, i) => s + (parseFloat(i.unit_price) * parseFloat(i.quantity)), 0)
      const tax = items.reduce((s, i) => s + (parseFloat(i.unit_price) * parseFloat(i.quantity) * parseFloat(i.gst_percent) / 100), 0)
      const { data: qt, error } = await supabase.from('quotations').insert({
        pr_id, vendor_id, quotation_date,
        vendor_ref_no: form.vendor_ref_no || null,
        validity_date: form.validity_date || null,
        delivery_days: form.delivery_days ? parseInt(form.delivery_days) : null,
        payment_terms: form.payment_terms || null,
        total_amount: total, tax_amount: tax, grand_total: total + tax,
        uploaded_by: profile.id, status: 'pending_review',
      }).select().single()
      if (error) throw error

      const lines = items.map(i => ({
        quotation_id: qt.quotation_id,
        sku_id: i.sku_id, quantity: parseFloat(i.quantity),
        unit_price: parseFloat(i.unit_price),
        gst_percent: parseFloat(i.gst_percent),
        total_price: parseFloat(i.unit_price) * parseFloat(i.quantity),
      }))
      await supabase.from('quotation_line_items').insert(lines)
      await supabase.from('purchase_requisitions').update({ status: 'quotation_received' }).eq('pr_id', pr_id)
      await supabase.from('audit_log').insert({ entity_type: 'quotation', entity_id: qt.quotation_id, action: 'quotation_uploaded', performed_by: profile.id })

      toast.success('Quotation uploaded successfully!')
      setShowUpload(false)
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function approveQuote(qt) {
    if (!isITHead) return toast.error('Only IT Head can approve quotations')
    setSaving(true)
    try {
      await supabase.from('quotations').update({ status: 'approved', approved_by: profile.id, approval_date: new Date().toISOString() }).eq('quotation_id', qt.quotation_id)
      await supabase.from('purchase_requisitions').update({ status: 'approved' }).eq('pr_id', qt.pr_id)
      await supabase.from('audit_log').insert({ entity_type: 'quotation', entity_id: qt.quotation_id, action: 'quotation_approved', performed_by: profile.id })
      toast.success(`Quotation ${qt.quotation_number} approved! IT Staff can now generate PO.`)
      setCompareGroup(null); fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function rejectQuote(qt) {
    const reason = prompt('Enter rejection reason:')
    if (!reason) return
    await supabase.from('quotations').update({ status: 'rejected', rejection_reason: reason }).eq('quotation_id', qt.quotation_id)
    await supabase.from('audit_log').insert({ entity_type: 'quotation', entity_id: qt.quotation_id, action: 'quotation_rejected', performed_by: profile.id })
    toast.success('Quotation rejected')
    fetchAll()
  }

  // Group quotes by PR for comparison
  const groupedByPR = quotes.reduce((acc, q) => {
    if (!acc[q.pr_id]) acc[q.pr_id] = []
    acc[q.pr_id].push(q)
    return acc
  }, {})

  function addItem() { setForm(f => ({ ...f, items: [...f.items, { sku_id: '', quantity: 1, unit_price: '', gst_percent: 18 }] })) }
  function removeItem(idx) { setForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) })) }
  function updateItem(idx, k, v) { setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [k]: v } : it) })) }

  return (
    <div className="space-y-5">
      <PageHeader title="Quotations" subtitle="L1/L2/L3 vendor comparison & approval"
        action={isHO && <button className="btn btn-primary" onClick={() => setShowUpload(true)}><Upload size={15} /> Upload Quotation</button>} />

      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        Object.keys(groupedByPR).length === 0 ? (
          <EmptyState icon="📄" title="No quotations yet" subtitle="Upload quotations against open PRs to begin comparison" />
        ) : (
          <div className="space-y-4">
            {Object.entries(groupedByPR).map(([prId, prQuotes]) => {
              const pr = prQuotes[0].pr
              const sorted = [...prQuotes].sort((a, b) => a.grand_total - b.grand_total)
              return (
                <div key={prId} className="card card-pad">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-bold text-navy text-sm">{pr?.pr_number} — {pr?.branch?.branch_name}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{prQuotes.length} quotation{prQuotes.length > 1 ? 's' : ''} received</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge status={prQuotes.some(q => q.status === 'approved') ? 'approved' : 'quotation_received'} />
                      {prQuotes.length > 1 && (
                        <button className="btn btn-sm btn-outline" onClick={() => setCompareGroup(sorted)}>Compare All</button>
                      )}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Rank</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Quote No.</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500">Vendor</th>
                          <th className="px-3 py-2 text-right text-xs font-semibold text-slate-500">Grand Total</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Delivery</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Validity</th>
                          <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Status</th>
                          {isITHead && <th className="px-3 py-2 text-center text-xs font-semibold text-slate-500">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {sorted.map((qt, i) => (
                          <tr key={qt.quotation_id} className={`hover:bg-slate-50 ${i === 0 ? 'bg-green-50/50' : ''}`}>
                            <td className="px-3 py-2">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-bold ${RANK_COLORS[`L${i + 1}`] || 'bg-slate-400'}`}>
                                L{i + 1}
                              </span>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-blue-600">{qt.quotation_number}</td>
                            <td className="px-3 py-2 font-medium">{qt.vendor?.vendor_name}</td>
                            <td className={`px-3 py-2 text-right font-bold ${i === 0 ? 'text-green-700' : 'text-slate-700'}`}>
                              ₹{Number(qt.grand_total).toLocaleString('en-IN')}
                            </td>
                            <td className="px-3 py-2 text-center text-slate-500">{qt.delivery_days ? `${qt.delivery_days}d` : '—'}</td>
                            <td className="px-3 py-2 text-center text-slate-500">{qt.validity_date ? format(new Date(qt.validity_date), 'dd-MMM') : '—'}</td>
                            <td className="px-3 py-2 text-center"><Badge status={qt.status} /></td>
                            {isITHead && (
                              <td className="px-3 py-2 text-center">
                                {qt.status === 'pending_review' && (
                                  <div className="flex gap-1 justify-center">
                                    <button onClick={() => approveQuote(qt)} className="btn btn-sm btn-success" disabled={saving}><Check size={12} /></button>
                                    <button onClick={() => rejectQuote(qt)} className="btn btn-sm btn-danger"><X size={12} /></button>
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* Upload Modal */}
      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Quotation" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="PR Reference" required>
              <select className="form-select" value={form.pr_id} onChange={e => setForm({ ...form, pr_id: e.target.value })}>
                <option value="">Select PR...</option>
                {prs.map(p => <option key={p.pr_id} value={p.pr_id}>{p.pr_number} — {p.branch?.branch_name}</option>)}
              </select>
            </Field>
            <Field label="Vendor" required>
              <select className="form-select" value={form.vendor_id} onChange={e => setForm({ ...form, vendor_id: e.target.value })}>
                <option value="">Select vendor...</option>
                {vendors.map(v => <option key={v.vendor_id} value={v.vendor_id}>{v.vendor_name}</option>)}
              </select>
            </Field>
            <Field label="Quotation Date" required>
              <input className="form-input" type="date" value={form.quotation_date} onChange={e => setForm({ ...form, quotation_date: e.target.value })} />
            </Field>
            <Field label="Vendor Ref No.">
              <input className="form-input" placeholder="Vendor's quote ref" value={form.vendor_ref_no} onChange={e => setForm({ ...form, vendor_ref_no: e.target.value })} />
            </Field>
            <Field label="Valid Until">
              <input className="form-input" type="date" value={form.validity_date} onChange={e => setForm({ ...form, validity_date: e.target.value })} />
            </Field>
            <Field label="Delivery Days">
              <input className="form-input" type="number" placeholder="e.g. 7" value={form.delivery_days} onChange={e => setForm({ ...form, delivery_days: e.target.value })} />
            </Field>
            <Field label="Payment Terms">
              <input className="form-input" placeholder="e.g. Net 30, 50% Advance" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} />
            </Field>
          </div>

          <div>
            <div className="section-label">Line Items (with Pricing)</div>
            <table className="w-full text-sm">
              <thead><tr className="bg-slate-50">
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 w-52">SKU</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 w-20">Qty</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 w-32">Unit Price (₹)</th>
                <th className="px-2 py-2 text-left text-xs font-semibold text-slate-500 w-24">GST%</th>
                <th className="px-2 py-2 text-right text-xs font-semibold text-slate-500">Line Total</th>
                <th className="w-8"></th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {form.items.map((item, idx) => {
                  const lineTotal = (parseFloat(item.unit_price) || 0) * (parseFloat(item.quantity) || 0) * (1 + (parseFloat(item.gst_percent) || 0) / 100)
                  return (
                    <tr key={idx}>
                      <td className="px-2 py-1.5">
                        <select className="form-select text-xs" value={item.sku_id} onChange={e => updateItem(idx, 'sku_id', e.target.value)}>
                          <option value="">Select SKU...</option>
                          {skus.map(s => <option key={s.sku_id} value={s.sku_id}>{s.sku_code} · {s.sku_name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5"><input className="form-input w-16 text-xs" type="number" min="1" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} /></td>
                      <td className="px-2 py-1.5"><input className="form-input text-xs" type="number" value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', e.target.value)} /></td>
                      <td className="px-2 py-1.5"><input className="form-input text-xs" type="number" value={item.gst_percent} onChange={e => updateItem(idx, 'gst_percent', e.target.value)} /></td>
                      <td className="px-2 py-1.5 text-right font-semibold text-xs">₹{lineTotal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                      <td className="px-2 py-1.5">{form.items.length > 1 && <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-600"><X size={12} /></button>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button onClick={addItem} className="text-blue-600 text-xs font-semibold hover:underline mt-2"><Plus size={12} className="inline" /> Add Line</button>
          </div>

          <div className="flex justify-between items-center pt-3 border-t">
            <div className="text-sm font-bold text-slate-700">
              Grand Total: ₹{form.items.reduce((s, i) => s + ((parseFloat(i.unit_price) || 0) * (parseFloat(i.quantity) || 0) * (1 + (parseFloat(i.gst_percent) || 0) / 100)), 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}
            </div>
            <div className="flex gap-3">
              <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={uploadQuotation} disabled={saving}>{saving ? 'Uploading...' : 'Upload Quotation'}</button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Compare Modal */}
      {compareGroup && (
        <Modal open={!!compareGroup} onClose={() => setCompareGroup(null)} title="Quotation Comparison Matrix"
          subtitle={`PR: ${compareGroup[0]?.pr?.pr_number} — L1 is lowest price`} size="xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-3 py-2 text-left">Criteria</th>
                  {compareGroup.map((qt, i) => (
                    <th key={qt.quotation_id} className="px-3 py-2 text-center">
                      <span className={`inline-block w-6 h-6 rounded-full text-xs font-bold mr-1 ${RANK_COLORS[`L${i+1}`] || 'bg-slate-400'}`}
                        style={{ lineHeight: '24px' }}>L{i+1}</span>
                      {qt.vendor?.vendor_name?.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  ['Quote Ref', qt => <span className="font-mono text-xs">{qt.quotation_number}</span>],
                  ['Vendor', qt => qt.vendor?.vendor_name],
                  ['Amount (Excl. GST)', qt => `₹${Number(qt.total_amount).toLocaleString('en-IN')}`],
                  ['GST', qt => `₹${Number(qt.tax_amount).toLocaleString('en-IN')}`],
                  ['Grand Total', qt => <strong className={qt === compareGroup[0] ? 'text-green-700' : ''}>₹{Number(qt.grand_total).toLocaleString('en-IN')}</strong>],
                  ['Delivery Days', qt => qt.delivery_days ? `${qt.delivery_days} days` : '—'],
                  ['Payment Terms', qt => qt.payment_terms || '—'],
                  ['Valid Until', qt => qt.validity_date ? format(new Date(qt.validity_date), 'dd-MMM-yyyy') : '—'],
                  ['Status', qt => <Badge status={qt.status} />],
                ].map(([label, fn], i) => (
                  <tr key={i} className={i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-500 uppercase">{label}</td>
                    {compareGroup.map((qt, j) => (
                      <td key={qt.quotation_id} className={`px-3 py-2 text-center text-sm ${j === 0 ? 'bg-green-50/60' : ''}`}>{fn(qt)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {isITHead && (
            <div className="flex gap-3 mt-5 pt-4 border-t">
              <p className="text-sm text-slate-500 flex-1">Approve the L1 quotation (lowest cost) or any other based on your assessment.</p>
              {compareGroup.filter(q => q.status === 'pending_review').map(qt => (
                <button key={qt.quotation_id} className="btn btn-success btn-sm" onClick={() => approveQuote(qt)} disabled={saving}>
                  <Check size={13} /> Approve {qt.quotation_number}
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
