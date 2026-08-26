import { supabase } from '../lib/supabase'
import { useState, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function AdminSetupPage() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const claimAdmin = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (!session?.user) {
      setError('You must be signed in to claim admin access.')
      setLoading(false)
      return
    }

    const { data, error: fnError } = await supabase.rpc('bootstrap_first_admin')

    if (fnError) {
      setError('Could not set up admin access. ' + (fnError.message || 'Please try again.'))
      setLoading(false)
      return
    }

    if (data === true) {
      setSuccess('Admin access granted! Redirecting to admin panel...')
      setTimeout(() => navigate('/admin'), 1500)
    } else {
      setError('An admin account already exists. This bootstrap can only be used once.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full mx-auto">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3L3 9v12h6v-6h6v6h6V9z" />
              </svg>
            </div>
            <span className="text-xl font-bold text-neutral-900">Macbuilt</span>
          </Link>
          <h1 className="text-2xl font-bold text-neutral-900">Admin Setup</h1>
          <p className="text-neutral-600 mt-2">Claim the first admin account</p>
        </div>

        {error && <div className="alert-error mb-6">{error}</div>}
        {success && <div className="alert-success mb-6">{success}</div>}

        <div className="card p-6">
          <p className="text-sm text-neutral-600 mb-4">
            This page lets the first signed-in user claim the admin role. This can only be done once — after the first admin is created, this page will refuse further attempts.
          </p>
          <p className="text-sm text-neutral-600 mb-4">
            Current account: <span className="font-medium">{profile?.email || session?.user?.email}</span>
          </p>
          <form onSubmit={claimAdmin}>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Setting up...' : 'Claim Admin Access'}
            </button>
          </form>
        </div>

        <div className="mt-6 text-center">
          <Link to="/dashboard" className="text-sm text-primary-600 font-medium hover:text-primary-700">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}
