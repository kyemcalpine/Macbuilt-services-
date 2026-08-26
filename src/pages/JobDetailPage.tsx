import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { JobStatusBadge } from '../components/JobStatusBadge'
import { QuoteStatusBadge } from '../components/QuoteStatusBadge'
import { QuoteForm } from '../components/QuoteForm'
import { JobNotesSection } from '../components/JobNotesSection'
import { StarRating } from '../components/StarRating'
import { ReviewForm } from '../components/ReviewForm'
import { ReviewCard } from '../components/ReviewCard'
import { PhotoUploader } from '../components/PhotoUploader'
import { PhotoGallery } from '../components/PhotoGallery'
import type { Job, JobQuote, JobReview, JobStatus, ResponseType, JobAttachment } from '../types'
import { JOB_STATUS_LABELS, VALID_STATUS_TRANSITIONS, QUOTE_PREFERENCE_LABELS, RESPONSE_TYPE_LABELS } from '../types'

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { profile } = useAuth()
  const [job, setJob] = useState<Job | null>(null)
  const [quotes, setQuotes] = useState<JobQuote[]>([])
  const [myQuote, setMyQuote] = useState<JobQuote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionLoading, setActionLoading] = useState(false)
  const [actionError, setActionError] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showQuoteForm, setShowQuoteForm] = useState(false)
  const [confirmAction, setConfirmAction] = useState<{ type: 'accept' | 'reject'; quoteId: string } | null>(null)
  const [reviews, setReviews] = useState<JobReview[]>([])
  const [showReviewForm, setShowReviewForm] = useState(false)
  const [tradieRatings, setTradieRatings] = useState<Record<string, { average: number; count: number }>>({})
  const [attachments, setAttachments] = useState<JobAttachment[]>([])

  const fetchJob = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:profiles!jobs_customer_id_fkey (
          id, email, full_name, phone, state, suburb, postcode
        ),
        assigned_tradie:profiles!jobs_assigned_tradie_id_fkey (
          id, email, full_name, phone, business_name, trade_category,
          verification_status, state, suburb, postcode
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

  const fetchQuotes = useCallback(async () => {
    if (!id || !profile) return

    const { data } = await supabase
      .from('job_quotes')
      .select(`
        *,
        tradie:profiles!job_quotes_tradie_id_fkey (
          id, email, full_name, phone, business_name, trade_category,
          verification_status, state, suburb, postcode
        )
      `)
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    if (data) {
      setQuotes(data as JobQuote[])
      setMyQuote(data.find((q) => q.tradie_id === profile.id) as JobQuote | null || null)
    }
  }, [id, profile])

  useEffect(() => {
    fetchJob()
  }, [fetchJob])

  useEffect(() => {
    fetchQuotes()
  }, [fetchQuotes])

  const fetchReviews = useCallback(async () => {
    if (!id) return

    const { data } = await supabase
      .from('job_reviews')
      .select(`
        *,
        reviewer:profiles!job_reviews_reviewer_id_fkey (
          id, full_name, email, role, business_name
        ),
        reviewee:profiles!job_reviews_reviewee_id_fkey (
          id, full_name, email, role, business_name
        )
      `)
      .eq('job_id', id)
      .order('created_at', { ascending: true })

    if (data) {
      setReviews(data as JobReview[])
    }
  }, [id])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const fetchTradieRatings = useCallback(async () => {
    if (!profile) return

    const tradieIds = Array.from(new Set(
      quotes
        .filter((q) => q.tradie_id)
        .map((q) => q.tradie_id)
    ))

    if (tradieIds.length === 0) return

    const ratings: Record<string, { average: number; count: number }> = {}

    await Promise.all(tradieIds.map(async (tradieId) => {
      const { data } = await supabase
        .from('job_reviews')
        .select('rating')
        .eq('reviewee_id', tradieId)

      if (data && data.length > 0) {
        const sum = data.reduce((acc, r) => acc + r.rating, 0)
        ratings[tradieId] = { average: sum / data.length, count: data.length }
      }
    }))

    setTradieRatings(ratings)
  }, [quotes, profile])

  useEffect(() => {
    fetchTradieRatings()
  }, [fetchTradieRatings])

  const fetchAttachments = useCallback(async () => {
    if (!id) return
    const { data } = await supabase
      .from('job_attachments')
      .select(`
        *,
        uploader:profiles!job_attachments_uploaded_by_fkey (
          id, full_name, email, role
        )
      `)
      .eq('job_id', id)
      .order('created_at', { ascending: true })
    if (data) setAttachments(data as JobAttachment[])
  }, [id])

  useEffect(() => {
    fetchAttachments()
  }, [fetchAttachments])

  const handleDeleteAttachment = async (attachmentId: string, storagePath: string) => {
    const { error: rpcError } = await supabase.rpc('delete_job_attachment', { p_attachment_id: attachmentId })
    if (rpcError) {
      setActionError(rpcError.message || 'Could not delete photo.')
      return
    }
    await supabase.storage.from('job-attachments').remove([storagePath])
    fetchAttachments()
  }

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

  const handleTradieStatusChange = async (newStatus: JobStatus) => {
    if (!job) return
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('tradie_update_job_status', {
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

  const handleConfirmCompletion = async () => {
    if (!job) return
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('confirm_job_completion', {
      p_job_id: job.id,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not confirm completion.')
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

  const handleAcceptQuote = async (quoteId: string) => {
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('accept_quote', {
      p_quote_id: quoteId,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not accept quote.')
      setActionLoading(false)
      return
    }

    setActionLoading(false)
    setConfirmAction(null)
    fetchJob()
    fetchQuotes()
  }

  const handleRejectQuote = async (quoteId: string) => {
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('reject_quote', {
      p_quote_id: quoteId,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not reject quote.')
      setActionLoading(false)
      return
    }

    setActionLoading(false)
    setConfirmAction(null)
    fetchQuotes()
  }

  const handleWithdrawQuote = async (quoteId: string) => {
    setActionLoading(true)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('withdraw_quote', {
      p_quote_id: quoteId,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not withdraw quote.')
      setActionLoading(false)
      return
    }

    setActionLoading(false)
    fetchQuotes()
  }

  const handleStartConversation = async (otherPartyId: string) => {
    if (!job || !profile) return
    setActionLoading(true)
    setActionError('')

    // Determine customer_id and tradie_id based on who the current user is.
    // The caller passes the ID of the OTHER party in the conversation.
    const isCustomer = profile.id === job.customer_id
    const customerId = isCustomer ? profile.id : job.customer_id
    const tradieId = isCustomer ? otherPartyId : profile.id

    // Check if a conversation already exists for this job + customer + tradie
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('job_id', job.id)
      .eq('customer_id', customerId)
      .eq('tradie_id', tradieId)
      .maybeSingle()

    if (existing) {
      navigate(`/messages/${existing.id}`)
      return
    }

    // Create a new conversation
    const { data: newConv, error: insertError } = await supabase
      .from('conversations')
      .insert({ job_id: job.id, customer_id: customerId, tradie_id: tradieId })
      .select('id')
      .single()

    if (insertError || !newConv) {
      setActionError('Could not start conversation. Please try again.')
      setActionLoading(false)
      return
    }

    navigate(`/messages/${newConv.id}`)
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
  const isAssignedTradie = profile?.id === job.assigned_tradie_id
  const isAdmin = profile?.role === 'admin'
  const isTradie = profile?.role === 'tradie' && profile?.verification_status === 'approved'
  const canManage = isOwner
  const possibleTransitions = VALID_STATUS_TRANSITIONS[job.status] || []
  const pendingQuotes = quotes.filter((q) => q.status === 'pending')

  const awaitingConfirmation =
    job.status === 'completed' &&
    job.tradie_completed_at !== null &&
    job.customer_confirmed_at === null

  const myReviewForJob = reviews.find((r) => r.reviewer_id === profile?.id) || null
  const canReview =
    job.status === 'completed' &&
    job.customer_confirmed_at !== null &&
    job.assigned_tradie_id !== null &&
    (isOwner || isAssignedTradie) &&
    !myReviewForJob

  const fullAddress = [
    job.address_line1,
    job.address_line2,
    job.suburb,
    job.state,
    job.postcode,
  ].filter(Boolean).join(', ')

  // Determine if tradie can submit a response
  const canSubmitResponse = isTradie && !isOwner && job.status === 'open' && !myQuote
  const responseType: ResponseType = job.quote_preference === 'open_to_quotes' ? 'quote' : 'interest'

  // Can add notes: owner or assigned tradie (on active jobs)
  const canAddNote = (isOwner || isAssignedTradie) && job.status !== 'cancelled' && job.status !== 'completed'

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
            <JobStatusBadge status={job.status} size="md" awaitingConfirmation={awaitingConfirmation} />
          </div>
          <p className="text-neutral-600">{job.trade_category}</p>
          <div className="mt-2">
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
              job.quote_preference === 'open_to_quotes'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-accent-100 text-accent-700'
            }`}>
              {QUOTE_PREFERENCE_LABELS[job.quote_preference]}
            </span>
          </div>
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
                <span className="text-neutral-500">Quote Preference</span>
                <p className="font-medium text-neutral-900">{QUOTE_PREFERENCE_LABELS[job.quote_preference]}</p>
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

          {/* Original notes */}
          {job.notes && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-3">Job Notes from Customer</h3>
              <p className="text-neutral-700 whitespace-pre-wrap">{job.notes}</p>
            </div>
          )}

          {/* Tradie quote / interest actions */}
          {/* Photos section */}
          {(isOwner || isAssignedTradie || isAdmin) && attachments.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Photos</h3>
              <PhotoGallery
                attachments={attachments}
                currentUserId={profile?.id || ''}
                onDelete={handleDeleteAttachment}
              />
            </div>
          )}

          {/* Photo uploaders — role and status based */}
          {(isOwner || isAssignedTradie) && job.status !== 'cancelled' && (
            <div className="card p-6 space-y-6">
              <h3 className="font-semibold text-neutral-900">Upload Photos</h3>

              {/* Customer: job photos while open */}
              {isOwner && job.status === 'open' && (
                <PhotoUploader
                  jobId={job.id}
                  attachmentType="job_photo"
                  onUploaded={fetchAttachments}
                  label="Job Photos — show tradies the problem"
                />
              )}

              {/* Tradie: progress photos while in_progress */}
              {isAssignedTradie && job.status === 'in_progress' && (
                <PhotoUploader
                  jobId={job.id}
                  attachmentType="progress_photo"
                  onUploaded={fetchAttachments}
                  label="Progress Photos"
                />
              )}

              {/* Tradie: completion photos after marking complete */}
              {isAssignedTradie && job.status === 'completed' && job.tradie_completed_at !== null && (
                <PhotoUploader
                  jobId={job.id}
                  attachmentType="completion_photo"
                  onUploaded={fetchAttachments}
                  label="Completion Photos"
                />
              )}

              {/* Both: additional photos while job is active */}
              {(isOwner || isAssignedTradie) && job.status !== 'open' && (
                <PhotoUploader
                  jobId={job.id}
                  attachmentType="additional_photo"
                  onUploaded={fetchAttachments}
                  label="Additional Photos"
                />
              )}
            </div>
          )}

          {canSubmitResponse && !showQuoteForm && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-2">
                {responseType === 'quote' ? 'Submit a Quote' : 'Express Interest'}
              </h3>
              <p className="text-sm text-neutral-600 mb-4">
                {responseType === 'quote'
                  ? 'Submit your quote with a proposed price for this job.'
                  : 'This customer has a fixed budget. Express your interest in taking on this job.'}
              </p>
              <button
                onClick={() => setShowQuoteForm(true)}
                className="btn-primary"
              >
                {responseType === 'quote' ? 'Submit Quote' : "I'm Interested"}
              </button>
            </div>
          )}

          {showQuoteForm && (
            <QuoteForm
              jobId={job.id}
              responseType={responseType}
              onSubmitted={() => {
                setShowQuoteForm(false)
                fetchQuotes()
              }}
              onCancel={() => setShowQuoteForm(false)}
            />
          )}

          {/* Tradie's existing response */}
          {myQuote && !showQuoteForm && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Your Response</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  myQuote.response_type === 'quote'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-accent-100 text-accent-700'
                }`}>
                  {RESPONSE_TYPE_LABELS[myQuote.response_type]}
                </span>
                <QuoteStatusBadge status={myQuote.status} />
              </div>
              {myQuote.response_type === 'quote' && myQuote.amount != null && (
                <p className="text-sm text-neutral-700 mb-2">
                  <span className="text-neutral-500">Amount:</span>{' '}
                  <span className="font-medium">{formatBudget(myQuote.amount)}</span>
                </p>
              )}
              <p className="text-sm text-neutral-700 mb-2">
                <span className="text-neutral-500">Message:</span> {myQuote.message}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => handleStartConversation(job.customer_id)}
                  disabled={actionLoading}
                  className="btn-primary text-sm"
                >
                  Message Customer
                </button>
                {myQuote.status === 'pending' && (
                  <button
                    onClick={() => handleWithdrawQuote(myQuote.id)}
                    disabled={actionLoading}
                    className="btn bg-neutral-200 text-neutral-700 hover:bg-neutral-300 transition-colors text-sm"
                  >
                    {actionLoading ? 'Withdrawing...' : 'Withdraw'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Customer: Quotes & Responses section */}
          {isOwner && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-neutral-900">
                  Quotes & Responses
                </h3>
                {pendingQuotes.length > 0 && (
                  <span className="text-sm text-neutral-500">
                    {pendingQuotes.length} pending
                  </span>
                )}
              </div>

              {quotes.length === 0 ? (
                <p className="text-neutral-400 text-sm">No responses yet.</p>
              ) : (
                <div className="space-y-4">
                  {quotes.map((quote) => (
                    <div key={quote.id} className={`border rounded-lg p-4 ${
                      quote.status === 'accepted' ? 'border-green-300 bg-green-50' : 'border-neutral-200'
                    }`}>
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-neutral-900">
                              {quote.tradie?.full_name || quote.tradie?.email || 'Unknown'}
                            </span>
                            {quote.tradie?.business_name && (
                              <span className="text-sm text-neutral-500">{quote.tradie.business_name}</span>
                            )}
                            {tradieRatings[quote.tradie_id] && (
                              <span className="inline-flex items-center gap-1 ml-1">
                                <StarRating value={tradieRatings[quote.tradie_id].average} size="sm" showNumber />
                                <span className="text-xs text-neutral-400">({tradieRatings[quote.tradie_id].count})</span>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              quote.response_type === 'quote'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-accent-100 text-accent-700'
                            }`}>
                              {RESPONSE_TYPE_LABELS[quote.response_type]}
                            </span>
                            <QuoteStatusBadge status={quote.status} />
                            {quote.tradie?.verification_status === 'approved' && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                Verified
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-xs text-neutral-400">{formatDateTime(quote.created_at)}</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm mb-3">
                        {quote.response_type === 'quote' && (
                          <div>
                            <span className="text-neutral-500">Amount</span>
                            <p className="font-medium text-neutral-900">{formatBudget(quote.amount)}</p>
                          </div>
                        )}
                        {quote.estimated_start_date && (
                          <div>
                            <span className="text-neutral-500">Est. Start</span>
                            <p className="font-medium text-neutral-900">{formatDate(quote.estimated_start_date)}</p>
                          </div>
                        )}
                        {quote.estimated_duration && (
                          <div>
                            <span className="text-neutral-500">Duration</span>
                            <p className="font-medium text-neutral-900">{quote.estimated_duration}</p>
                          </div>
                        )}
                      </div>

                      <p className="text-sm text-neutral-700 mb-1">{quote.message}</p>
                      {quote.notes && (
                        <p className="text-sm text-neutral-500 mb-1"><span className="text-neutral-400">Notes:</span> {quote.notes}</p>
                      )}

                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => handleStartConversation(quote.tradie_id)}
                          disabled={actionLoading}
                          className="btn-primary text-sm"
                        >
                          Message
                        </button>
                        {quote.status === 'pending' && job.status === 'open' && (
                          <>
                            <button
                              onClick={() => setConfirmAction({ type: 'accept', quoteId: quote.id })}
                              disabled={actionLoading}
                              className="btn bg-green-600 text-white hover:bg-green-700 transition-colors text-sm"
                            >
                              Accept {quote.response_type === 'quote' ? 'Quote' : ''}
                            </button>
                            <button
                              onClick={() => setConfirmAction({ type: 'reject', quoteId: quote.id })}
                              disabled={actionLoading}
                              className="btn bg-neutral-200 text-neutral-700 hover:bg-neutral-300 transition-colors text-sm"
                            >
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Job notes (collaboration) */}
          {(isOwner || isAssignedTradie || isAdmin) && (
            <JobNotesSection jobId={job.id} canAddNote={canAddNote} />
          )}

          {/* Reviews section */}
          {(reviews.length > 0 || canReview || myReviewForJob) && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Reviews</h3>

              {canReview && !showReviewForm && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowReviewForm(true)}
                    className="btn-primary"
                  >
                    Leave a Review
                  </button>
                </div>
              )}

              {showReviewForm && (
                <div className="mb-4">
                  <ReviewForm
                    jobId={job.id}
                    onSubmitted={() => {
                      setShowReviewForm(false)
                      fetchReviews()
                    }}
                    onCancel={() => setShowReviewForm(false)}
                  />
                </div>
              )}

              {myReviewForJob && !showReviewForm && (
                <p className="text-sm text-neutral-500 mb-4">You have reviewed this job.</p>
              )}

              {reviews.length > 0 && (
                <div className="space-y-3">
                  {reviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Status section */}
          <div className="card p-6">
            <h3 className="font-semibold text-neutral-900 mb-4">Status</h3>
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm text-neutral-500">Current:</span>
              <JobStatusBadge status={job.status} size="md" awaitingConfirmation={awaitingConfirmation} />
            </div>
            {awaitingConfirmation && (
              <p className="text-sm text-amber-600 mb-2">
                The tradie has marked this job complete. Please confirm the work is finished.
              </p>
            )}
            {job.status === 'completed' && job.customer_confirmed_at !== null && (
              <p className="text-sm text-green-600 mb-2">
                Completion confirmed on {formatDateTime(job.customer_confirmed_at)}.
              </p>
            )}
            <p className="text-xs text-neutral-400 mb-2">
              Last updated: {formatDateTime(job.updated_at)}
            </p>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Assigned tradie info (for customer) */}
          {isOwner && job.assigned_tradie && (
            <div className="card p-6 border-primary-200">
              <h3 className="font-semibold text-neutral-900 mb-4">Assigned Tradie</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-neutral-500">Name</span>
                  <p className="font-medium text-neutral-900">{job.assigned_tradie.full_name || 'Not provided'}</p>
                </div>
                {job.assigned_tradie.business_name && (
                  <div>
                    <span className="text-neutral-500">Business</span>
                    <p className="font-medium text-neutral-900">{job.assigned_tradie.business_name}</p>
                  </div>
                )}
                <div>
                  <span className="text-neutral-500">Email</span>
                  <p className="font-medium text-neutral-900">{job.assigned_tradie.email}</p>
                </div>
                {job.assigned_tradie.phone && (
                  <div>
                    <span className="text-neutral-500">Phone</span>
                    <p className="font-medium text-neutral-900">{job.assigned_tradie.phone}</p>
                  </div>
                )}
                {job.assigned_tradie.trade_category && (
                  <div>
                    <span className="text-neutral-500">Trade</span>
                    <p className="font-medium text-neutral-900">{job.assigned_tradie.trade_category}</p>
                  </div>
                )}
              </div>
              {job.assigned_tradie_id && tradieRatings[job.assigned_tradie_id] && (
                <div className="mt-4 pt-4 border-t border-neutral-100">
                  <span className="text-neutral-500 text-sm">Rating</span>
                  <div className="flex items-center gap-2 mt-1">
                    <StarRating value={tradieRatings[job.assigned_tradie_id].average} size="sm" showNumber />
                    <span className="text-xs text-neutral-400">({tradieRatings[job.assigned_tradie_id].count} review{tradieRatings[job.assigned_tradie_id].count !== 1 ? 's' : ''})</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Customer info (for assigned tradie) */}
          {isAssignedTradie && job.customer && (
            <div className="card p-6 border-primary-200">
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
              <button
                onClick={() => handleStartConversation(job.customer_id)}
                disabled={actionLoading}
                className="btn-primary w-full text-sm mt-4"
              >
                Message Customer
              </button>
            </div>
          )}

          {/* Customer info (for admin) */}
          {isAdmin && !isAssignedTradie && job.customer && (
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
              </div>
            </div>
          )}

          {/* Tradie status actions */}
          {isAssignedTradie && job.status === 'assigned' && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Update Status</h3>
              <button
                onClick={() => handleTradieStatusChange('in_progress')}
                disabled={actionLoading}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium btn-secondary"
              >
                {actionLoading ? 'Updating...' : 'Start Work'}
              </button>
            </div>
          )}

          {isAssignedTradie && job.status === 'in_progress' && (
            <div className="card p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Update Status</h3>
              <button
                onClick={() => handleTradieStatusChange('completed')}
                disabled={actionLoading}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {actionLoading ? 'Updating...' : 'Mark as Completed'}
              </button>
            </div>
          )}

          {/* Customer confirm completion */}
          {isOwner && awaitingConfirmation && (
            <div className="card p-6 border-amber-200">
              <h3 className="font-semibold text-neutral-900 mb-2">Confirm Completion</h3>
              <p className="text-sm text-neutral-600 mb-4">
                The tradie has marked this job as complete. Please confirm the work is finished.
              </p>
              <button
                onClick={handleConfirmCompletion}
                disabled={actionLoading}
                className="w-full px-4 py-2 rounded-lg text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                {actionLoading ? 'Confirming...' : 'Confirm Completion'}
              </button>
            </div>
          )}

          {/* Customer status actions (existing) */}
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

          {canManage && job.status !== 'open' && possibleTransitions.length === 0 && (
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

      {/* Accept/Reject confirmation modal */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-neutral-900 mb-2">
              {confirmAction.type === 'accept' ? 'Accept this response?' : 'Reject this response?'}
            </h3>
            <p className="text-neutral-600 mb-6">
              {confirmAction.type === 'accept'
                ? 'Accepting will assign the job to this tradie and reject all other pending responses. This cannot be undone.'
                : 'Rejecting will mark this response as rejected. The tradie will be notified.'}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmAction(null)}
                className="btn-secondary"
                disabled={actionLoading}
              >
                Cancel
              </button>
              <button
                onClick={() => confirmAction.type === 'accept'
                  ? handleAcceptQuote(confirmAction.quoteId)
                  : handleRejectQuote(confirmAction.quoteId)
                }
                disabled={actionLoading}
                className={`btn text-white transition-colors ${
                  confirmAction.type === 'accept'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {actionLoading ? 'Processing...' : confirmAction.type === 'accept' ? 'Accept' : 'Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export { JobDetailPage }