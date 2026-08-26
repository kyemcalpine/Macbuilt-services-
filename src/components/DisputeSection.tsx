import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Job, Dispute } from '../types'
import { DISPUTE_STATUS_LABELS } from '../types'

interface DisputeSectionProps {
  job: Job
}

export function DisputeSection({ job }: DisputeSectionProps) {
  const { profile } = useAuth()
  const [disputes, setDisputes] = useState<Dispute[]>([])
  const [showForm, setShowForm] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isOwner = profile?.id === job.customer_id
  const isAssignedTradie = profile?.id === job.assigned_tradie_id

  const fetchDisputes = useCallback(async () => {
    if (!job.id) return
    const { data } = await supabase
      .from('disputes')
      .select('*')
      .eq('job_id', job.id)
      .order('raised_at', { ascending: true })
    if (data) setDisputes(data as Dispute[])
  }, [job.id])

  useEffect(() => {
    fetchDisputes()
  }, [fetchDisputes])

  const canRaiseDispute =
    (isOwner || isAssignedTradie) &&
    (job.payment_status === 'paid' || job.payment_status === 'disputed') &&
    disputes.filter((d) => d.status === 'open' || d.status === 'under_review').length === 0

  const handleRaiseDispute = async () => {
    if (reason.trim().length < 10) {
      setError('Please provide a reason (at least 10 characters).')
      return
    }
    setLoading(true)
    setError('')
    try {
      const { error: rpcError } = await supabase.rpc('raise_dispute', {
        p_job_id: job.id,
        p_reason: reason.trim(),
      })
      if (rpcError) {
        setError(rpcError.message || 'Could not raise dispute. Please try again.')
        setLoading(false)
        return
      }
      setReason('')
      setShowForm(false)
      setLoading(false)
      fetchDisputes()
    } catch (err) {
      setError('Could not raise dispute. Please try again.')
      setLoading(false)
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  if (disputes.length === 0 && !canRaiseDispute) {
    return null
  }

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-neutral-900 mb-4">Disputes</h3>

      {error && <div className="alert-error mb-4 text-sm">{error}</div>}

      {disputes.length > 0 && (
        <div className="space-y-4 mb-4">
          {disputes.map((dispute) => (
            <div key={dispute.id} className="border border-neutral-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
                  dispute.status === 'open' ? 'bg-amber-100 text-amber-700' :
                  dispute.status === 'under_review' ? 'bg-blue-100 text-blue-700' :
                  dispute.status === 'resolved_full_refund' ? 'bg-green-100 text-green-700' :
                  dispute.status === 'resolved_partial_refund' ? 'bg-amber-100 text-amber-700' :
                  dispute.status === 'resolved_no_refund' ? 'bg-neutral-100 text-neutral-600' :
                  'bg-neutral-100 text-neutral-500'
                }`}>
                  {DISPUTE_STATUS_LABELS[dispute.status]}
                </span>
                <span className="text-xs text-neutral-400">
                  Raised {formatDate(dispute.raised_at)}
                </span>
              </div>
              <p className="text-sm text-neutral-700 mb-2">
                <span className="text-neutral-500">Raised by:</span>{' '}
                {dispute.raised_by_role === 'customer' ? 'Customer' : 'Tradie'}
              </p>
              <p className="text-sm text-neutral-700 mb-2">
                <span className="text-neutral-500">Reason:</span> {dispute.reason}
              </p>
              {dispute.resolution_notes && (
                <p className="text-sm text-neutral-700 mb-2">
                  <span className="text-neutral-500">Resolution:</span> {dispute.resolution_notes}
                </p>
              )}
              {dispute.refund_amount != null && dispute.refund_amount > 0 && (
                <p className="text-sm text-green-700 font-medium">
                  Refund: ${dispute.refund_amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {canRaiseDispute && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="btn-secondary text-sm"
        >
          Raise a Dispute
        </button>
      )}

      {showForm && (
        <div className="space-y-3">
          <p className="text-sm text-neutral-600">
            Describe the issue with this job. An admin will review your dispute and decide on a resolution.
          </p>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            className="input-field w-full"
            placeholder="Explain the issue (at least 10 characters)..."
            disabled={loading}
          />
          <div className="flex gap-2">
            <button
              onClick={handleRaiseDispute}
              disabled={loading || reason.trim().length < 10}
              className="btn-primary text-sm"
            >
              {loading ? 'Submitting...' : 'Submit Dispute'}
            </button>
            <button
              onClick={() => { setShowForm(false); setReason(''); setError('') }}
              disabled={loading}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
