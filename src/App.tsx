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

          {/* Admin routes */}
          <Route path="/admin" element={
            <AdminRoute><Layout><AdminPage /></Layout></AdminRoute>
          } />
          <Route path="/admin-setup" element={
            <ProtectedRoute><AdminSetupPage /></ProtectedRoute>
          } />

          {/* Fallback */}
          <Route path="*" element={<Layout><HomePage /></Layout>} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
