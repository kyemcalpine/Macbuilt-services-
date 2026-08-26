import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

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

export function DashboardPage() {
  const { profile } = useAuth()
  const [jobCounts, setJobCounts] = useState<JobCounts | null>(null)
  const [quoteCounts, setQuoteCounts] = useState<QuoteCounts | null>(null)
  const [availableJobs, setAvailableJobs] = useState<number | null>(null)

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
          <p>An administrator needs to approve your account before you can submit quotes on jobs. You'll be notified once approved.</p>
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
          <div className="card p-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="font-semibold text-neutral-900 mb-1">Messages</h3>
            <p className="text-sm text-neutral-600">Messaging coming soon</p>
          </div>
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
