import { HashRouter, Routes, Route } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/Layout'
import { ProtectedRoute, AdminRoute } from './components/ProtectedRoute'
import { HomePage } from './pages/HomePage'
import { SignUpPage } from './pages/SignUpPage'
import { SignInPage } from './pages/SignInPage'
import { ForgotPasswordPage } from './pages/ForgotPasswordPage'
import { ResetPasswordPage } from './pages/ResetPasswordPage'
import { RecoveryRedirect } from './components/RecoveryRedirect'
import { ProfilePage } from './pages/ProfilePage'
import { DashboardPage } from './pages/DashboardPage'
import { AdminPage } from './pages/AdminPage'
import { AdminSetupPage } from './pages/AdminSetupPage'
import { JobsListPage } from './pages/JobsListPage'
import { JobDetailPage } from './pages/JobDetailPage'
import { JobCreatePage } from './pages/JobCreatePage'
import { JobEditPage } from './pages/JobEditPage'
import { MarketplacePage } from './pages/MarketplacePage'
import { QuotesPage } from './pages/QuotesPage'
import { ConversationsPage } from './pages/ConversationsPage'
import { ConversationPage } from './pages/ConversationPage'
import { TradieRoute } from './components/TradieRoute'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <RecoveryRedirect />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Layout><HomePage /></Layout>} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected routes */}
          <Route path="/dashboard" element={
            <ProtectedRoute><Layout><DashboardPage /></Layout></ProtectedRoute>
          } />
          <Route path="/profile" element={
            <ProtectedRoute><Layout><ProfilePage /></Layout></ProtectedRoute>
          } />
          <Route path="/jobs" element={
            <ProtectedRoute><Layout><JobsListPage /></Layout></ProtectedRoute>
          } />
          <Route path="/jobs/new" element={
            <ProtectedRoute><Layout><JobCreatePage /></Layout></ProtectedRoute>
          } />
          <Route path="/jobs/:id" element={
            <ProtectedRoute><Layout><JobDetailPage /></Layout></ProtectedRoute>
          } />
          <Route path="/jobs/:id/edit" element={
            <ProtectedRoute><Layout><JobEditPage /></Layout></ProtectedRoute>
          } />
          <Route path="/marketplace" element={
            <TradieRoute><Layout><MarketplacePage /></Layout></TradieRoute>
          } />
          <Route path="/quotes" element={
            <TradieRoute><Layout><QuotesPage /></Layout></TradieRoute>
          } />
          <Route path="/messages" element={
            <ProtectedRoute><Layout><ConversationsPage /></Layout></ProtectedRoute>
          } />
          <Route path="/messages/:conversationId" element={
            <ProtectedRoute><Layout><ConversationPage /></Layout></ProtectedRoute>
          } />

          {/* Admin routes */}
          <Route path="/admin" element={
            <AdminRoute><Layout><AdminPage /></Layout></AdminRoute>
          } />
          <Route path="/admin-setup" element={
            <ProtectedRoute><AdminSetupPage /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Layout><NotFoundPage /></Layout>} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
