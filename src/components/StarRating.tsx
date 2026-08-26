import { useState } from 'react'
import { STAR_RATINGS } from '../types'

interface StarRatingProps {
  value: number
  interactive?: boolean
  onChange?: (value: number) => void
  size?: 'sm' | 'md' | 'lg'
  showNumber?: boolean
}

const sizeClasses: Record<string, string> = {
  sm: 'w-4 h-4',
  md: 'w-5 h-5',
  lg: 'w-7 h-7',
}

export function StarRating({ value, interactive = false, onChange, size = 'md', showNumber = false }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState(0)
  const displayValue = hoverValue || value

  return (
    <div className="flex items-center gap-0.5">
      {STAR_RATINGS.map((star) => {
        const isFilled = star <= displayValue
        return (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && onChange?.(star)}
            onMouseEnter={() => interactive && setHoverValue(star)}
            onMouseLeave={() => interactive && setHoverValue(0)}
            className={interactive ? 'cursor-pointer p-0.5 rounded transition-transform hover:scale-110' : 'cursor-default'}
            aria-label={`${star} star${star > 1 ? 's' : ''}`}
          >
            <svg
              className={`${sizeClasses[size]} ${isFilled ? 'text-amber-400' : 'text-neutral-300'} transition-colors`}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </button>
        )
      })}
      {showNumber && (
        <span className="ml-1.5 text-sm font-medium text-neutral-600">
          {value > 0 ? value.toFixed(1) : 'No rating'}
        </span>
      )}
    </div>
  )
}
