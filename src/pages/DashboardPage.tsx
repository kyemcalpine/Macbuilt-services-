import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export function DashboardPage() {
  const { profile } = useAuth()
  const [jobCount, setJobCount] = useState<number | null>(null)

  useEffect(() => {
    if (profile?.role === 'customer') {
      supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('customer_id', profile.id)
        .then(({ count }) => setJobCount(count ?? 0))
    } else {
      setJobCount(null)
    }
  }, [profile])

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

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
      {profile.role === 'tradie' && profile.verification_status === 'approved' && (
        <div className="alert-success mb-8">
          <p className="font-medium">Your tradie account is approved!</p>
          <p>You can now browse jobs and submit quotes. Marketplace features are coming soon.</p>
        </div>
      )}

      {/* Admin setup link (only shows if no admin exists yet — user visits manually) */}
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
              ? jobCount !== null
                ? `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} posted`
                : 'Loading...'
              : 'Browse and manage jobs'}
          </p>
        </Link>

        <div className="card p-6">
          <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="font-semibold text-neutral-900 mb-1">Messages</h3>
          <p className="text-sm text-neutral-600">Messaging coming in Stage 2</p>
        </div>
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
