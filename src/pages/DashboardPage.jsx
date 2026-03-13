import { useEffect, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { StatCard, Badge, Spinner } from '../components/UI'
import { useNavigate } from 'react-router-dom'
import { format } from 'date-fns'

export default function DashboardPage() {
  const { profile, isITHead, isFinanceHead, isBranchUser } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState(null)
  const [activity, setActivity] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [profile])

  async function fetchAll() {
    if (!profile) return
    setLoading(true)
    await Promise.all([fetchStats(), fetchActivity(), fetchPending()])
    setLoading(false)
  }

  async function fetchStats() {
    const [prs, quotes, pos, invoices] = await Promise.all([
      supabase.from('purchase_requisitions').select('status', { count: 'exact' }).neq('status', 'closed').neq('status', 'cancelled'),
      supabase.from('quotations').select('status', { count: 'exact' }).eq('status', 'pending_review'),
      supabase.from('purchase_orders').select('status, grand_total').in('status', ['sent', 'acknowledged', 'partially_delivered']),
      supabase.from('vendor_invoices').select('it_head_status, finance_status, grand_total').eq('it_head_status', 'pending'),
    ])
    const totalPOValue = pos.data?.reduce((s, r) => s + Number(r.grand_total), 0) || 0
    const pendingBillValue = invoices.data?.reduce((s, r) => s + Number(r.grand_total), 0) || 0
    setStats({
      openPRs: prs.count || 0,
      pendingQuotes: quotes.count || 0,
      activePOs: pos.data?.length || 0,
      poValue: totalPOValue,
      pendingBills: invoices.data?.length || 0,
      billValue: pendingBillValue,
    })
  }

  async function fetchActivity() {
    const { data } = await supabase.from('audit_log')
      .select('*, performed_by_user:users!audit_log_performed_by_fkey(full_name)')
      .order('timestamp', { ascending: false }).limit(8)
    setActivity(data || [])
  }

  async function fetchPending() {
    const queries = []
    if (isITHead) {
      queries.push(
        supabase.from('quotations').select('quotation_id, quotation_number, pr:purchase_requisitions(pr_number, branch:branches(branch_name))').eq('status', 'pending_review').limit(3),
        supabase.from('vendor_invoices').select('invoice_id, invoice_ref, vendor:vendor_master(vendor_name), grand_total').eq('it_head_status', 'pending').limit(3),
      )
    }
    if (isFinanceHead) {
      queries.push(
        supabase.from('vendor_invoices').select('invoice_id, invoice_ref, vendor:vendor_master(vendor_name), grand_total').eq('finance_status', 'pending').limit(3),
      )
    }
    const results = await Promise.all(queries)
    const items = results.flatMap(r => r.data || [])
    setPending(items)
  }

  if (loading) return <div className="flex justify-center items-center h-64"><Spinner size={32} /></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="page-title">Good {getGreeting()}, {profile?.full_name?.split(' ')[0]}!</h1>
        <p className="page-sub">Here's what needs your attention today.</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Open PRs" value={stats?.openPRs ?? '—'} sub="Active requisitions" color="blue" icon="📋" />
        <StatCard label="Quotes Pending Review" value={stats?.pendingQuotes ?? '—'} sub="Awaiting IT Head" color="gold" icon="📄" />
        <StatCard label="Active POs" value={stats?.activePOs ?? '—'} sub={`₹${formatAmount(stats?.poValue)} value`} color="purple" icon="📦" />
        <StatCard label="Bills Pending Approval" value={stats?.pendingBills ?? '—'} sub={`₹${formatAmount(stats?.billValue)} pending`} color="red" icon="💰" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Actions */}
        {(isITHead || isFinanceHead) && (
          <div className="card card-pad">
            <p className="section-label">⚡ Your Pending Actions</p>
            {pending.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">🎉 No pending actions!</p>
            ) : (
              <div className="space-y-2">
                {pending.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                    <div className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-700">
                        {item.quotation_number ? `Review quotation ${item.quotation_number}` : `Approve invoice ${item.invoice_ref}`}
                      </p>
                      <p className="text-xs text-slate-500">
                        {item.vendor?.vendor_name || item.pr?.pr_number || ''} 
                        {item.grand_total ? ` · ₹${formatAmount(item.grand_total)}` : ''}
                      </p>
                    </div>
                    <button className="btn btn-sm btn-primary flex-shrink-0"
                      onClick={() => navigate(item.quotation_number ? '/quotations' : '/invoices')}>
                      Review
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Recent Activity */}
        <div className="card card-pad">
          <p className="section-label">🕐 Recent Activity</p>
          {activity.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No activity yet</p>
          ) : (
            <div className="space-y-1">
              {activity.map((log, i) => (
                <div key={i} className="flex gap-3 py-2 border-b border-slate-50 last:border-0">
                  <div className="text-[10px] text-slate-400 whitespace-nowrap pt-0.5 w-28 flex-shrink-0">
                    {format(new Date(log.timestamp), 'dd MMM, h:mm a')}
                  </div>
                  <div className="text-sm text-slate-600 leading-snug">
                    <span className="font-semibold text-slate-700">{log.performed_by_user?.full_name || 'System'}</span>{' '}
                    {formatLogAction(log)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card card-pad">
        <p className="section-label">🚀 Quick Actions</p>
        <div className="flex flex-wrap gap-3">
          <button onClick={() => navigate('/pr')} className="btn btn-primary btn-sm">+ New Purchase Request</button>
          {!isBranchUser && <button onClick={() => navigate('/quotations')} className="btn btn-outline btn-sm">Upload Quotation</button>}
          {!isBranchUser && <button onClick={() => navigate('/grn')} className="btn btn-outline btn-sm">Create GRN</button>}
          {!isBranchUser && <button onClick={() => navigate('/invoices')} className="btn btn-outline btn-sm">Upload Invoice</button>}
        </div>
      </div>
    </div>
  )
}

function getGreeting() {
  const h = new Date().getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

function formatAmount(v) {
  if (!v) return '0'
  if (v >= 100000) return `${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `${(v / 1000).toFixed(1)}K`
  return v.toString()
}

function formatLogAction(log) {
  return `${log.action?.replace(/_/g, ' ')} ${log.entity_type || ''} #${log.entity_id || ''}`
}
