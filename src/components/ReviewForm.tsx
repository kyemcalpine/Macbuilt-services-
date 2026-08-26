import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { StarRating } from './StarRating'

interface ReviewFormProps {
  jobId: string
  onSubmitted: () => void
  onCancel: () => void
}

export function ReviewForm({ jobId, onSubmitted, onCancel }: ReviewFormProps) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (rating < 1) {
      setError('Please select a star rating.')
      return
    }

    setSubmitting(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('create_review', {
      p_job_id: jobId,
      p_rating: rating,
      p_comment: comment.trim() || null,
    })

    if (rpcError) {
      setError(rpcError.message || 'Could not submit your review. Please try again.')
      setSubmitting(false)
      return
    }

    setSubmitting(false)
    onSubmitted()
  }

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-neutral-900 mb-4">Leave a Review</h3>

      {error && <div className="alert-error mb-4">{error}</div>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Rating</label>
          <div className="mt-1">
            <StarRating value={rating} interactive onChange={setRating} size="lg" />
          </div>
        </div>

        <div>
          <label className="label">Comment (optional)</label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={4}
            className="input resize-none"
            placeholder="Share your experience..."
          />
          <p className="text-xs text-neutral-400 mt-1 text-right">{comment.length}/1000</p>
        </div>

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={submitting || rating < 1}
            className="btn-primary"
          >
            {submitting ? 'Submitting...' : 'Submit Review'}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
