import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AUSTRALIAN_STATES, TRADE_CATEGORIES, type UserRole } from '../types'

export function SignUpPage() {
  const navigate = useNavigate()
  const [role, setRole] = useState<UserRole>('customer')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [state, setState] = useState('')
  const [suburb, setSuburb] = useState('')
  const [postcode, setPostcode] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [abn, setAbn] = useState('')
  const [tradeCategory, setTradeCategory] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.')
      setLoading(false)
      return
    }

    const metadata: Record<string, unknown> = {
      role,
      full_name: fullName,
      phone,
    }

    if (role === 'customer') {
      metadata.state = state
      metadata.suburb = suburb
      metadata.postcode = postcode
    } else {
      metadata.business_name = businessName
      metadata.abn = abn
      metadata.trade_category = tradeCategory
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: metadata },
    })

    if (signUpError) {
      setError('Could not create your account. Please check your details and try again.')
      setLoading(false)
      return
    }

    if (data.user) {
      if (role === 'tradie') {
        setSuccess('Account created! Your tradie profile is pending admin approval. You can browse jobs but cannot submit quotes until approved.')
      } else {
        setSuccess('Account created successfully!')
      }
      setTimeout(() => navigate('/dashboard'), 2000)
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
          <h1 className="text-2xl font-bold text-neutral-900">Create your account</h1>
          <p className="text-neutral-600 mt-2">Join Macbuilt Services in under a minute</p>
        </div>

        {/* Role selector */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setRole('customer')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              role === 'customer'
                ? 'border-primary-600 bg-primary-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="font-semibold text-neutral-900">Customer</span>
            </div>
            <p className="text-xs text-neutral-500">Post jobs and hire tradies</p>
          </button>
          <button
            type="button"
            onClick={() => setRole('tradie')}
            className={`p-4 rounded-xl border-2 transition-all text-left ${
              role === 'tradie'
                ? 'border-primary-600 bg-primary-50'
                : 'border-neutral-200 bg-white hover:border-neutral-300'
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.648 2.648 0 11-3.74-3.74l9.57-9.57m3.838 3.838L18 9.056m-3.838-3.838L14.944 6m-3.838-3.838L9.056 6m3.838 3.838L14.944 9.056" />
              </svg>
              <span className="font-semibold text-neutral-900">Tradie</span>
            </div>
            <p className="text-xs text-neutral-500">Offer services and bid on jobs</p>
          </button>
        </div>

        {role === 'tradie' && (
          <div className="alert-info mb-6">
            Tradie accounts require admin approval before you can submit quotes. You'll be able to browse jobs and set up your profile in the meantime.
          </div>
        )}

        {error && <div className="alert-error mb-6">{error}</div>}
        {success && <div className="alert-success mb-6">{success}</div>}

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="you@example.com" />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="input" placeholder="At least 6 characters" />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" placeholder="John Smith" />
          </div>
          <div>
            <label className="label">Phone</label>
            <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="0412 345 678" />
          </div>

          {role === 'customer' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">State</label>
                  <select required value={state} onChange={(e) => setState(e.target.value)} className="input">
                    <option value="">Select...</option>
                    {AUSTRALIAN_STATES.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Postcode</label>
                  <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} className="input" placeholder="2000" />
                </div>
              </div>
              <div>
                <label className="label">Suburb</label>
                <input type="text" value={suburb} onChange={(e) => setSuburb(e.target.value)} className="input" placeholder="Sydney" />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="label">Business Name</label>
                <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" placeholder="Smith Plumbing Co." />
              </div>
              <div>
                <label className="label">ABN</label>
                <input type="text" required value={abn} onChange={(e) => setAbn(e.target.value)} className="input" placeholder="12 345 678 901" />
              </div>
              <div>
                <label className="label">Trade Category</label>
                <select required value={tradeCategory} onChange={(e) => setTradeCategory(e.target.value)} className="input">
                  <option value="">Select...</option>
                  {TRADE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <p className="text-center text-sm text-neutral-600 mt-6">
          Already have an account?{' '}
          <Link to="/signin" className="text-primary-600 font-medium hover:text-primary-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
