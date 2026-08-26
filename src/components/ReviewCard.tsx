import { StarRating } from './StarRating'
import type { JobReview } from '../types'

interface ReviewCardProps {
  review: JobReview
  showJobTitle?: boolean
}

export function ReviewCard({ review, showJobTitle = false }: ReviewCardProps) {
  const reviewerName = review.reviewer?.full_name || review.reviewer?.email || 'Anonymous'
  const formattedDate = new Date(review.created_at).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

  return (
    <div className="border border-neutral-200 rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-2">
        <div>
          <p className="font-medium text-neutral-900">{reviewerName}</p>
          {showJobTitle && review.job?.title && (
            <p className="text-sm text-neutral-500 mt-0.5">on "{review.job.title}"</p>
          )}
        </div>
        <span className="text-xs text-neutral-400 flex-shrink-0">{formattedDate}</span>
      </div>
      <StarRating value={review.rating} size="sm" />
      {review.comment && (
        <p className="text-sm text-neutral-700 mt-2 whitespace-pre-wrap">{review.comment}</p>
      )}
    </div>
  )
}
