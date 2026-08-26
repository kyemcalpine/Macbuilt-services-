import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { TradiePayoutSetup } from '../components/TradiePayoutSetup'

interface JobCounts {
  open: number
  assigned: number
  in_progress: number
  completed: number
  cancelled: number
}

interface QuoteCounts {
  pending: number
  accepted: number
  rejected: number
  withdrawn: number
}

interface DashboardExtras {
  unreadMessages: number
  pendingResponses: number
  recentJobs: { id: string; title: string; status: string; updated_at: string }[]
}

interface TradieRating {
  average: number
  count: number
}

interface PaymentSummary {
  totalSpent: number
  totalEarned: number
  pendingPayouts: number
  pendingPayoutCount: number
}

export function DashboardPage() {
  const { profile } = useAuth()
  const [jobCounts, setJobCounts] = useState<JobCounts | null>(null)
  const [quoteCounts, setQuoteCounts] = useState<QuoteCounts | null>(null)
  const [availableJobs, setAvailableJobs] = useState<number | null>(null)
  const [extras, setExtras] = useState<DashboardExtras | null>(null)
  const [tradieRating, setTradieRating] = useState<TradieRating | null>(null)
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null)

  useEffect(() => {
    if (!profile) return

    if (profile.role === 'customer') {
      Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', profile.id).eq('status', 'open'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', profile.id).eq('status', 'assigned'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', profile.id).eq('status', 'in_progress'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', profile.id).eq('status', 'completed'),
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('customer_id', profile.id).eq('status', 'cancelled'),
      ]).then(([o, a, ip, c, ca]) => {
        setJobCounts({
          open: o.count ?? 0,
          assigned: a.count ?? 0,
          in_progress: ip.count ?? 0,
          completed: c.count ?? 0,
          cancelled: ca.count ?? 0,
        })
      })

      // Fetch unread messages and pending responses for customer
      Promise.all([
        supabase
          .from('conversations')
          .select('id')
          .eq('customer_id', profile.id),
        supabase
          .from('jobs')
          .select('id')
          .eq('customer_id', profile.id),
        supabase
          .from('jobs')
          .select('id, title, status, updated_at')
          .eq('customer_id', profile.id)
          .order('updated_at', { ascending: false })
          .limit(3),
      ]).then(async ([convResult, jobIdsResult, recentResult]) => {
        let unreadCount = 0
        let pendingCount = 0

        if (convResult.data && convResult.data.length > 0) {
          const convIds = convResult.data.map((c) => c.id)
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .neq('sender_id', profile.id)
            .is('read_at', null)
          unreadCount = count ?? 0
        }

        if (jobIdsResult.data && jobIdsResult.data.length > 0) {
          const jobIds = jobIdsResult.data.map((j) => j.id)
          const { count: pending } = await supabase
            .from('job_quotes')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'pending')
            .in('job_id', jobIds)
          pendingCount = pending ?? 0
        }

        setExtras({
          unreadMessages: unreadCount,
          pendingResponses: pendingCount,
          recentJobs: (recentResult.data || []) as { id: string; title: string; status: string; updated_at: string }[],
        })
      })

      // Fetch customer payment summary
      supabase
        .from('transactions')
        .select('type, gross_amount, status')
        .eq('customer_id', profile.id)
        .eq('type', 'payment')
        .eq('status', 'succeeded')
        .then(({ data }) => {
          if (data) {
            setPaymentSummary({
              totalSpent: data.reduce((s, t) => s + t.gross_amount, 0),
              totalEarned: 0,
              pendingPayouts: 0,
              pendingPayoutCount: 0,
            })
          }
        })
    } else if (profile.role === 'tradie' && profile.verification_status === 'approved') {
      Promise.all([
        supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'open'),
        supabase.from('job_quotes').select('id', { count: 'exact', head: true }).eq('tradie_id', profile.id).eq('status', 'pending'),
        supabase.from('job_quotes').select('id', { count: 'exact', head: true }).eq('tradie_id', profile.id).eq('status', 'accepted'),
        supabase.from('job_quotes').select('id', { count: 'exact', head: true }).eq('tradie_id', profile.id).eq('status', 'rejected'),
        supabase.from('job_quotes').select('id', { count: 'exact', head: true }).eq('tradie_id', profile.id).eq('status', 'withdrawn'),
      ]).then(([avail, p, acc, rej, wd]) => {
        setAvailableJobs(avail.count ?? 0)
        setQuoteCounts({
          pending: p.count ?? 0,
          accepted: acc.count ?? 0,
          rejected: rej.count ?? 0,
          withdrawn: wd.count ?? 0,
        })
      })

      // Fetch unread messages for tradie
      Promise.all([
        supabase.from('conversations').select('id').eq('tradie_id', profile.id),
      ]).then(async ([convResult]) => {
        let unreadCount = 0
        if (convResult.data && convResult.data.length > 0) {
          const convIds = convResult.data.map((c) => c.id)
          const { count } = await supabase
            .from('messages')
            .select('id', { count: 'exact', head: true })
            .in('conversation_id', convIds)
            .neq('sender_id', profile.id)
            .is('read_at', null)
          unreadCount = count ?? 0
        }
        setExtras({
          unreadMessages: unreadCount,
          pendingResponses: 0,
          recentJobs: [],
        })
      })

      // Fetch tradie's average rating
      supabase
        .from('job_reviews')
        .select('rating')
        .eq('reviewee_id', profile.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const sum = data.reduce((acc, r) => acc + r.rating, 0)
            setTradieRating({ average: sum / data.length, count: data.length })
          }
        })

      // Fetch tradie earnings summary
      supabase
        .from('transactions')
        .select('type, gross_amount, net_amount, status')
        .eq('tradie_id', profile.id)
        .then(({ data }) => {
          if (data) {
            const earned = data.filter((t) => t.type === 'payout' && t.status === 'payout_succeeded')
            const pending = data.filter((t) => t.type === 'payout' && t.status === 'payout_pending')
            setPaymentSummary({
              totalSpent: 0,
              totalEarned: earned.reduce((s, t) => s + t.net_amount, 0),
              pendingPayouts: pending.reduce((s, t) => s + t.net_amount, 0),
              pendingPayoutCount: pending.length,
            })
          }
        })
    }
  }, [profile])

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

  const isApprovedTradie = profile.role === 'tradie' && profile.verification_status === 'approved'

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-neutral-900 mb-2">
        Welcome, {profile.full_name || profile.email}
      </h1>
      <p className="text-neutral-600 mb-8">
        You're signed in as a <span className="font-medium capitalize">{profile.role}</span>.
      </p>

      {/* Tradie pending notice */}
      {profile.role === 'tradie' && profile.verification_status === 'pending' && (
        <div className="alert-info mb-8">
          <p className="font-medium mb-1">Your tradie account is pending approval.</p>
          <p className="mb-2">An administrator reviews new tradie accounts to verify credentials. This usually happens within 1-2 business days. You'll receive a notification when your account is approved.</p>
          <p>Once approved, you can browse the marketplace, submit quotes on open jobs, and start conversations with customers.</p>
        </div>
      )}
      {profile.role === 'tradie' && profile.verification_status === 'rejected' && (
        <div className="alert-error mb-8">
          <p className="font-medium">Your tradie account was not approved.</p>
          <p>Please contact support if you believe this was an error.</p>
        </div>
      )}
      {profile.role === 'tradie' && profile.verification_status === 'suspended' && (
        <div className="alert-error mb-8">
          <p className="font-medium">Your tradie account has been suspended.</p>
          <p>Please contact support for more information.</p>
        </div>
      )}
      {isApprovedTradie && (
        <div className="alert-success mb-8">
          <p className="font-medium">Your tradie account is approved!</p>
          <p>You can browse the marketplace and submit quotes on open jobs.</p>
        </div>
      )}

      {/* Admin setup link */}
      {profile.role !== 'admin' && (
        <div className="alert-info mb-8">
          <p className="text-sm">
            Need admin access? Visit{' '}
            <Link to="/admin-setup" className="font-medium text-primary-600 hover:text-primary-700 underline">
              the admin setup page
            </Link>{' '}
            to claim the first admin account (one-time only).
          </p>
        </div>
      )}

      {/* Customer dashboard */}
      {profile.role === 'customer' && jobCounts && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">My Jobs</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/jobs?status=open" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-blue-600">{jobCounts.open}</p>
              <p className="text-sm text-neutral-500">Open</p>
            </Link>
            <Link to="/jobs?status=assigned" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-accent-600">{jobCounts.assigned}</p>
              <p className="text-sm text-neutral-500">Assigned</p>
            </Link>
            <Link to="/jobs?status=in_progress" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-primary-600">{jobCounts.in_progress}</p>
              <p className="text-sm text-neutral-500">In Progress</p>
            </Link>
            <Link to="/jobs?status=completed" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-green-600">{jobCounts.completed}</p>
              <p className="text-sm text-neutral-500">Completed</p>
            </Link>
            <Link to="/jobs?status=cancelled" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-neutral-400">{jobCounts.cancelled}</p>
              <p className="text-sm text-neutral-500">Cancelled</p>
            </Link>
          </div>
        </div>
      )}

      {/* Communication summary */}
      {extras && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Communication</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to="/messages" className="card p-4 hover:shadow-md transition-shadow">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-primary-600">{extras.unreadMessages}</p>
                  <p className="text-sm text-neutral-500">Unread Messages</p>
                </div>
              </div>
            </Link>
            {profile.role === 'customer' && (
              <Link to="/jobs?status=open" className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-accent-600">{extras.pendingResponses}</p>
                    <p className="text-sm text-neutral-500">Responses Awaiting Your Review</p>
                  </div>
                </div>
              </Link>
            )}
            {profile.role === 'tradie' && quoteCounts && (
              <Link to="/quotes?status=pending" className="card p-4 hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent-100 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-accent-600">{quoteCounts.pending}</p>
                    <p className="text-sm text-neutral-500">Quotes Awaiting Reply</p>
                  </div>
                </div>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Recently updated jobs (customer) */}
      {profile.role === 'customer' && extras && extras.recentJobs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Recently Updated Jobs</h2>
          <div className="space-y-3">
            {extras.recentJobs.map((j) => (
              <Link key={j.id} to={`/jobs/${j.id}`} className="card p-4 hover:shadow-md transition-shadow flex items-center justify-between">
                <div>
                  <p className="font-medium text-neutral-900">{j.title}</p>
                  <p className="text-xs text-neutral-400">Updated {new Date(j.updated_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                </div>
                <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  j.status === 'open' ? 'bg-blue-100 text-blue-700' :
                  j.status === 'assigned' ? 'bg-accent-100 text-accent-700' :
                  j.status === 'in_progress' ? 'bg-primary-100 text-primary-700' :
                  j.status === 'completed' ? 'bg-green-100 text-green-700' :
                  'bg-neutral-100 text-neutral-500'
                }`}>
                  {j.status.charAt(0).toUpperCase() + j.status.slice(1).replace('_', ' ')}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Tradie dashboard */}
      {isApprovedTradie && quoteCounts && availableJobs !== null && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">My Activity</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Link to="/marketplace" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-blue-600">{availableJobs}</p>
              <p className="text-sm text-neutral-500">Available Jobs</p>
            </Link>
            <Link to="/quotes?status=pending" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-yellow-600">{quoteCounts.pending}</p>
              <p className="text-sm text-neutral-500">Pending Quotes</p>
            </Link>
            <Link to="/quotes?status=accepted" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-green-600">{quoteCounts.accepted}</p>
              <p className="text-sm text-neutral-500">Accepted</p>
            </Link>
            <Link to="/quotes?status=rejected" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-neutral-400">{quoteCounts.rejected}</p>
              <p className="text-sm text-neutral-500">Rejected</p>
            </Link>
            <Link to="/quotes?status=withdrawn" className="card p-4 hover:shadow-md transition-shadow">
              <p className="text-2xl font-bold text-neutral-300">{quoteCounts.withdrawn}</p>
              <p className="text-sm text-neutral-500">Withdrawn</p>
            </Link>
          </div>
        </div>
      )}

      {/* Tradie earnings summary */}
      {isApprovedTradie && paymentSummary && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Earnings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card p-4">
              <p className="text-2xl font-bold text-green-600">
                ${paymentSummary.totalEarned.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-neutral-500">Total Earnings (Paid Out)</p>
            </div>
            <div className="card p-4">
              <p className="text-2xl font-bold text-amber-600">
                ${paymentSummary.pendingPayouts.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-neutral-500">
                Pending Payouts{paymentSummary.pendingPayoutCount > 0 ? ` (${paymentSummary.pendingPayoutCount})` : ''}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <TradiePayoutSetup />
          </div>
        </div>
      )}

      {/* Customer payments summary */}
      {profile.role === 'customer' && paymentSummary && paymentSummary.totalSpent > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-neutral-900 mb-4">Payments</h2>
          <div className="card p-4">
            <p className="text-2xl font-bold text-blue-600">
              ${paymentSummary.totalSpent.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-sm text-neutral-500">Total Spent on Jobs</p>
          </div>
        </div>
      )}

      {/* Tradie rating card */}
      {isApprovedTradie && tradieRating && (
        <div className="mb-8">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-600">{tradieRating.average.toFixed(1)}</p>
                <p className="text-sm text-neutral-500">Average Rating ({tradieRating.count} review{tradieRating.count !== 1 ? 's' : ''})</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link to="/profile" className="card p-6 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h3 className="font-semibold text-neutral-900 mb-1">Edit Profile</h3>
          <p className="text-sm text-neutral-600">Update your personal and business details</p>
        </Link>

        <Link to="/jobs" className="card p-6 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full bg-accent-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="font-semibold text-neutral-900 mb-1">My Jobs</h3>
          <p className="text-sm text-neutral-600">
            {profile.role === 'customer'
              ? 'Manage your posted jobs'
              : 'Browse and manage jobs'}
          </p>
        </Link>

        {isApprovedTradie ? (
          <Link to="/marketplace" className="card p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="font-semibold text-neutral-900 mb-1">Marketplace</h3>
            <p className="text-sm text-neutral-600">Browse open jobs and submit quotes</p>
          </Link>
        ) : (
          <Link to="/messages" className="card p-6 hover:shadow-md transition-shadow">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-neutral-900 mb-1">Messages</h3>
            <p className="text-sm text-neutral-600">View your conversations</p>
          </Link>
        )}
      </div>

      {/* Account info */}
      <div className="card p-6 mt-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Account Information</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-neutral-500">Email</span>
            <p className="font-medium">{profile.email}</p>
          </div>
          <div>
            <span className="text-neutral-500">Role</span>
            <p className="font-medium capitalize">{profile.role}</p>
          </div>
          {profile.role === 'tradie' && (
            <>
              <div>
                <span className="text-neutral-500">Business</span>
                <p className="font-medium">{profile.business_name || 'Not set'}</p>
              </div>
              <div>
                <span className="text-neutral-500">Verification</span>
                <p className="font-medium capitalize">{profile.verification_status}</p>
              </div>
            </>
          )}
          <div>
            <span className="text-neutral-500">Member since</span>
            <p className="font-medium">{new Date(profile.created_at).toLocaleDateString('en-AU')}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
