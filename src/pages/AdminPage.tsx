import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import type { Profile, VerificationStatus } from '../types'

export function AdminPage() {
  const { profile: adminProfile } = useAuth()
  const [tradies, setTradies] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<VerificationStatus | 'all'>('pending')

  const fetchTradies = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('profiles').select('*').eq('role', 'tradie')
    if (filter !== 'all') {
      query = query.eq('verification_status', filter)
    }
    query = query.order('created_at', { ascending: false })
    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load tradie accounts.')
      setLoading(false)
      return
    }

    setTradies((data || []) as Profile[])
    setError('')
    setLoading(false)
  }, [filter])

  useEffect(() => {
    fetchTradies()
  }, [fetchTradies])

  const updateStatus = async (tradieId: string, status: VerificationStatus) => {
    const { error: fnError } = await supabase.rpc('set_tradie_verification', {
      p_tradie_id: tradieId,
      p_status: status,
    })

    if (fnError) {
      setError('Could not update tradie status. ' + fnError.message)
      return
    }

    fetchTradies()
  }

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-accent-100 text-accent-700',
      approved: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
      suspended: 'bg-neutral-200 text-neutral-700',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">Admin Panel</h1>
      <p className="text-neutral-600 mb-8">Manage tradie accounts and verifications</p>

      {error && <div className="alert-error mb-6">{error}</div>}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['pending', 'approved', 'rejected', 'suspended', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === f
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Tradie list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : tradies.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-500">No tradies found with this filter.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tradies.map((tradie) => (
            <div key={tradie.id} className="card p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-neutral-900">{tradie.business_name || tradie.full_name || 'Unnamed'}</h3>
                    {statusBadge(tradie.verification_status)}
                  </div>
                  <p className="text-sm text-neutral-500">{tradie.email}</p>
                  <div className="flex gap-4 text-sm text-neutral-500">
                    {tradie.trade_category && <span>Trade: {tradie.trade_category}</span>}
                    {tradie.abn && <span>ABN: {tradie.abn}</span>}
                    {tradie.phone && <span>Phone: {tradie.phone}</span>}
                  </div>
                  <p className="text-xs text-neutral-400">
                    Joined: {new Date(tradie.created_at).toLocaleDateString('en-AU')}
                  </p>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {tradie.verification_status !== 'approved' && (
                    <button
                      onClick={() => updateStatus(tradie.id, 'approved')}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
                    >
                      Approve
                    </button>
                  )}
                  {tradie.verification_status !== 'rejected' && (
                    <button
                      onClick={() => updateStatus(tradie.id, 'rejected')}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
                    >
                      Reject
                    </button>
                  )}
                  {tradie.verification_status !== 'suspended' && (
                    <button
                      onClick={() => updateStatus(tradie.id, 'suspended')}
                      className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-600 text-white hover:bg-neutral-700 transition-colors"
                    >
                      Suspend
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin info */}
      <div className="card p-6 mt-8">
        <h3 className="font-semibold text-neutral-900 mb-2">Admin Account</h3>
        <p className="text-sm text-neutral-600">
          Signed in as {adminProfile?.email}. You have full access to manage tradie accounts.
        </p>
      </div>
    </div>
  )
}
