import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { JobStatusBadge } from '../components/JobStatusBadge'
import type { Job, JobStatus } from '../types'
import { JOB_STATUS_LABELS, VALID_STATUS_TRANSITIONS } from '../types'

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const fetchJob = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:profiles!jobs_customer_id_fkey (
          id, email, full_name, phone, state, suburb, postcode
        )
      `)
      .eq('id', id)
      .maybeSingle()

    if (fetchError) {
      setError('Could not load this job.')
      setLoading(false)
      return
    }

    if (!data) {
      setError('Job not found.')
      setLoading(false)
      return
    }

    setJob(data as Job)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  const handleStatusChange = async (newStatus: JobStatus) => {
    if (!job) return
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('update_job_status', {
      p_job_id: job.id,
      p_new_status: newStatus,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not update job status.')
      setActionLoading(false)
      return
    }

    setActionLoading(false)
    fetchJob()
  }

  const handleDelete = async () => {
    if (!job) return
    setActionLoading(true)
    setActionError('')

    const { error: deleteError } = await supabase
      .from('jobs')
      .delete()
      .eq('id', job.id)

    if (deleteError) {
      setActionError('Could not delete this job.')
      setActionLoading(false)
      return
    }

    navigate('/jobs')
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const formatBudget = (budget: number | null) =>
    budget != null ? `$${budget.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'Not specified'

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error mb-6">{error || 'An error occurred.'}</div>
        <Link to="/jobs" className="btn-secondary">Back to Jobs</Link>
      </div>
    )
  }

  const isOwner = profile?.id === job.customer_id
  const canManage = isOwner
  const possibleTransitions = VALID_STATUS_TRANSITIONS[job.status] || []

  const fullAddress = [
    job.address_line1,
    job.address_line2,
    job.suburb,
    job.state,
    job.postcode,
  ].filter(Boolean).join(', ')

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link to="/jobs" className="text-sm text-neutral-500 hover:text-primary-600 transition-colors mb-6 inline-flex items-center gap-1">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Back to Jobs
      </Link>

      {actionError && <div className="alert-error mb-6">{actionError}</div>}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-neutral-900">{job.title}</h1>
            <JobStatusBadge status={job.status} size="md" />
          </div>
          <p className="text-neutral-600">{job.trade_category}</p>
        </div>
        {canManage && (
          <div className="flex gap-3">
            <Link to={`/jobs/${job.id}/edit`} className="btn-secondary">
              Edit
            </Link>
            {job.status === 'open' && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={actionLoading}
                className="btn bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Description */}
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-3">Description</h3>
            <p className="text-neutral-700 whitespace-pre-wrap">{job.description}</p>
          </div>

          {/* Job details */}
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-4">Job Details</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-neutral-500">Trade Category</span>
                <p className="font-medium text-neutral-900">{job.trade_category}</p>
              </div>
              <div>
                <span className="text-neutral-500">Budget</span>
                <p className="font-medium text-neutral-900">{formatBudget(job.budget)}</p>
              </div>
              <div>
                <span className="text-neutral-500">Scheduled Date</span>
                <p className="font-medium text-neutral-900">
                  {job.scheduled_date ? formatDateTime(job.scheduled_date) : 'Not scheduled'}
                </p>
              </div>
              <div>
                <span className="text-neutral-500">Posted</span>
                <p className="font-medium text-neutral-900">{formatDate(job.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Location */}
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-3">Location</h3>
            {fullAddress ? (
              <p className="text-neutral-700">{fullAddress}</p>
            ) : (
              <p className="text-neutral-400">No address provided</p>
            )}
          </div>

          {/* Notes */}
          {job.notes && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-3">Notes</h3>
              <p className="text-neutral-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Status history */}
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-4">Status</h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-neutral-500">Current:</span>
              <JobStatusBadge status={job.status} size="md" />
            </div>
            <p className="text-xs text-neutral-400 mb-2">
              Last updated: {formatDateTime(job.updated_at)}
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer info */}
          {job.customer && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Customer</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-neutral-500">Name</span>
                  <p className="font-medium text-neutral-900">{job.customer.full_name || 'Not provided'}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Email</span>
                  <p className="font-medium text-neutral-900">{job.customer.email}</p>
                </div>
                {job.customer.phone && (
                  <div>
                    <span className="text-neutral-500">Phone</span>
                    <p className="font-medium text-neutral-900">{job.customer.phone}</p>
                  </div>
                )}
                {job.customer.suburb && (
                  <div>
                    <span className="text-neutral-500">Suburb</span>
                    <p className="font-medium text-neutral-900">
                      {job.customer.suburb}{job.customer.state ? `, ${job.customer.state}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status actions */}
          {canManage && possibleTransitions.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Update Status</h3>
              <div className="space-y-2">
                {possibleTransitions.map((newStatus) => (
                  <button
                    key={newStatus}
                    onClick={() => handleStatusChange(newStatus)}
                    disabled={actionLoading}
                    className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      newStatus === 'cancelled'
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : newStatus === 'completed'
                          ? 'bg-green-600 text-white hover:bg-green-700'
                          : 'btn-secondary'
                    }`}
                  >
                    {actionLoading ? 'Updating...' : `Mark as ${JOB_STATUS_LABELS[newStatus]}`}
                  </button>
                ))}
              </div>
            </div>
          )}

          {canManage && job.status !== 'open' && (
            <div className="card p-6">
              <p className="text-sm text-neutral-500">
                {job.status === 'cancelled' || job.status === 'completed'
                  ? 'This job is no longer active.'
                  : 'Status changes are handled through the workflow.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete this job?</h3>
            <p className="text-neutral-600 mb-6">
              This action cannot be undone. The job "{job.title}" will be permanently removed.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={actionLoading}
                className="btn bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                {actionLoading ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
