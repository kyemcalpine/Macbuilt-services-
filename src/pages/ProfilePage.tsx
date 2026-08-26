import { useState, FormEvent, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AUSTRALIAN_STATES, TRADE_CATEGORIES } from '../types'

export function ProfilePage() {
  const { profile, refreshProfile } = useAuth()
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

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setPhone(profile.phone || '')
      setState(profile.state || '')
      setSuburb(profile.suburb || '')
      setPostcode(profile.postcode || '')
      setBusinessName(profile.business_name || '')
      setAbn(profile.abn || '')
      setTradeCategory(profile.trade_category || '')
    }
  }, [profile])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    const updates: Record<string, unknown> = {
      full_name: fullName,
      phone,
    }

    if (profile?.role === 'customer') {
      updates.state = state
      updates.suburb = suburb
      updates.postcode = postcode
    } else if (profile?.role === 'tradie') {
      updates.business_name = businessName
      updates.abn = abn
      updates.trade_category = tradeCategory
    }

    const { error: updateError } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', profile?.id)

    if (updateError) {
      setError('Could not save your profile. Please try again.')
      setLoading(false)
      return
    }

    setSuccess('Profile saved successfully.')
    await refreshProfile()
    setLoading(false)
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

  const verificationBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-accent-100 text-accent-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      suspended: 'bg-neutral-200 text-neutral-700',
    }
    return (
      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">My Profile</h1>
      <p className="text-neutral-600 mb-8">View and update your account details</p>

      {/* Read-only info */}
      <div className="card p-6 mb-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-neutral-500">Email</span>
            <p className="font-medium text-neutral-900">{profile.email}</p>
          </div>
          <div>
            <span className="text-sm text-neutral-500">Account Type</span>
            <p className="font-medium text-neutral-900 capitalize">{profile.role}</p>
          </div>
          {profile.role === 'tradie' && (
            <div>
              <span className="text-sm text-neutral-500">Verification Status</span>
              <div className="mt-1">{verificationBadge(profile.verification_status)}</div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}
      {success && <div className="alert-success mb-6">{success}</div>}

      <form onSubmit={handleSubmit} className="card p-6 space-y-4">
        <div>
          <label className="label">Full Name</label>
          <input type="text" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
        </div>
        <div>
          <label className="label">Phone</label>
          <input type="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} className="input" />
        </div>

        {profile.role === 'customer' ? (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">State</label>
                <select value={state} onChange={(e) => setState(e.target.value)} className="input">
                  <option value="">Select...</option>
                  {AUSTRALIAN_STATES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Postcode</label>
                <input type="text" value={postcode} onChange={(e) => setPostcode(e.target.value)} className="input" />
              </div>
            </div>
            <div>
              <label className="label">Suburb</label>
              <input type="text" value={suburb} onChange={(e) => setSuburb(e.target.value)} className="input" />
            </div>
          </>
        ) : profile.role === 'tradie' ? (
          <>
            <div>
              <label className="label">Business Name</label>
              <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">ABN</label>
              <input type="text" required value={abn} onChange={(e) => setAbn(e.target.value)} className="input" />
            </div>
            <div>
              <label className="label">Trade Category</label>
              <select value={tradeCategory} onChange={(e) => setTradeCategory(e.target.value)} className="input">
                <option value="">Select...</option>
                {TRADE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </>
        ) : null}

        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  )
}
