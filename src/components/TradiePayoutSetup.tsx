import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

export function TradiePayoutSetup() {
  const { profile } = useAuth()
  const [accountStatus, setAccountStatus] = useState<{
    connected: boolean
    chargesEnabled: boolean
    payoutsEnabled: boolean
    detailsSubmitted?: boolean
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isTradie = profile?.role === 'tradie' && profile?.verification_status === 'approved'

  const fetchStatus = async () => {
    if (!isTradie) return
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) return

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tradie-account-status`
      const response = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (response.ok) {
        const data = await response.json()
        setAccountStatus(data)
      }
    } catch (err) {
      console.error('Account status error:', err)
    }
  }

  useEffect(() => {
    fetchStatus()
  }, [])

  const handleSetup = async () => {
    setLoading(true)
    setError('')
    try {
      const { data: session } = await supabase.auth.getSession()
      const token = session.session?.access_token
      if (!token) {
        setError('You must be signed in.')
        setLoading(false)
        return
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-tradie-account`
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}))
        setError(errBody.error || 'Could not start payout setup. Please try again.')
        setLoading(false)
        return
      }

      const { url } = await response.json()
      if (url) {
        window.location.href = url
      }
    } catch (err) {
      setError('Could not start payout setup. Please try again.')
      setLoading(false)
    }
  }

  if (!isTradie) return null

  const isReady = accountStatus?.connected && accountStatus?.payoutsEnabled

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-neutral-900 mb-2">Payout Account</h3>

      {error && <div className="alert-error mb-4 text-sm">{error}</div>}

      {isReady ? (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            <p className="text-sm text-green-700 font-medium">Payouts active</p>
          </div>
          <p className="text-sm text-neutral-500">
            Your Stripe account is set up and ready to receive payouts.
          </p>
          <button
            onClick={handleSetup}
            disabled={loading}
            className="btn-secondary text-sm mt-3"
          >
            {loading ? 'Loading...' : 'Update Account Details'}
          </button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-neutral-600 mb-3">
            To receive payouts for completed jobs, you need to connect a Stripe account.
            This is a one-time setup through Stripe's secure platform.
          </p>
          <button
            onClick={handleSetup}
            disabled={loading}
            className="btn-primary text-sm"
          >
            {loading ? 'Loading...' : 'Set Up Payouts'}
          </button>
        </div>
      )}
    </div>
  )
}
