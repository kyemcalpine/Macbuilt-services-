import type { QuoteStatus } from '../types'
import { QUOTE_STATUS_LABELS } from '../types'

const statusStyles: Record<QuoteStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-neutral-200 text-neutral-600',
  withdrawn: 'bg-neutral-100 text-neutral-400',
}

export function QuoteStatusBadge({ status, size = 'sm' }: { status: QuoteStatus; size?: 'sm' | 'md' }) {
  const sizeClasses = size === 'md' ? 'px-3 py-1 text-sm' : 'px-2.5 py-0.5 text-xs'
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${sizeClasses} ${statusStyles[status]}`}
    >
      {QUOTE_STATUS_LABELS[status]}
    </span>
  )
}
