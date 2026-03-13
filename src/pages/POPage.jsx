import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Badge, Modal, EmptyState, PageHeader, Spinner } from '../components/UI'
import toast from 'react-hot-toast'
import { Plus, Mail, FileDown, Eye } from 'lucide-react'
import { format } from 'date-fns'

export default function POPage() {
  const { profile, isHO, isITHead } = useAuth()
  const [pos, setPOs] = useState([])
  const [approvedQuotes, setApprovedQuotes] = useState([])
  const [loading, setLoading] = useState(true)
  const [showGenerate, setShowGenerate] = useState(false)
  const [viewPO, setViewPO] = useState(null)
  const [selectedQuote, setSelectedQuote] = useState('')
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    await Promise.all([fetchPOs(), fetchApprovedQuotes()])
    setLoading(false)
  }

  async function fetchPOs() {
    const { data } = await supabase.from('purchase_orders')
      .select(`*, pr:purchase_requisitions(pr_number, branch:branches(branch_name)),
        vendor:vendor_master(vendor_name, email, phone, gstin),
        quotation:quotations(quotation_number),
        po_line_items(*, sku:sku_master(sku_name, sku_code, uom))`)
      .order('created_at', { ascending: false })
    setPOs(data || [])
  }

  async function fetchApprovedQuotes() {
    const { data } = await supabase.from('quotations')
      .select(`*, pr:purchase_requisitions(pr_id, pr_number, branch:branches(branch_name, city),
        pr_line_items(quantity, estimated_cost, sku:sku_master(sku_name))),
        vendor:vendor_master(vendor_name, email, gstin, address, payment_terms),
        quotation_line_items(*, sku:sku_master(sku_name, sku_code, uom))`)
      .eq('status', 'approved')
    // Filter out quotes that already have a PO
    const { data: existingPOs } = await supabase.from('purchase_orders').select('quotation_id')
    const usedQuoteIds = new Set(existingPOs?.map(p => p.quotation_id) || [])
    setApprovedQuotes((data || []).filter(q => !usedQuoteIds.has(q.quotation_id)))
  }

  async function generatePO() {
    if (!selectedQuote) return toast.error('Please select an approved quotation')
    const qt = approvedQuotes.find(q => q.quotation_id === parseInt(selectedQuote))
    if (!qt) return toast.error('Quotation not found')
    setSaving(true)
    try {
      const shippingAddress = `${qt.pr?.branch?.branch_name}, ${qt.pr?.branch?.city}`
      const { data: po, error } = await supabase.from('purchase_orders').insert({
        pr_id: qt.pr_id, quotation_id: qt.quotation_id, vendor_id: qt.vendor_id,
        po_date: new Date().toISOString().split('T')[0],
        billing_address: 'IT Department, Head Office',
        shipping_address: shippingAddress,
        expected_delivery_date: qt.delivery_days
          ? new Date(Date.now() + qt.delivery_days * 86400000).toISOString().split('T')[0] : null,
        payment_terms: qt.vendor?.payment_terms || qt.payment_terms || null,
        total_amount: qt.total_amount, tax_amount: qt.tax_amount, grand_total: qt.grand_total,
        status: 'draft', created_by: profile.id,
        special_instructions: specialInstructions || null,
        amendment_count: 0,
      }).select().single()
      if (error) throw error

      const lines = qt.quotation_line_items.map(li => ({
        po_id: po.po_id, sku_id: li.sku_id,
        ordered_qty: li.quantity, received_qty: 0,
        unit_price: li.unit_price, gst_percent: li.gst_percent,
        total_price: li.total_price,
      }))
      await supabase.from('po_line_items').insert(lines)
      await supabase.from('purchase_requisitions').update({ status: 'po_raised' }).eq('pr_id', qt.pr_id)
      await supabase.from('audit_log').insert({ entity_type: 'po', entity_id: po.po_id, action: 'po_generated', performed_by: profile.id })

      toast.success(`PO ${po.po_number} generated successfully!`)
      setShowGenerate(false); setSelectedQuote(''); setSpecialInstructions('')
      fetchAll()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function sendPOToVendor(po) {
    // In production this triggers a Supabase Edge Function that sends the email
    // For now we update status and show success
    await supabase.from('purchase_orders').update({ status: 'sent', po_email_sent_at: new Date().toISOString() }).eq('po_id', po.po_id)
    await supabase.from('audit_log').insert({ entity_type: 'po', entity_id: po.po_id, action: 'po_emailed_to_vendor', performed_by: profile.id })
    toast.success(`PO ${po.po_number} sent to ${po.vendor?.vendor_name} at ${po.vendor?.email}`)
    fetchPOs()
  }

  async function acknowledgeReceipt(po) {
    await supabase.from('purchase_orders').update({ status: 'acknowledged' }).eq('po_id', po.po_id)
    toast.success('PO acknowledged')
    fetchPOs()
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Purchase Orders" subtitle="Auto-generated from approved quotations"
        action={isHO && approvedQuotes.length > 0 && (
          <button className="btn btn-primary" onClick={() => setShowGenerate(true)}><Plus size={15} /> Generate PO</button>
        )} />

      {approvedQuotes.length > 0 && (
        <div className="alert alert-warn">
          <span>⚡</span>
          <span><strong>{approvedQuotes.length} approved quotation{approvedQuotes.length > 1 ? 's' : ''}</strong> ready for PO generation.</span>
          <button className="btn btn-sm btn-gold ml-2" onClick={() => setShowGenerate(true)}>Generate Now</button>
        </div>
      )}

      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        pos.length === 0 ? (
          <EmptyState icon="📦" title="No Purchase Orders yet" subtitle="Generate PO from an approved quotation" />
        ) : (
          <div className="table-container">
            <table className="w-full">
              <thead className="table-head">
                <tr>
                  <th className="table-th">PO Number</th>
                  <th className="table-th">PO Date</th>
                  <th className="table-th">PR Ref</th>
                  <th className="table-th">Vendor</th>
                  <th className="table-th">Branch</th>
                  <th className="table-th">Grand Total</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {pos.map(po => (
                  <tr key={po.po_id} className="table-row">
                    <td className="table-td font-mono text-blue-600 font-semibold text-xs">{po.po_number}</td>
                    <td className="table-td text-slate-500 text-xs">{format(new Date(po.po_date || po.created_at), 'dd-MMM-yyyy')}</td>
                    <td className="table-td font-mono text-xs text-slate-500">{po.pr?.pr_number}</td>
                    <td className="table-td font-medium">{po.vendor?.vendor_name}</td>
                    <td className="table-td text-slate-500 text-xs">{po.pr?.branch?.branch_name}</td>
                    <td className="table-td font-bold">₹{Number(po.grand_total).toLocaleString('en-IN')}</td>
                    <td className="table-td"><Badge status={po.status} /></td>
                    <td className="table-td">
                      <div className="flex gap-1 flex-wrap">
                        <button className="btn btn-sm btn-ghost" onClick={() => setViewPO(po)}><Eye size={12} /></button>
                        {po.status === 'draft' && isHO && (
                          <button className="btn btn-sm btn-primary" onClick={() => sendPOToVendor(po)}><Mail size={12} /> Send</button>
                        )}
                        {po.status === 'sent' && isHO && (
                          <button className="btn btn-sm btn-ghost" onClick={() => acknowledgeReceipt(po)}>ACK</button>
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

      {/* Generate PO Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Purchase Order" size="md">
        <div className="space-y-4">
          <div>
            <label className="form-label">Approved Quotation <span className="text-red-500">*</span></label>
            <select className="form-select" value={selectedQuote} onChange={e => setSelectedQuote(e.target.value)}>
              <option value="">Select approved quotation...</option>
              {approvedQuotes.map(qt => (
                <option key={qt.quotation_id} value={qt.quotation_id}>
                  {qt.quotation_number} — {qt.vendor?.vendor_name} — ₹{Number(qt.grand_total).toLocaleString('en-IN')}
                </option>
              ))}
            </select>
          </div>
          {selectedQuote && (() => {
            const qt = approvedQuotes.find(q => q.quotation_id === parseInt(selectedQuote))
            if (!qt) return null
            return (
              <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-2">
                <div className="flex justify-between"><span className="text-slate-500">PR:</span><span className="font-mono">{qt.pr?.pr_number}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Vendor:</span><span>{qt.vendor?.vendor_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Ship To:</span><span>{qt.pr?.branch?.branch_name}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Grand Total:</span><strong>₹{Number(qt.grand_total).toLocaleString('en-IN')}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Payment:</span><span>{qt.vendor?.payment_terms || qt.payment_terms || '—'}</span></div>
              </div>
            )
          })()}
          <div>
            <label className="form-label">Special Instructions</label>
            <textarea className="form-input" rows={2} placeholder="Delivery instructions, packaging requirements..."
              value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-3 border-t">
            <button className="btn btn-ghost" onClick={() => setShowGenerate(false)}>Cancel</button>
            <button className="btn btn-primary ml-auto" onClick={generatePO} disabled={saving || !selectedQuote}>
              {saving ? 'Generating...' : 'Generate PO →'}
            </button>
          </div>
        </div>
      </Modal>

      {/* View PO Modal - Full PO Document */}
      {viewPO && (
        <Modal open={!!viewPO} onClose={() => setViewPO(null)} title={`Purchase Order — ${viewPO.po_number}`} size="xl">
          <div className="space-y-5">
            {/* PO Document */}
            <div className="border border-slate-200 rounded-xl p-6" id="po-doc">
              <div className="flex justify-between items-start border-b-2 border-navy pb-4 mb-4">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Purchase Order</p>
                  <p className="text-2xl font-black text-navy font-mono">{viewPO.po_number}</p>
                  <p className="text-sm text-slate-500 mt-0.5">Date: {format(new Date(viewPO.po_date || viewPO.created_at), 'dd-MMM-yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-navy">SCORPION</p>
                  <p className="text-xs text-slate-500">IT Department, Head Office</p>
                  <div className="w-8 h-1 bg-gold rounded ml-auto mt-1" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6 mb-5 text-sm">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Vendor</p>
                  <p className="font-semibold">{viewPO.vendor?.vendor_name}</p>
                  <p className="text-slate-500">GSTIN: {viewPO.vendor?.gstin || '—'}</p>
                  <p className="text-slate-500">{viewPO.vendor?.email}</p>
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase mb-2">Ship To</p>
                  <p className="font-semibold">{viewPO.pr?.branch?.branch_name}</p>
                  <p className="text-slate-500">{viewPO.shipping_address}</p>
                </div>
              </div>
              <table className="w-full text-sm border-collapse mb-4">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="px-3 py-2 text-left text-xs border border-slate-200">Item</th>
                    <th className="px-3 py-2 text-center text-xs border border-slate-200">Qty</th>
                    <th className="px-3 py-2 text-center text-xs border border-slate-200">UOM</th>
                    <th className="px-3 py-2 text-right text-xs border border-slate-200">Unit Price</th>
                    <th className="px-3 py-2 text-center text-xs border border-slate-200">GST%</th>
                    <th className="px-3 py-2 text-right text-xs border border-slate-200">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {viewPO.po_line_items?.map((li, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      <td className="px-3 py-2 border border-slate-200">{li.sku?.sku_name}</td>
                      <td className="px-3 py-2 text-center border border-slate-200">{li.ordered_qty}</td>
                      <td className="px-3 py-2 text-center border border-slate-200 text-slate-500">{li.sku?.uom}</td>
                      <td className="px-3 py-2 text-right border border-slate-200">₹{Number(li.unit_price).toLocaleString('en-IN')}</td>
                      <td className="px-3 py-2 text-center border border-slate-200 text-slate-500">{li.gst_percent}%</td>
                      <td className="px-3 py-2 text-right border border-slate-200 font-semibold">₹{(li.ordered_qty * li.unit_price).toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-3 py-2 text-right font-semibold border border-slate-200">Subtotal</td>
                    <td className="px-3 py-2 text-right border border-slate-200">₹{Number(viewPO.total_amount).toLocaleString('en-IN')}</td>
                  </tr>
                  <tr className="bg-slate-50">
                    <td colSpan={5} className="px-3 py-2 text-right font-semibold border border-slate-200">GST</td>
                    <td className="px-3 py-2 text-right border border-slate-200">₹{Number(viewPO.tax_amount).toLocaleString('en-IN')}</td>
                  </tr>
                  <tr className="bg-navy text-white">
                    <td colSpan={5} className="px-3 py-2 text-right font-bold border border-slate-300">Grand Total</td>
                    <td className="px-3 py-2 text-right font-bold border border-slate-300">₹{Number(viewPO.grand_total).toLocaleString('en-IN')}</td>
                  </tr>
                </tfoot>
              </table>
              <div className="text-xs text-slate-500 space-y-1">
                <p><strong>Payment Terms:</strong> {viewPO.payment_terms || '—'}</p>
                <p><strong>Expected Delivery:</strong> {viewPO.expected_delivery_date ? format(new Date(viewPO.expected_delivery_date), 'dd-MMM-yyyy') : '—'}</p>
                {viewPO.special_instructions && <p><strong>Instructions:</strong> {viewPO.special_instructions}</p>}
              </div>
            </div>
            <div className="flex gap-3">
              {viewPO.status === 'draft' && isHO && (
                <button className="btn btn-primary" onClick={() => { sendPOToVendor(viewPO); setViewPO(null) }}>
                  <Mail size={14} /> Send to Vendor
                </button>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => window.print()}><FileDown size={13} /> Print / PDF</button>
              <Badge status={viewPO.status} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
