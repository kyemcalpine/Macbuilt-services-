import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function SignInPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError('Invalid email or password. Please check your details and try again.')
      setLoading(false)
      return
    }

    navigate('/dashboard')
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
          <h1 className="text-2xl font-bold text-neutral-900">Welcome back</h1>
          <p className="text-neutral-600 mt-2">Sign in to your Macbuilt account</p>
        </div>

        {error && <div className="alert-error mb-6">{error}</div>}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="Your password" />
          </div>
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm text-primary-600 font-medium hover:text-primary-700">
              Forgot password?
            </Link>
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-600 mt-6">
          Don't have an account?{' '}
          <Link to="/signup" className="text-primary-600 font-medium hover:text-primary-700">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
