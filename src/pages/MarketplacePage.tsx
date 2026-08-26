import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { JobStatusBadge } from '../components/JobStatusBadge'
import type { Job } from '../types'
import { TRADE_CATEGORIES, QUOTE_PREFERENCE_LABELS } from '../types'

const PAGE_SIZE = 12

interface JobWithQuoteCount extends Job {
  quote_count: number
}

export function MarketplacePage() {
  const { profile } = useAuth()
  const [jobs, setJobs] = useState<JobWithQuoteCount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [hasMore, setHasMore] = useState(false)

  const fetchJobs = useCallback(async () => {
    setLoading(true)
    setError('')

    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:profiles!jobs_customer_id_fkey (
          id, email, full_name, phone, state, suburb, postcode
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(PAGE_SIZE)

    if (categoryFilter !== 'all') {
      query = query.eq('trade_category', categoryFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load marketplace jobs.')
      setLoading(false)
      return
    }

    const jobsData = (data || []) as Job[]

    // Fetch quote counts for each job
    const jobsWithCounts: JobWithQuoteCount[] = await Promise.all(
      jobsData.map(async (job) => {
        const { count } = await supabase
          .from('job_quotes')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id)
          .neq('status', 'withdrawn')

        return { ...job, quote_count: count ?? 0 }
      })
    )

    setJobs(jobsWithCounts)
    setHasMore(jobsData.length === PAGE_SIZE)
    setLoading(false)
  }, [categoryFilter])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

  const loadMore = async () => {
    if (jobs.length === 0) return
    setLoading(true)

    let query = supabase
      .from('jobs')
      .select(`
        *,
        customer:profiles!jobs_customer_id_fkey (
          id, email, full_name, phone, state, suburb, postcode
        )
      `)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .range(jobs.length, jobs.length + PAGE_SIZE - 1)

    if (categoryFilter !== 'all') {
      query = query.eq('trade_category', categoryFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load more jobs.')
      setLoading(false)
      return
    }

    const jobsData = (data || []) as Job[]

    const jobsWithCounts: JobWithQuoteCount[] = await Promise.all(
      jobsData.map(async (job) => {
        const { count } = await supabase
          .from('job_quotes')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', job.id)
          .neq('status', 'withdrawn')

        return { ...job, quote_count: count ?? 0 }
      })
    )

    setJobs((prev) => [...prev, ...jobsWithCounts])
    setHasMore(jobsData.length === PAGE_SIZE)
    setLoading(false)
  }

  const filteredJobs = search.trim()
    ? jobs.filter(
        (j) =>
          j.title.toLowerCase().includes(search.toLowerCase()) ||
          j.description.toLowerCase().includes(search.toLowerCase()) ||
          (j.suburb || '').toLowerCase().includes(search.toLowerCase())
      )
    : jobs

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })

  const formatBudget = (budget: number | null) =>
    budget != null ? `$${budget.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null

  if (!profile) return null

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">Marketplace</h1>
        <p className="text-neutral-600">Browse open jobs available for quoting</p>
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, description, or suburb..."
          className="input flex-1"
        />
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="input sm:max-w-xs"
        >
          <option value="all">All Categories</option>
          {TRADE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-500">
            {search || categoryFilter !== 'all'
              ? 'No jobs match your filters.'
              : 'No open jobs available right now. Check back soon!'}
          </p>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredJobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="card p-6 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-neutral-900 line-clamp-2">{job.title}</h3>
                <JobStatusBadge status={job.status} />
              </div>
              <p className="text-sm text-neutral-600 line-clamp-2 mb-3">{job.description}</p>

              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  job.quote_preference === 'open_to_quotes'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-accent-100 text-accent-700'
                }`}>
                  {QUOTE_PREFERENCE_LABELS[job.quote_preference]}
                </span>
              </div>

              <div className="space-y-1.5 text-sm text-neutral-500 mt-auto">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                  </svg>
                  <span>{job.trade_category}</span>
                </div>
                {job.suburb && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span>{job.suburb}{job.state ? `, ${job.state}` : ''}</span>
                  </div>
                )}
                {job.scheduled_date && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>{formatDate(job.scheduled_date)}</span>
                  </div>
                )}
                {job.budget != null && (
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="font-medium text-neutral-700">{formatBudget(job.budget)}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>{job.quote_count} {job.quote_count === 1 ? 'response' : 'responses'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Posted {formatDate(job.created_at)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
          {hasMore && (
            <div className="flex justify-center mt-8">
              <button
                onClick={loadMore}
                disabled={loading}
                className="btn-secondary"
              >
                {loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
