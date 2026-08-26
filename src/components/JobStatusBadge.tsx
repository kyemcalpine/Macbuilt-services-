import type { JobStatus } from '../types'
import { JOB_STATUS_LABELS } from '../types'

const statusStyles: Record<JobStatus, string> = {
  open: 'bg-blue-100 text-blue-700',
  assigned: 'bg-accent-100 text-accent-700',
  in_progress: 'bg-primary-100 text-primary-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-neutral-200 text-neutral-600',
}

interface JobStatusBadgeProps {
  status: JobStatus
  size?: 'sm' | 'md'
  awaitingConfirmation?: boolean
}

export function JobStatusBadge({ status, size = 'sm', awaitingConfirmation = false }: JobStatusBadgeProps) {
  const sizeClasses = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'

  if (awaitingConfirmation) {
    return (
      <span
        className={`inline-flex items-center rounded-full font-medium ${sizeClasses} bg-amber-100 text-amber-700`}
      >
        Awaiting Confirmation
      </span>
    )
  }

  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${statusStyles[status]}`}
    >
      {JOB_STATUS_LABELS[status]}
    </span>
  )
}
