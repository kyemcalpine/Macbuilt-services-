import { useState, FormEvent, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AUSTRALIAN_STATES, TRADE_CATEGORIES } from '../types'
import type { JobReview } from '../types'
import { StarRating } from '../components/StarRating'
import { ReviewCard } from '../components/ReviewCard'

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
  const [reviews, setReviews] = useState<JobReview[]>([])
  const [avgRating, setAvgRating] = useState<number | null>(null)

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

  useEffect(() => {
    if (!profile) return

    supabase
      .from('job_reviews')
      .select(`
        *,
        reviewer:profiles!job_reviews_reviewer_id_fkey (
          id, full_name, email, role, business_name
        ),
        reviewee:profiles!job_reviews_reviewee_id_fkey (
          id, full_name, email, role, business_name
        ),
        job:jobs!job_reviews_job_id_fkey (
          id, title
        )
      `)
      .eq('reviewee_id', profile.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) {
          setReviews(data as JobReview[])
          if (data.length > 0) {
            const sum = data.reduce((acc, r) => acc + r.rating, 0)
            setAvgRating(sum / data.length)
          }
        }
      })
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

      {/* Reviews received */}
      {reviews.length > 0 && (
        <div className="mt-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-neutral-900">Reviews About You</h3>
              {avgRating !== null && (
                <div className="flex items-center gap-2">
                  <StarRating value={avgRating} size="sm" showNumber />
                  <span className="text-xs text-neutral-400">({reviews.length} review{reviews.length !== 1 ? 's' : ''})</span>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {reviews.map((review) => (
                <ReviewCard key={review.id} review={review} showJobTitle />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
