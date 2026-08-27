import type { JobActivity, ActivityType } from '../types'
import { ACTIVITY_TYPE_LABELS } from '../types'

interface JobActivityTimelineProps {
  activities: JobActivity[]
  loading: boolean
  error: string
  currentUserId: string
}

const ACTIVITY_ICONS: Record<ActivityType, string> = {
  job_created: 'M12 4v16m8-8H4',
  status_changed: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15',
  quote_submitted: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
  interest_expressed: 'M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z',
  quote_accepted: 'M5 13l4 4L19 7',
  quote_rejected: 'M6 18L18 6M6 6l12 12',
  quote_withdrawn: 'M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-.293.707L12 12.414V19l-4-2v-4.586L3.293 6.707A1 1 0 013 6V4z',
  note_added: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4',
  photo_uploaded: 'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z',
  message_sent: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
  review_submitted: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z',
  completion_requested: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  completion_confirmed: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  payment_initiated: 'M3 10h18M7 15h1m4 0h1m4 0h1M3 5h18M3 5a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2V7a2 2 0 00-2-2',
  payment_received: 'M5 13l4 4L19 7',
  payment_failed: 'M6 18L18 6M6 6l12 12',
  refund_processed: 'M3 10h18M7 15h1m4 0h1m4 0h1M3 5h18M3 5a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2V7a2 2 0 00-2-2',
  payout_processed: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.657 0 3 .895 3 2s-1.343 2-3 2-3 .895-3 2 1.343 2 3 2m0-8c0-2.21 1.343-4 3-4s3 1.79 3 4-1.343 4-3 4m0-8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2',
  dispute_raised: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
  dispute_resolved: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  deposit_requested: 'M3 10h18M7 15h1m4 0h1m4 0h1M3 5h18M3 5a2 2 0 00-2 2v8a2 2 0 002 2h18a2 2 0 002-2V7a2 2 0 00-2-2',
}

const ACTIVITY_ICON_COLORS: Record<ActivityType, string> = {
  job_created: 'text-blue-600 bg-blue-50',
  status_changed: 'text-neutral-600 bg-neutral-100',
  quote_submitted: 'text-primary-600 bg-primary-50',
  interest_expressed: 'text-accent-600 bg-accent-50',
  quote_accepted: 'text-green-600 bg-green-50',
  quote_rejected: 'text-red-600 bg-red-50',
  quote_withdrawn: 'text-neutral-500 bg-neutral-100',
  note_added: 'text-amber-600 bg-amber-50',
  photo_uploaded: 'text-primary-600 bg-primary-50',
  message_sent: 'text-blue-600 bg-blue-50',
  review_submitted: 'text-yellow-600 bg-yellow-50',
  completion_requested: 'text-amber-600 bg-amber-50',
  completion_confirmed: 'text-green-600 bg-green-50',
  payment_initiated: 'text-blue-600 bg-blue-50',
  payment_received: 'text-green-600 bg-green-50',
  payment_failed: 'text-red-600 bg-red-50',
  refund_processed: 'text-amber-600 bg-amber-50',
  payout_processed: 'text-green-600 bg-green-50',
  dispute_raised: 'text-red-600 bg-red-50',
  dispute_resolved: 'text-blue-600 bg-blue-50',
  deposit_requested: 'text-blue-600 bg-blue-50',
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  const diffHr = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHr / 24)

  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function getActorName(activity: JobActivity, currentUserId: string): string {
  if (activity.actor_id === currentUserId) return 'You'
  if (activity.actor?.full_name) return activity.actor.full_name
  if (activity.actor?.business_name) return activity.actor.business_name
  if (activity.actor?.email) return activity.actor.email
  return 'Someone'
}

export function JobActivityTimeline({ activities, loading, error, currentUserId }: JobActivityTimelineProps) {
  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>
  }

  if (activities.length === 0) {
    return <p className="text-sm text-neutral-400">No activity yet.</p>
  }

  const reversed = [...activities].reverse()

  return (
    <div className="space-y-1">
      {reversed.map((activity, idx) => {
        const iconPath = ACTIVITY_ICONS[activity.activity_type]
        const iconColor = ACTIVITY_ICON_COLORS[activity.activity_type]
        const actorName = getActorName(activity, currentUserId)
        const label = ACTIVITY_TYPE_LABELS[activity.activity_type]
        const isLast = idx === reversed.length - 1

        return (
          <div key={activity.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${iconColor}`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={iconPath} />
                </svg>
              </div>
              {!isLast && <div className="w-px flex-1 bg-neutral-200 mt-1" />}
            </div>
            <div className={`flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium text-neutral-900">{actorName}</span>
                <span className="text-sm text-neutral-500">{label}</span>
              </div>
              {activity.detail && (
                <p className="text-sm text-neutral-600 mt-0.5">{activity.detail}</p>
              )}
              <p className="text-xs text-neutral-400 mt-0.5">{formatRelativeTime(activity.created_at)}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
