import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)

    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/#/reset-password`,
    })

    // Always show the same message — don't reveal whether the email exists
    setSent(true)
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
          <h1 className="text-2xl font-bold text-neutral-900">Reset your password</h1>
          <p className="text-neutral-600 mt-2">We'll send a reset link to your email</p>
        </div>

        {sent ? (
          <div className="card p-6">
            <div className="alert-success mb-4">
              If that email is registered, we've sent a password reset link. Check your inbox and follow the link to set a new password.
            </div>
            <Link to="/signin" className="btn-secondary w-full">
              Back to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card p-6 space-y-4">
            <div>
              <label className="label">Email</label>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-neutral-600 mt-6">
          Remembered your password?{' '}
          <Link to="/signin" className="text-primary-600 font-medium hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
