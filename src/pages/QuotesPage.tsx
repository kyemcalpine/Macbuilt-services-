import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { QuoteStatusBadge } from '../components/QuoteStatusBadge'
import type { JobQuote, QuoteStatus } from '../types'
import { QUOTE_STATUSES, QUOTE_STATUS_LABELS, RESPONSE_TYPE_LABELS } from '../types'

interface QuoteWithJob extends JobQuote {
  job: {
    id: string
    title: string
    status: string
    trade_category: string
    suburb: string | null
    state: string | null
  } | null
}

type StatusFilter = QuoteStatus | 'all'

export function QuotesPage() {
  const { profile } = useAuth()
  const [quotes, setQuotes] = useState<QuoteWithJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')

  const fetchQuotes = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError('')

    let query = supabase
      .from('job_quotes')
      .select(`
        *,
        job:jobs!job_quotes_job_id_fkey (
          id, title, status, trade_category, suburb, state
        )
      `)
      .eq('tradie_id', profile.id)
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load your quotes.')
      setLoading(false)
      return
    }

    setQuotes((data || []) as QuoteWithJob[])
    setLoading(false)
  }, [profile, statusFilter])

  useEffect(() => {
    fetchQuotes()
  }, [fetchQuotes])

  const handleWithdraw = async (quoteId: string) => {
    setActionLoading(quoteId)
    setActionError('')

    const { error: rpcError } = await supabase.rpc('withdraw_quote', {
      p_quote_id: quoteId,
    })

    if (rpcError) {
      setActionError(rpcError.message || 'Could not withdraw quote.')
      setActionLoading(null)
      return
    }

    setActionLoading(null)
    fetchQuotes()
  }

  const formatBudget = (amount: number | null) =>
    amount != null ? `$${amount.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  if (!profile) return null

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">My Quotes & Responses</h1>
        <p className="text-neutral-600">Track quotes and expressions of interest you have submitted</p>
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}
      {actionError && <div className="alert-error mb-6">{actionError}</div>}

      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', ...QUOTE_STATUSES] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f as StatusFilter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === f
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f === 'all' ? 'All' : QUOTE_STATUS_LABELS[f as QuoteStatus]}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : quotes.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-500 mb-4">
            {statusFilter === 'all'
              ? 'You have not submitted any quotes or expressions of interest yet.'
              : `No ${QUOTE_STATUS_LABELS[statusFilter as QuoteStatus].toLowerCase()} quotes.`}
          </p>
          <Link to="/marketplace" className="btn-primary inline-block">
            Browse Marketplace
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {quotes.map((quote) => (
            <div key={quote.id} className="card p-6">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  {quote.job && (
                    <Link to={`/jobs/${quote.job.id}`} className="font-semibold text-neutral-900 hover:text-primary-600 transition-colors">
                      {quote.job.title}
                    </Link>
                  )}
                  <div className="flex items-center gap-2 mt-1 text-sm text-neutral-500">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      quote.response_type === 'quote'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-accent-100 text-accent-700'
                    }`}>
                      {RESPONSE_TYPE_LABELS[quote.response_type]}
                    </span>
                    {quote.job?.trade_category && <span>{quote.job.trade_category}</span>}
                    {quote.job?.suburb && <span>— {quote.job.suburb}</span>}
                  </div>
                </div>
                <QuoteStatusBadge status={quote.status} size="md" />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm mb-4">
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
                <div>
                  <span className="text-neutral-500">Submitted</span>
                  <p className="font-medium text-neutral-900">{formatDate(quote.created_at)}</p>
                </div>
              </div>

              <p className="text-sm text-neutral-700 mb-4">{quote.message}</p>

              {quote.status === 'pending' && (
                <button
                  onClick={() => handleWithdraw(quote.id)}
                  disabled={actionLoading === quote.id}
                  className="btn bg-neutral-200 text-neutral-700 hover:bg-neutral-300 transition-colors text-sm"
                >
                  {actionLoading === quote.id ? 'Withdrawing...' : 'Withdraw'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
