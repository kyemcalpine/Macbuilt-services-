import { Navigate } from 'react-router-dom'
import { ReactNode } from 'react'
import { useAuth } from '../context/AuthContext'

export function TradieRoute({ children }: { children: ReactNode }) {
  const { profile, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!profile || profile.role !== 'tradie') {
    return <Navigate to="/dashboard" replace />
  }

  if (profile.verification_status !== 'approved') {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
