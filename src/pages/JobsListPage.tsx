import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { JobStatusBadge } from '../components/JobStatusBadge'
import type { Job, JobStatus } from '../types'
import { JOB_STATUSES, JOB_STATUS_LABELS } from '../types'

type StatusFilter = JobStatus | 'all'

export function JobsListPage() {
  const { profile } = useAuth()
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [search, setSearch] = useState('')

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
      .order('created_at', { ascending: false })

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data, error: fetchError } = await query

    if (fetchError) {
      setError('Could not load jobs. Please try again.')
      setLoading(false)
      return
    }

    setJobs((data || []) as Job[])
    setLoading(false)
  }, [statusFilter])

  useEffect(() => {
    fetchJobs()
  }, [fetchJobs])

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

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Jobs</h1>
          <p className="text-neutral-600">
            {profile.role === 'admin'
              ? 'All jobs across the platform'
              : profile.role === 'tradie'
                ? 'Browse open jobs available for quoting'
                : 'Manage your posted jobs'}
          </p>
        </div>
        {profile.role === 'customer' && (
          <Link to="/jobs/new" className="btn-primary">
            Post a New Job
          </Link>
        )}
      </div>

      {error && <div className="alert-error mb-6">{error}</div>}

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by title, description, or suburb..."
          className="input max-w-md"
        />
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(['all', ...JOB_STATUSES] as const).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f as StatusFilter)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              statusFilter === f
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-neutral-300 text-neutral-600 hover:bg-neutral-50'
            }`}
          >
            {f === 'all' ? 'All' : JOB_STATUS_LABELS[f as JobStatus]}
          </button>
        ))}
      </div>

      {/* Jobs list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : filteredJobs.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-neutral-500 mb-4">
            {search ? 'No jobs match your search.' : 'No jobs found.'}
          </p>
          {profile.role === 'customer' && !search && (
            <Link to="/jobs/new" className="btn-primary inline-block">
              Post Your First Job
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredJobs.map((job) => (
            <Link key={job.id} to={`/jobs/${job.id}`} className="card p-6 hover:shadow-md transition-shadow flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <h3 className="font-semibold text-neutral-900 line-clamp-2">{job.title}</h3>
                <JobStatusBadge status={job.status} />
              </div>
              <p className="text-sm text-neutral-600 line-clamp-2 mb-4">{job.description}</p>
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
                {job.customer && profile.role === 'admin' && (
                  <div className="flex items-center gap-2 pt-2 border-t border-neutral-100">
                    <svg className="w-4 h-4 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>{job.customer.full_name || job.customer.email}</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
