import { useState, FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import type { ResponseType } from '../types'

interface QuoteFormProps {
  jobId: string
  responseType: ResponseType
  onSubmitted: () => void
  onCancel: () => void
}

interface FormData {
  amount: string
  message: string
  notes: string
  estimated_start_date: string
  estimated_duration: string
}

export function QuoteForm({ jobId, responseType, onSubmitted, onCancel }: QuoteFormProps) {
  const isQuote = responseType === 'quote'
  const [form, setForm] = useState<FormData>({
    amount: '',
    message: '',
    notes: '',
    estimated_start_date: '',
    estimated_duration: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({})

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {}

    if (isQuote) {
      if (!form.amount.trim()) {
        errors.amount = 'Quote amount is required'
      } else {
        const num = parseFloat(form.amount)
        if (isNaN(num) || num <= 0) errors.amount = 'Amount must be a positive number'
      }
    }

    if (!form.message.trim()) {
      errors.message = isQuote ? 'A message is required' : 'Please add a brief message expressing your interest'
    }

    if (form.estimated_start_date) {
      const d = new Date(form.estimated_start_date)
      if (isNaN(d.getTime())) errors.estimated_start_date = 'Invalid date'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validate()) return

    setLoading(true)

    const payload = {
      job_id: jobId,
      response_type: responseType,
      amount: isQuote ? parseFloat(form.amount) : null,
      message: form.message.trim(),
      notes: form.notes.trim() || null,
      estimated_start_date: form.estimated_start_date || null,
      estimated_duration: form.estimated_duration.trim() || null,
      status: 'pending' as const,
    }

    const { error: insertError } = await supabase
      .from('job_quotes')
      .insert(payload)

    if (insertError) {
      if (insertError.code === '23505') {
        setError('You already have an active response on this job. Withdraw it first if you want to submit a new one.')
      } else {
        setError('Could not submit your response. Please try again.')
      }
      setLoading(false)
      return
    }

    setLoading(false)
    onSubmitted()
  }

  const inputClass = (field: keyof FormData) =>
    `input ${fieldErrors[field] ? 'border-red-500' : ''}`

  return (
    <form onSubmit={handleSubmit} className="card p-6 space-y-4">
      <h3 className="font-semibold text-neutral-900">
        {isQuote ? 'Submit Your Quote' : 'Express Interest'}
      </h3>

      {error && <div className="alert-error">{error}</div>}

      {isQuote && (
        <div>
          <label className="label">Quote Amount (AUD) <span className="text-red-500">*</span></label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            required
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            className={inputClass('amount')}
            placeholder="e.g. 450.00"
          />
          {fieldErrors.amount && <p className="text-sm text-red-600 mt-1">{fieldErrors.amount}</p>}
        </div>
      )}

      <div>
        <label className="label">
          {isQuote ? 'Message to Customer' : 'Message'} <span className="text-red-500">*</span>
        </label>
        <textarea
          required
          rows={3}
          value={form.message}
          onChange={(e) => update('message', e.target.value)}
          className={inputClass('message')}
          placeholder={isQuote ? 'Describe your quote and approach...' : 'Let the customer know why you are interested...'}
        />
        {fieldErrors.message && <p className="text-sm text-red-600 mt-1">{fieldErrors.message}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Estimated Start Date (optional)</label>
          <input
            type="datetime-local"
            value={form.estimated_start_date}
            onChange={(e) => update('estimated_start_date', e.target.value)}
            className={inputClass('estimated_start_date')}
          />
          {fieldErrors.estimated_start_date && <p className="text-sm text-red-600 mt-1">{fieldErrors.estimated_start_date}</p>}
        </div>
        <div>
          <label className="label">Estimated Duration (optional)</label>
          <input
            type="text"
            value={form.estimated_duration}
            onChange={(e) => update('estimated_duration', e.target.value)}
            className={inputClass('estimated_duration')}
            placeholder="e.g. 2 days"
          />
        </div>
      </div>

      <div>
        <label className="label">Notes (optional)</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => update('notes', e.target.value)}
          className={inputClass('notes')}
          placeholder="Any additional notes..."
        />
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'Submitting...' : isQuote ? 'Submit Quote' : 'Express Interest'}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={loading}>
          Cancel
        </button>
      </div>
    </form>
  )
}
