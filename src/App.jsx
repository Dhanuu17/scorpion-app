import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { FullPageSpinner } from './components/UI'
import Sidebar from './components/Sidebar'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PRPage from './pages/PRPage'
import QuotationsPage from './pages/QuotationsPage'
import POPage from './pages/POPage'
import { GRNPage, InvoicesPage } from './pages/GRNInvoicePage'
import { VendorMasterPage, SKUMasterPage, AssetRegisterPage } from './pages/MasterPages'
import WorkflowPage from './pages/WorkflowPage'

function ProtectedRoute({ children, roles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  if (roles && profile && !roles.includes(profile.role)) return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="text-5xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-slate-800">Access Restricted</h2>
        <p className="text-sm text-slate-500 mt-1">You don't have permission to view this page.</p>
      </div>
    </div>
  )
  return children
}

function AppLayout({ children }) {
  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto p-6">{children}</div>
      </main>
    </div>
  )
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <FullPageSpinner />

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage />} />
      <Route path="/" element={<ProtectedRoute><AppLayout><DashboardPage /></AppLayout></ProtectedRoute>} />
      <Route path="/pr" element={<ProtectedRoute><AppLayout><PRPage /></AppLayout></ProtectedRoute>} />
      <Route path="/quotations" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><QuotationsPage /></AppLayout></ProtectedRoute>} />
      <Route path="/po" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><POPage /></AppLayout></ProtectedRoute>} />
      <Route path="/grn" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><GRNPage /></AppLayout></ProtectedRoute>} />
      <Route path="/invoices" element={<ProtectedRoute roles={['it_staff','it_head','finance_head']}><AppLayout><InvoicesPage /></AppLayout></ProtectedRoute>} />
      <Route path="/vendors" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><VendorMasterPage /></AppLayout></ProtectedRoute>} />
      <Route path="/skus" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><SKUMasterPage /></AppLayout></ProtectedRoute>} />
      <Route path="/assets" element={<ProtectedRoute roles={['it_staff','it_head']}><AppLayout><AssetRegisterPage /></AppLayout></ProtectedRoute>} />
      <Route path="/workflow" element={<ProtectedRoute><AppLayout><WorkflowPage /></AppLayout></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
        <Toaster position="bottom-right" toastOptions={{
          style: { fontFamily: 'DM Sans, sans-serif', fontSize: '13px' },
          success: { iconTheme: { primary: '#16a34a', secondary: '#fff' } },
        }} />
      </AuthProvider>
    </BrowserRouter>
  )
}
