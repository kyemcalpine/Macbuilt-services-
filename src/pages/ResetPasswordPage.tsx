import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const { loading } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('Could not update your password. Please try again.')
      setSubmitting(false)
      return
    }

    setSuccess('Password updated successfully!')
    setTimeout(() => navigate('/signin'), 2000)
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
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
          <h1 className="text-2xl font-bold text-neutral-900">Set a new password</h1>
        </div>

        {error && <div className="alert-error mb-6">{error}</div>}
        {success && <div className="alert-success mb-6">{success}</div>}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">New Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="label">Confirm Password</label>
            <input type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input" placeholder="Re-enter password" />
          </div>
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
