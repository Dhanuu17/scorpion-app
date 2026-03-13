import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import {
  LayoutDashboard, ClipboardList, FileText, Package, CheckSquare,
  Receipt, Building2, Grid3X3, Monitor, BarChart3, LogOut, Settings, Workflow
} from 'lucide-react'

const NAV = [
  { section: 'Main', items: [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['all'] },
  ]},
  { section: 'Procurement', items: [
    { to: '/pr', icon: ClipboardList, label: 'Purchase Requests', roles: ['all'] },
    { to: '/quotations', icon: FileText, label: 'Quotations', roles: ['it_staff', 'it_head'] },
    { to: '/po', icon: Package, label: 'Purchase Orders', roles: ['it_staff', 'it_head'] },
    { to: '/grn', icon: CheckSquare, label: 'GRN', roles: ['it_staff', 'it_head'] },
    { to: '/invoices', icon: Receipt, label: 'Vendor Invoices', roles: ['it_staff', 'it_head', 'finance_head'] },
  ]},
  { section: 'Masters', items: [
    { to: '/vendors', icon: Building2, label: 'Vendor Master', roles: ['it_staff', 'it_head'] },
    { to: '/skus', icon: Grid3X3, label: 'SKU Master', roles: ['it_staff', 'it_head'] },
    { to: '/assets', icon: Monitor, label: 'Asset Register', roles: ['it_staff', 'it_head'] },
  ]},
  { section: 'Insights', items: [
    { to: '/reports', icon: BarChart3, label: 'Reports', roles: ['it_head', 'finance_head'] },
    { to: '/workflow', icon: Workflow, label: 'Workflow Map', roles: ['all'] },
  ]},
]

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()

  function canSee(roles) {
    if (roles.includes('all')) return true
    return roles.includes(profile?.role)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const initials = profile?.full_name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'

  return (
    <aside className="w-56 bg-navy flex flex-col flex-shrink-0 h-screen">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-white/10">
        <div className="text-white font-black text-lg tracking-wider">⬡ SCORPION</div>
        <div className="text-blue-300 text-[10px] font-semibold mt-0.5 uppercase tracking-widest">IT Purchase Module</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 overflow-y-auto">
        {NAV.map(section => (
          <div key={section.section}>
            <p className="px-4 pt-4 pb-1 text-[10px] font-bold text-white/30 uppercase tracking-widest">{section.section}</p>
            {section.items.filter(item => canSee(item.roles)).map(item => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 px-4 py-2.5 text-[13px] transition-all cursor-pointer border-r-2
                  ${isActive ? 'bg-white/15 text-white font-semibold border-gold' : 'text-blue-200 hover:text-white hover:bg-white/8 border-transparent'}`
                }>
                <item.icon size={15} className="flex-shrink-0" />
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 rounded-lg bg-gold flex items-center justify-center text-navy text-xs font-black flex-shrink-0">{initials}</div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate">{profile?.full_name || 'User'}</p>
            <p className="text-blue-300 text-[10px] capitalize">{profile?.role?.replace(/_/g, ' ')}</p>
          </div>
        </div>
        <button onClick={handleSignOut} className="flex items-center gap-2 text-blue-300 hover:text-white text-xs transition-colors w-full">
          <LogOut size={13} /> Sign out
        </button>
      </div>
    </aside>
  )
}
