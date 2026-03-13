import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Badge, Modal, EmptyState, PageHeader, Field, Spinner } from '../components/UI'
import toast from 'react-hot-toast'
import { Plus, Eye, X, Upload } from 'lucide-react'
import { format } from 'date-fns'

// ══════════════════════════════════════════════════
//  GRN PAGE
// ══════════════════════════════════════════════════
export function GRNPage() {
  const { profile, isHO } = useAuth()
  const [grns, setGRNs] = useState([])
  const [openPOs, setOpenPOs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ po_id: '', grn_date: new Date().toISOString().split('T')[0], delivery_challan_no: '', condition: 'good', remarks: '', items: [] })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchGRNs(), fetchOpenPOs()])
    setLoading(false)
  }

  async function fetchGRNs() {
    const { data } = await supabase.from('goods_receipt_notes')
      .select(`*, po:purchase_orders(po_number, pr:purchase_requisitions(pr_number, branch:branches(branch_name))),
        vendor:vendor_master(vendor_name),
        received_by_user:users!goods_receipt_notes_received_by_fkey(full_name),
        grn_line_items(*, sku:sku_master(sku_name, sku_code, is_asset))`)
      .order('created_at', { ascending: false })
    setGRNs(data || [])
  }

  async function fetchOpenPOs() {
    const { data } = await supabase.from('purchase_orders')
      .select(`*, vendor:vendor_master(vendor_name),
        po_line_items(*, sku:sku_master(sku_name, uom, is_asset))`)
      .in('status', ['sent', 'acknowledged', 'partially_delivered'])
    setOpenPOs(data || [])
  }

  function loadPOItems(poId) {
    const po = openPOs.find(p => p.po_id === parseInt(poId))
    if (!po) return
    setForm(f => ({
      ...f, po_id: poId,
      items: po.po_line_items.map(li => ({
        po_line_id: li.po_line_id, sku_id: li.sku_id,
        sku_name: li.sku?.sku_name, uom: li.sku?.uom, is_asset: li.sku?.is_asset,
        ordered_qty: li.ordered_qty, received_qty: li.ordered_qty,
        accepted_qty: li.ordered_qty, rejected_qty: 0, serial_numbers: '', remarks: '',
      }))
    }))
  }

  async function submitGRN() {
    if (!form.po_id) return toast.error('Select a PO')
    if (!form.grn_date) return toast.error('Enter GRN date')
    setSaving(true)
    try {
      const po = openPOs.find(p => p.po_id === parseInt(form.po_id))
      const { data: grn, error } = await supabase.from('goods_receipt_notes').insert({
        po_id: parseInt(form.po_id), vendor_id: po.vendor_id,
        grn_date: form.grn_date, delivery_challan_no: form.delivery_challan_no || null,
        received_by: profile.id, delivery_location: po.pr?.branch_id || null,
        condition: form.condition, remarks: form.remarks || null,
      }).select().single()
      if (error) throw error

      const lines = form.items.map(i => ({
        grn_id: grn.grn_id, po_line_id: i.po_line_id, sku_id: i.sku_id,
        received_qty: parseFloat(i.received_qty),
        accepted_qty: parseFloat(i.accepted_qty),
        rejected_qty: parseFloat(i.rejected_qty) || 0,
        serial_numbers: i.serial_numbers || null, remarks: i.remarks || null,
      }))
      await supabase.from('grn_line_items').insert(lines)

      // Update po_line_items received_qty
      for (const item of form.items) {
        await supabase.from('po_line_items').update({ received_qty: supabase.rpc('coalesce', { val: 0 }) })
      }

      // Check if fully delivered
      const allDelivered = form.items.every(i => parseFloat(i.accepted_qty) >= parseFloat(i.ordered_qty))
      await supabase.from('purchase_orders').update({ status: allDelivered ? 'delivered' : 'partially_delivered' }).eq('po_id', form.po_id)
      await supabase.from('audit_log').insert({ entity_type: 'grn', entity_id: grn.grn_id, action: 'grn_created', performed_by: profile.id })

      // Auto-create asset entries for asset SKUs
      const assetItems = form.items.filter(i => i.is_asset && i.serial_numbers)
      for (const ai of assetItems) {
        const serials = ai.serial_numbers.split(',').map(s => s.trim()).filter(Boolean)
        for (const serial of serials) {
          await supabase.from('asset_register').insert({
            sku_id: ai.sku_id, grn_id: grn.grn_id,
            serial_number: serial, status: 'in_store',
            branch_id: po.pr?.branch_id,
          })
        }
      }

      toast.success(`GRN ${grn.grn_number} created!`)
      setShowForm(false)
      setForm({ po_id: '', grn_date: new Date().toISOString().split('T')[0], delivery_challan_no: '', condition: 'good', remarks: '', items: [] })
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  function updateItem(idx, k, v) {
    setForm(f => ({ ...f, items: f.items.map((it, i) => i === idx ? { ...it, [k]: v } : it) }))
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Goods Receipt Notes (GRN)" subtitle="Record delivery against purchase orders"
        action={isHO && openPOs.length > 0 && <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={15} /> Create GRN</button>} />

      {openPOs.length > 0 && !showForm && (
        <div className="alert alert-info">
          <span>📦</span>
          <span><strong>{openPOs.length} PO{openPOs.length > 1 ? 's' : ''}</strong> awaiting delivery confirmation.</span>
          <button className="btn btn-sm btn-primary ml-2" onClick={() => setShowForm(true)}>Create GRN</button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        grns.length === 0 ? <EmptyState icon="✅" title="No GRNs yet" subtitle="Create GRN when goods are received" /> : (
          <div className="table-container">
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th className="table-th">GRN No.</th><th className="table-th">Date</th>
                  <th className="table-th">PO Ref</th><th className="table-th">Vendor</th>
                  <th className="table-th">Branch</th><th className="table-th">Condition</th>
                  <th className="table-th">Received By</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {grns.map(grn => (
                  <tr key={grn.grn_id} className="table-row">
                    <td className="table-td font-mono text-blue-600 text-xs font-semibold">{grn.grn_number}</td>
                    <td className="table-td text-slate-500 text-xs">{format(new Date(grn.grn_date), 'dd-MMM-yyyy')}</td>
                    <td className="table-td font-mono text-xs">{grn.po?.po_number}</td>
                    <td className="table-td">{grn.vendor?.vendor_name}</td>
                    <td className="table-td text-slate-500 text-xs">{grn.po?.pr?.branch?.branch_name}</td>
                    <td className="table-td"><Badge status={grn.condition} /></td>
                    <td className="table-td text-slate-500 text-xs">{grn.received_by_user?.full_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Create GRN" subtitle="Record goods/services received" size="xl">
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Field label="Purchase Order" required>
              <select className="form-select" value={form.po_id} onChange={e => loadPOItems(e.target.value)}>
                <option value="">Select PO...</option>
                {openPOs.map(po => <option key={po.po_id} value={po.po_id}>{po.po_number} — {po.vendor?.vendor_name}</option>)}
              </select>
            </Field>
            <Field label="GRN Date" required>
              <input className="form-input" type="date" value={form.grn_date} onChange={e => setForm({ ...form, grn_date: e.target.value })} />
            </Field>
            <Field label="Delivery Challan No.">
              <input className="form-input" placeholder="Vendor's challan ref" value={form.delivery_challan_no} onChange={e => setForm({ ...form, delivery_challan_no: e.target.value })} />
            </Field>
            <Field label="Overall Condition" required>
              <select className="form-select" value={form.condition} onChange={e => setForm({ ...form, condition: e.target.value })}>
                <option value="good">Good</option><option value="damaged">Damaged</option>
                <option value="partial">Partial</option><option value="rejected">Rejected</option>
              </select>
            </Field>
            <Field label="Remarks">
              <input className="form-input" placeholder="Any delivery notes..." value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} />
            </Field>
          </div>

          {form.items.length > 0 && (
            <div>
              <div className="section-label">Line Items — Enter Received Quantities</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-2 py-2 text-left font-semibold text-slate-500 w-40">Item</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-500">Ordered</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-500">Received</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-500">Accepted</th>
                      <th className="px-2 py-2 text-center font-semibold text-slate-500">Rejected</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Serial Numbers</th>
                      <th className="px-2 py-2 text-left font-semibold text-slate-500">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {form.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-2 py-2 font-medium">{item.sku_name}</td>
                        <td className="px-2 py-2 text-center text-slate-500">{item.ordered_qty} {item.uom}</td>
                        <td className="px-2 py-2 text-center"><input className="form-input w-16 text-center" type="number" min="0" value={item.received_qty} onChange={e => updateItem(idx, 'received_qty', e.target.value)} /></td>
                        <td className="px-2 py-2 text-center"><input className="form-input w-16 text-center" type="number" min="0" value={item.accepted_qty} onChange={e => updateItem(idx, 'accepted_qty', e.target.value)} /></td>
                        <td className="px-2 py-2 text-center"><input className="form-input w-16 text-center" type="number" min="0" value={item.rejected_qty} onChange={e => updateItem(idx, 'rejected_qty', e.target.value)} /></td>
                        <td className="px-2 py-2"><input className="form-input" placeholder={item.is_asset ? "S/N comma separated (required for assets)" : "—"} value={item.serial_numbers} onChange={e => updateItem(idx, 'serial_numbers', e.target.value)} /></td>
                        <td className="px-2 py-2"><input className="form-input" placeholder="Item notes" value={item.remarks} onChange={e => updateItem(idx, 'remarks', e.target.value)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-3 border-t">
            <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn btn-primary ml-auto" onClick={submitGRN} disabled={saving || !form.po_id}>
              {saving ? 'Creating...' : 'Create GRN →'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════
//  VENDOR INVOICES PAGE
// ══════════════════════════════════════════════════
export function InvoicesPage() {
  const { profile, isHO, isITHead, isFinanceHead } = useAuth()
  const [invoices, setInvoices] = useState([])
  const [deliveredPOs, setDeliveredPOs] = useState([])
  const [grns, setGRNs] = useState([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ po_id: '', grn_id: '', vendor_invoice_no: '', vendor_invoice_date: '', invoice_amount: '', tax_amount: '', remarks: '' })

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchInvoices(), fetchDeliveredPOs()])
    setLoading(false)
  }

  async function fetchInvoices() {
    const { data } = await supabase.from('vendor_invoices')
      .select(`*, po:purchase_orders(po_number), vendor:vendor_master(vendor_name),
        it_approver:users!vendor_invoices_it_head_approved_by_fkey(full_name),
        fin_approver:users!vendor_invoices_finance_approved_by_fkey(full_name)`)
      .order('uploaded_at', { ascending: false })
    setInvoices(data || [])
  }

  async function fetchDeliveredPOs() {
    const { data: pos } = await supabase.from('purchase_orders')
      .select('*, vendor:vendor_master(vendor_name)')
      .in('status', ['delivered', 'partially_delivered'])
    setDeliveredPOs(pos || [])
    const { data: grnData } = await supabase.from('goods_receipt_notes')
      .select('grn_id, grn_number, po_id')
    setGRNs(grnData || [])
  }

  async function uploadInvoice() {
    const { po_id, grn_id, vendor_invoice_no, vendor_invoice_date, invoice_amount, tax_amount } = form
    if (!po_id || !vendor_invoice_no || !vendor_invoice_date || !invoice_amount) return toast.error('Please fill required fields')
    setSaving(true)
    try {
      const po = deliveredPOs.find(p => p.po_id === parseInt(po_id))
      const grand_total = parseFloat(invoice_amount) + (parseFloat(tax_amount) || 0)
      const { data: inv, error } = await supabase.from('vendor_invoices').insert({
        po_id: parseInt(po_id), grn_id: grn_id ? parseInt(grn_id) : null,
        vendor_id: po.vendor_id, vendor_invoice_no, vendor_invoice_date,
        invoice_amount: parseFloat(invoice_amount),
        tax_amount: parseFloat(tax_amount) || 0,
        grand_total, uploaded_by: profile.id, uploaded_at: new Date().toISOString(),
        it_head_status: 'pending', finance_status: 'not_sent',
      }).select().single()
      if (error) throw error
      await supabase.from('audit_log').insert({ entity_type: 'invoice', entity_id: inv.invoice_id, action: 'invoice_uploaded', performed_by: profile.id })
      toast.success(`Invoice ${inv.invoice_ref} uploaded! Awaiting IT Head approval.`)
      setShowUpload(false)
      setForm({ po_id: '', grn_id: '', vendor_invoice_no: '', vendor_invoice_date: '', invoice_amount: '', tax_amount: '', remarks: '' })
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function itApprove(inv) {
    await supabase.from('vendor_invoices').update({
      it_head_status: 'approved', it_head_approved_by: profile.id,
      it_head_approval_date: new Date().toISOString(), finance_status: 'pending',
    }).eq('invoice_id', inv.invoice_id)
    await supabase.from('audit_log').insert({ entity_type: 'invoice', entity_id: inv.invoice_id, action: 'invoice_approved_it_head', performed_by: profile.id })
    toast.success('Invoice approved and forwarded to Finance Head')
    fetchInvoices()
  }

  async function itReject(inv) {
    const reason = prompt('Rejection reason:')
    if (!reason) return
    await supabase.from('vendor_invoices').update({ it_head_status: 'rejected', it_head_remarks: reason }).eq('invoice_id', inv.invoice_id)
    toast.success('Invoice rejected')
    fetchInvoices()
  }

  async function finApprove(inv) {
    const payRef = prompt('Enter payment reference (UTR/Cheque No.):')
    if (!payRef) return
    await supabase.from('vendor_invoices').update({
      finance_status: 'paid', finance_approved_by: profile.id,
      finance_approval_date: new Date().toISOString(),
      payment_date: new Date().toISOString().split('T')[0],
      payment_reference: payRef, payment_mode: 'neft',
    }).eq('invoice_id', inv.invoice_id)
    await supabase.from('audit_log').insert({ entity_type: 'invoice', entity_id: inv.invoice_id, action: 'payment_approved', performed_by: profile.id })
    toast.success('Payment approved! Transaction recorded.')
    fetchInvoices()
  }

  const filteredGRNs = grns.filter(g => g.po_id === parseInt(form.po_id))

  return (
    <div className="space-y-5">
      <PageHeader title="Vendor Invoices" subtitle="Three-way match: PO ↔ GRN ↔ Invoice"
        action={isHO && <button className="btn btn-primary" onClick={() => setShowUpload(true)}><Upload size={15} /> Upload Invoice</button>} />

      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        invoices.length === 0 ? <EmptyState icon="💰" title="No invoices yet" subtitle="Upload vendor bill after GRN is created" /> : (
          <div className="table-container">
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th className="table-th">Invoice Ref</th><th className="table-th">Vendor Inv. No</th>
                  <th className="table-th">PO Ref</th><th className="table-th">Vendor</th>
                  <th className="table-th">Amount</th><th className="table-th">Uploaded</th>
                  <th className="table-th">IT Head</th><th className="table-th">Finance</th>
                  <th className="table-th">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {invoices.map(inv => (
                  <tr key={inv.invoice_id} className="table-row">
                    <td className="table-td font-mono text-blue-600 text-xs font-semibold">{inv.invoice_ref}</td>
                    <td className="table-td text-slate-500 text-xs">{inv.vendor_invoice_no}</td>
                    <td className="table-td font-mono text-xs">{inv.po?.po_number}</td>
                    <td className="table-td">{inv.vendor?.vendor_name}</td>
                    <td className="table-td font-bold">₹{Number(inv.grand_total).toLocaleString('en-IN')}</td>
                    <td className="table-td text-slate-500 text-xs">{format(new Date(inv.uploaded_at), 'dd-MMM-yyyy')}</td>
                    <td className="table-td"><Badge status={inv.it_head_status} /></td>
                    <td className="table-td"><Badge status={inv.finance_status} /></td>
                    <td className="table-td">
                      <div className="flex gap-1">
                        {isITHead && inv.it_head_status === 'pending' && (
                          <>
                            <button className="btn btn-sm btn-success" onClick={() => itApprove(inv)}>✓ Approve</button>
                            <button className="btn btn-sm btn-danger" onClick={() => itReject(inv)}>✗</button>
                          </>
                        )}
                        {isFinanceHead && inv.finance_status === 'pending' && (
                          <button className="btn btn-sm btn-primary" onClick={() => finApprove(inv)}>💳 Pay</button>
                        )}
                        {inv.finance_status === 'paid' && (
                          <span className="text-xs text-green-600 font-semibold">✓ {inv.payment_reference}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={showUpload} onClose={() => setShowUpload(false)} title="Upload Vendor Invoice" size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Purchase Order" required>
              <select className="form-select" value={form.po_id} onChange={e => setForm({ ...form, po_id: e.target.value, grn_id: '' })}>
                <option value="">Select PO...</option>
                {deliveredPOs.map(po => <option key={po.po_id} value={po.po_id}>{po.po_number} — {po.vendor?.vendor_name}</option>)}
              </select>
            </Field>
            <Field label="GRN Reference">
              <select className="form-select" value={form.grn_id} onChange={e => setForm({ ...form, grn_id: e.target.value })}>
                <option value="">Select GRN...</option>
                {filteredGRNs.map(g => <option key={g.grn_id} value={g.grn_id}>{g.grn_number}</option>)}
              </select>
            </Field>
            <Field label="Vendor Invoice No." required>
              <input className="form-input" placeholder="Invoice number from vendor" value={form.vendor_invoice_no} onChange={e => setForm({ ...form, vendor_invoice_no: e.target.value })} />
            </Field>
            <Field label="Invoice Date" required>
              <input className="form-input" type="date" value={form.vendor_invoice_date} onChange={e => setForm({ ...form, vendor_invoice_date: e.target.value })} />
            </Field>
            <Field label="Invoice Amount (Excl. Tax) ₹" required>
              <input className="form-input" type="number" placeholder="0.00" value={form.invoice_amount} onChange={e => setForm({ ...form, invoice_amount: e.target.value })} />
            </Field>
            <Field label="Tax / GST Amount ₹">
              <input className="form-input" type="number" placeholder="0.00" value={form.tax_amount} onChange={e => setForm({ ...form, tax_amount: e.target.value })} />
            </Field>
          </div>
          {form.invoice_amount && (
            <div className="bg-slate-50 p-3 rounded-lg text-sm">
              <span className="text-slate-500">Grand Total: </span>
              <strong>₹{(parseFloat(form.invoice_amount || 0) + parseFloat(form.tax_amount || 0)).toLocaleString('en-IN')}</strong>
            </div>
          )}
          <div className="flex gap-3 pt-3 border-t">
            <button className="btn btn-ghost" onClick={() => setShowUpload(false)}>Cancel</button>
            <button className="btn btn-primary ml-auto" onClick={uploadInvoice} disabled={saving}>{saving ? 'Uploading...' : 'Upload Invoice'}</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
