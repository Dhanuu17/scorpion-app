import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Badge, Modal, EmptyState, PageHeader, Field, Spinner } from '../components/UI'
import toast from 'react-hot-toast'
import { Plus, Search, Edit2 } from 'lucide-react'

// ══════════════════════════════════════════════════
//  VENDOR MASTER
// ══════════════════════════════════════════════════
export function VendorMasterPage() {
  const { profile, isITHead } = useAuth()
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const EMPTY = { vendor_name: '', contact_person: '', email: '', phone: '', address: '', gstin: '', pan: '', payment_terms: '', bank_account_no: '', bank_ifsc: '', vendor_category: 'assets' }
  const [form, setForm] = useState(EMPTY)

  useEffect(() => { fetchVendors() }, [])

  async function fetchVendors() {
    setLoading(true)
    const { data } = await supabase.from('vendor_master').select('*').order('vendor_name')
    setVendors(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.vendor_name || !form.email) return toast.error('Name and email are required')
    setSaving(true)
    try {
      if (editing) {
        await supabase.from('vendor_master').update({ ...form }).eq('vendor_id', editing.vendor_id)
        toast.success('Vendor updated')
      } else {
        await supabase.from('vendor_master').insert({ ...form, created_by: profile.id, is_active: true, is_blacklisted: false })
        toast.success('Vendor added')
      }
      setShowForm(false); setEditing(null); setForm(EMPTY); fetchVendors()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function toggleBlacklist(vendor) {
    await supabase.from('vendor_master').update({ is_blacklisted: !vendor.is_blacklisted }).eq('vendor_id', vendor.vendor_id)
    toast.success(vendor.is_blacklisted ? 'Vendor reactivated' : 'Vendor blacklisted')
    fetchVendors()
  }

  const filtered = vendors.filter(v => !search || v.vendor_name.toLowerCase().includes(search.toLowerCase()) || v.email?.toLowerCase().includes(search.toLowerCase()))

  function openEdit(v) { setEditing(v); setForm({ ...v }); setShowForm(true) }
  function openAdd() { setEditing(null); setForm(EMPTY); setShowForm(true) }

  return (
    <div className="space-y-5">
      <PageHeader title="Vendor Master" subtitle="Approved vendor registry"
        action={<button className="btn btn-primary" onClick={openAdd}><Plus size={15} /> Add Vendor</button>} />
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="form-input pl-9" placeholder="Search vendors..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        <div className="table-container">
          <table className="w-full">
            <thead className="table-head"><tr>
              <th className="table-th">Code</th><th className="table-th">Vendor Name</th>
              <th className="table-th">Category</th><th className="table-th">Contact</th>
              <th className="table-th">GSTIN</th><th className="table-th">Payment Terms</th>
              <th className="table-th">Status</th><th className="table-th">Actions</th>
            </tr></thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filtered.map(v => (
                <tr key={v.vendor_id} className="table-row">
                  <td className="table-td font-mono text-xs text-blue-600">{v.vendor_code}</td>
                  <td className="table-td font-semibold">{v.vendor_name}</td>
                  <td className="table-td"><Badge status={v.vendor_category} /></td>
                  <td className="table-td text-xs text-slate-500">{v.contact_person}<br />{v.phone}</td>
                  <td className="table-td font-mono text-xs text-slate-500">{v.gstin || '—'}</td>
                  <td className="table-td text-xs text-slate-500">{v.payment_terms || '—'}</td>
                  <td className="table-td">
                    <Badge status={v.is_blacklisted ? 'blacklisted' : v.is_active ? 'active' : 'inactive'} />
                  </td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button className="btn btn-sm btn-ghost" onClick={() => openEdit(v)}><Edit2 size={12} /></button>
                      {isITHead && <button className={`btn btn-sm ${v.is_blacklisted ? 'btn-success' : 'btn-danger'}`} onClick={() => toggleBlacklist(v)}>
                        {v.is_blacklisted ? 'Unblock' : 'Blacklist'}
                      </button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={showForm} onClose={() => { setShowForm(false); setEditing(null) }} title={editing ? 'Edit Vendor' : 'Add Vendor'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Vendor Name" required><input className="form-input" value={form.vendor_name} onChange={e => setForm({ ...form, vendor_name: e.target.value })} /></Field>
          <Field label="Category" required>
            <select className="form-select" value={form.vendor_category} onChange={e => setForm({ ...form, vendor_category: e.target.value })}>
              <option value="assets">IT Assets</option><option value="consumables">Consumables</option>
              <option value="repairs">Repairs</option><option value="all">All Categories</option>
            </select>
          </Field>
          <Field label="Contact Person"><input className="form-input" value={form.contact_person} onChange={e => setForm({ ...form, contact_person: e.target.value })} /></Field>
          <Field label="Email" required><input className="form-input" type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input className="form-input" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Payment Terms"><input className="form-input" placeholder="e.g. Net 30, 50% Advance" value={form.payment_terms} onChange={e => setForm({ ...form, payment_terms: e.target.value })} /></Field>
          <Field label="GSTIN"><input className="form-input" placeholder="27ABCDE1234F1Z5" value={form.gstin} onChange={e => setForm({ ...form, gstin: e.target.value })} /></Field>
          <Field label="PAN"><input className="form-input" value={form.pan} onChange={e => setForm({ ...form, pan: e.target.value })} /></Field>
          <Field label="Bank Account No."><input className="form-input" value={form.bank_account_no} onChange={e => setForm({ ...form, bank_account_no: e.target.value })} /></Field>
          <Field label="Bank IFSC"><input className="form-input" value={form.bank_ifsc} onChange={e => setForm({ ...form, bank_ifsc: e.target.value })} /></Field>
          <div className="col-span-2"><Field label="Address"><textarea className="form-input" rows={2} value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></Field></div>
        </div>
        <div className="flex gap-3 pt-4 border-t mt-4">
          <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={save} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update Vendor' : 'Add Vendor'}</button>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════
//  SKU MASTER
// ══════════════════════════════════════════════════
export function SKUMasterPage() {
  const { profile } = useAuth()
  const [skus, setSkus] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState(null)
  const [saving, setSaving] = useState(false)
  const EMPTY = { sku_name: '', description: '', category: 'asset', sub_category: '', uom: 'Nos', hsn_sac_code: '', is_asset: false }
  const [form, setForm] = useState(EMPTY)

  useEffect(() => { fetchSKUs() }, [])

  async function fetchSKUs() {
    setLoading(true)
    const { data } = await supabase.from('sku_master').select('*').order('sku_name')
    setSkus(data || [])
    setLoading(false)
  }

  async function save() {
    if (!form.sku_name || !form.uom) return toast.error('Name and UOM required')
    setSaving(true)
    try {
      if (editing) {
        await supabase.from('sku_master').update({ ...form }).eq('sku_id', editing.sku_id)
        toast.success('SKU updated')
      } else {
        await supabase.from('sku_master').insert({ ...form, is_active: true })
        toast.success('SKU added')
      }
      setShowForm(false); setEditing(null); setForm(EMPTY); fetchSKUs()
    } catch (err) { toast.error(err.message) }
    finally { setSaving(false) }
  }

  async function toggleActive(sku) {
    await supabase.from('sku_master').update({ is_active: !sku.is_active }).eq('sku_id', sku.sku_id)
    fetchSKUs()
  }

  const filtered = skus.filter(s => !search || s.sku_name.toLowerCase().includes(search.toLowerCase()) || s.sku_code?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <PageHeader title="SKU Master" subtitle="Standardized IT item catalogue"
        action={<button className="btn btn-primary" onClick={() => { setEditing(null); setForm(EMPTY); setShowForm(true) }}><Plus size={15} /> Add SKU</button>} />
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="form-input pl-9" placeholder="Search SKUs..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        <div className="table-container">
          <table className="w-full">
            <thead className="table-head"><tr>
              <th className="table-th">SKU Code</th><th className="table-th">Item Name</th>
              <th className="table-th">Category</th><th className="table-th">Sub-Category</th>
              <th className="table-th">UOM</th><th className="table-th">HSN/SAC</th>
              <th className="table-th">Is Asset</th><th className="table-th">Status</th>
              <th className="table-th">Actions</th>
            </tr></thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {filtered.map(s => (
                <tr key={s.sku_id} className="table-row">
                  <td className="table-td font-mono text-blue-600 text-xs">{s.sku_code}</td>
                  <td className="table-td font-medium">{s.sku_name}</td>
                  <td className="table-td"><Badge status={s.category} /></td>
                  <td className="table-td text-slate-500 text-xs">{s.sub_category || '—'}</td>
                  <td className="table-td text-slate-500">{s.uom}</td>
                  <td className="table-td font-mono text-xs text-slate-500">{s.hsn_sac_code || '—'}</td>
                  <td className="table-td"><Badge status={s.is_asset ? 'active' : 'inactive'} label={s.is_asset ? 'Yes' : 'No'} /></td>
                  <td className="table-td"><Badge status={s.is_active ? 'active' : 'inactive'} /></td>
                  <td className="table-td">
                    <div className="flex gap-1">
                      <button className="btn btn-sm btn-ghost" onClick={() => { setEditing(s); setForm({ ...s }); setShowForm(true) }}><Edit2 size={12} /></button>
                      <button className={`btn btn-sm ${s.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit SKU' : 'Add SKU'} size="md">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2"><Field label="Item Name" required><input className="form-input" value={form.sku_name} onChange={e => setForm({ ...form, sku_name: e.target.value })} /></Field></div>
          <Field label="Category" required>
            <select className="form-select" value={form.category} onChange={e => setForm({ ...form, category: e.target.value, is_asset: e.target.value === 'asset' })}>
              <option value="asset">IT Asset</option><option value="consumable">Consumable</option><option value="repair_service">Repair Service</option>
            </select>
          </Field>
          <Field label="Sub-Category"><input className="form-input" placeholder="e.g. Laptop, Printer, Networking" value={form.sub_category} onChange={e => setForm({ ...form, sub_category: e.target.value })} /></Field>
          <Field label="UOM" required>
            <select className="form-select" value={form.uom} onChange={e => setForm({ ...form, uom: e.target.value })}>
              <option>Nos</option><option>Box</option><option>Hours</option><option>Set</option><option>Kg</option><option>Ltrs</option>
            </select>
          </Field>
          <Field label="HSN / SAC Code"><input className="form-input" placeholder="8471, 998719..." value={form.hsn_sac_code} onChange={e => setForm({ ...form, hsn_sac_code: e.target.value })} /></Field>
          <div className="col-span-2 flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
            <input type="checkbox" id="is_asset" checked={form.is_asset} onChange={e => setForm({ ...form, is_asset: e.target.checked })} className="w-4 h-4 accent-navy" />
            <label htmlFor="is_asset" className="text-sm font-medium text-slate-700 cursor-pointer">
              Is IT Asset <span className="text-slate-400 font-normal">(enables serial number capture and asset register on GRN)</span>
            </label>
          </div>
          <div className="col-span-2"><Field label="Description"><textarea className="form-input" rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        </div>
        <div className="flex gap-3 pt-4 border-t mt-4">
          <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
          <button className="btn btn-primary ml-auto" onClick={save} disabled={saving}>{saving ? 'Saving...' : editing ? 'Update SKU' : 'Add SKU'}</button>
        </div>
      </Modal>
    </div>
  )
}

// ══════════════════════════════════════════════════
//  ASSET REGISTER
// ══════════════════════════════════════════════════
export function AssetRegisterPage() {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => { fetchAssets() }, [])

  async function fetchAssets() {
    setLoading(true)
    const { data } = await supabase.from('asset_register')
      .select(`*, sku:sku_master(sku_name, sku_code),
        assigned_user:users!asset_register_assigned_to_fkey(full_name),
        branch:branches(branch_name)`)
      .order('created_at', { ascending: false })
    setAssets(data || [])
    setLoading(false)
  }

  const filtered = assets.filter(a => !search ||
    a.asset_tag?.toLowerCase().includes(search.toLowerCase()) ||
    a.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
    a.sku?.sku_name?.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-5">
      <PageHeader title="Asset Register" subtitle="IT asset lifecycle tracking — auto-populated on GRN" />
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input className="form-input pl-9" placeholder="Search by tag, serial, item..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {loading ? <div className="flex justify-center py-12"><Spinner size={32} /></div> : (
        filtered.length === 0 ? (
          <EmptyState icon="🖥️" title="No assets tracked yet" subtitle="Assets auto-register when GRN is created for asset-type SKUs with serial numbers" />
        ) : (
          <div className="table-container">
            <table className="w-full">
              <thead className="table-head"><tr>
                <th className="table-th">Asset Tag</th><th className="table-th">Item</th>
                <th className="table-th">Serial No.</th><th className="table-th">Assigned To</th>
                <th className="table-th">Branch</th><th className="table-th">Warranty</th>
                <th className="table-th">Status</th>
              </tr></thead>
              <tbody className="bg-white divide-y divide-slate-100">
                {filtered.map(a => (
                  <tr key={a.asset_id} className="table-row">
                    <td className="table-td font-mono text-navy font-bold text-xs">{a.asset_tag}</td>
                    <td className="table-td"><div className="font-medium text-sm">{a.sku?.sku_name}</div><div className="text-xs text-slate-400">{a.sku?.sku_code}</div></td>
                    <td className="table-td font-mono text-xs text-slate-500">{a.serial_number || '—'}</td>
                    <td className="table-td text-slate-600">{a.assigned_user?.full_name || '—'}</td>
                    <td className="table-td text-slate-500 text-xs">{a.branch?.branch_name}</td>
                    <td className="table-td text-xs text-slate-500">{a.warranty_expiry ? new Date(a.warranty_expiry).toLocaleDateString('en-IN') : '—'}</td>
                    <td className="table-td"><Badge status={a.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )
}
