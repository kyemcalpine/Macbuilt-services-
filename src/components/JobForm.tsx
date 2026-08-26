import { useState, FormEvent, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { AUSTRALIAN_STATES, TRADE_CATEGORIES } from '../types'
import type { Job, QuotePreference, JobAttachment } from '../types'
import { PhotoUploader } from './PhotoUploader'
import { PhotoGallery } from './PhotoGallery'

interface JobFormProps {
  job?: Job
}

interface FormData {
  title: string
  description: string
  trade_category: string
  budget: string
  quote_preference: QuotePreference
  scheduled_date: string
  address_line1: string
  address_line2: string
  suburb: string
  state: string
  postcode: string
  notes: string
}

export function JobForm({ job }: JobFormProps) {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isEdit = !!job

  const [form, setForm] = useState<FormData>({
    title: job?.title || '',
    description: job?.description || '',
    trade_category: job?.trade_category || '',
    budget: job?.budget != null ? String(job.budget) : '',
    quote_preference: job?.quote_preference || 'open_to_quotes',
    scheduled_date: job?.scheduled_date ? job.scheduled_date.slice(0, 16) : '',
    address_line1: job?.address_line1 || '',
    address_line2: job?.address_line2 || '',
    suburb: job?.suburb || '',
    state: job?.state || '',
    postcode: job?.postcode || '',
    notes: job?.notes || '',
  })

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [attachments, setAttachments] = useState<JobAttachment[]>([])

  const fetchAttachments = async () => {
    if (!job) return
    const { data } = await supabase
      .from('job_attachments')
      .select(`
        *,
        uploader:profiles!job_attachments_uploaded_by_fkey (
          id, full_name, email, role
        )
      `)
      .eq('job_id', job.id)
      .order('created_at', { ascending: true })
    if (data) setAttachments(data as JobAttachment[])
  }

  const handleDeleteAttachment = async (attachmentId: string, storagePath: string) => {
    const { error: rpcError } = await supabase.rpc('delete_job_attachment', { p_attachment_id: attachmentId })
    if (rpcError) return
    await supabase.storage.from('job-attachments').remove([storagePath])
    fetchAttachments()
  }

  useEffect(() => {
    fetchAttachments()
  }, [job?.id])

  const update = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const validate = (): boolean => {
    const errors: Partial<Record<keyof FormData, string>> = {}

    if (!form.title.trim()) errors.title = 'Title is required'
    if (!form.description.trim()) errors.description = 'Description is required'
    if (!form.trade_category) errors.trade_category = 'Please select a trade category'

    if (form.budget) {
      const budgetNum = parseFloat(form.budget)
      if (isNaN(budgetNum) || budgetNum < 0) errors.budget = 'Budget must be a positive number'
    }

    if (form.scheduled_date) {
      const d = new Date(form.scheduled_date)
      if (isNaN(d.getTime())) {
        errors.scheduled_date = 'Invalid date'
      } else if (d.getTime() < Date.now() - 60000) {
        errors.scheduled_date = 'Scheduled date must be in the future'
      }
    }

    if (form.postcode && !/^\d{4}$/.test(form.postcode)) {
      errors.postcode = 'Australian postcodes are 4 digits'
    }

    if ((form.suburb || form.postcode || form.state) && !form.address_line1?.trim()) {
      errors.address_line1 = 'Street address is required when suburb or postcode is provided'
    }

    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')

    if (!validate()) return

    setLoading(true)

    const payload: Record<string, unknown> = {
      title: form.title.trim(),
      description: form.description.trim(),
      trade_category: form.trade_category,
      budget: form.budget ? parseFloat(form.budget) : null,
      quote_preference: form.quote_preference,
      scheduled_date: form.scheduled_date || null,
      address_line1: form.address_line1.trim() || null,
      address_line2: form.address_line2.trim() || null,
      suburb: form.suburb.trim() || null,
      state: form.state || null,
      postcode: form.postcode.trim() || null,
      notes: form.notes.trim() || null,
    }

    if (isEdit && job) {
      const { error: updateError } = await supabase
        .from('jobs')
        .update(payload)
        .eq('id', job.id)

      if (updateError) {
        setError('Could not save the job. Please try again.')
        setLoading(false)
        return
      }
      navigate(`/jobs/${job.id}`)
    } else {
      const { data, error: insertError } = await supabase
        .from('jobs')
        .insert(payload)
        .select('id')
        .single()

      if (insertError || !data) {
        setError('Could not create the job. Please try again.')
        setLoading(false)
        return
      }
      navigate(`/jobs/${data.id}`)
    }
  }

  if (!profile) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">Could not load your profile. Please try refreshing the page.</div>
      </div>
    )
  }

  const inputClass = (field: keyof FormData) =>
    `input ${fieldErrors[field] ? 'border-red-500' : ''}`

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-neutral-900 mb-2">
          {isEdit ? 'Edit Job' : 'Post a New Job'}
        </h1>
        <p className="text-neutral-600">
          {isEdit ? 'Update the details of your job' : 'Tell tradies what you need done'}
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="card p-6 space-y-4">
        <div>
          <label className="label">Job Title</label>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className={inputClass('title')}
            placeholder="e.g. Kitchen tap replacement"
          />
          {fieldErrors.title && <p className="text-sm text-red-600 mt-1">{fieldErrors.title}</p>}
        </div>

        <div>
          <label className="label">Description</label>
          <textarea
            required
            rows={4}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            className={inputClass('description')}
            placeholder="Describe the work you need done..."
          />
          {fieldErrors.description && <p className="text-sm text-red-600 mt-1">{fieldErrors.description}</p>}
        </div>

        <div>
          <label className="label">Trade Category</label>
          <select
            required
            value={form.trade_category}
            onChange={(e) => update('trade_category', e.target.value)}
            className={inputClass('trade_category')}
          >
            <option value="">Select...</option>
            {TRADE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {fieldErrors.trade_category && <p className="text-sm text-red-600 mt-1">{fieldErrors.trade_category}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Budget (AUD, optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.budget}
              onChange={(e) => update('budget', e.target.value)}
              className={inputClass('budget')}
              placeholder="e.g. 500"
            />
            {fieldErrors.budget && <p className="text-sm text-red-600 mt-1">{fieldErrors.budget}</p>}
          </div>
          <div>
            <label className="label">Scheduled Date (optional)</label>
            <input
              type="datetime-local"
              value={form.scheduled_date}
              onChange={(e) => update('scheduled_date', e.target.value)}
              className={inputClass('scheduled_date')}
            />
            {fieldErrors.scheduled_date && <p className="text-sm text-red-600 mt-1">{fieldErrors.scheduled_date}</p>}
          </div>
        </div>

        <div>
          <label className="label">Quote Preference</label>
          <div className="flex gap-3 mt-1">
            <label className={`flex-1 cursor-pointer rounded-lg border p-3 transition-colors ${
              form.quote_preference === 'open_to_quotes'
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 hover:bg-neutral-50'
            }`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="quote_preference"
                  value="open_to_quotes"
                  checked={form.quote_preference === 'open_to_quotes'}
                  onChange={() => update('quote_preference', 'open_to_quotes')}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-900">Open to Quotes</span>
                  <p className="text-xs text-neutral-500 mt-0.5">Tradies can submit quotes with their proposed price</p>
                </div>
              </div>
            </label>
            <label className={`flex-1 cursor-pointer rounded-lg border p-3 transition-colors ${
              form.quote_preference === 'fixed_budget'
                ? 'border-primary-500 bg-primary-50'
                : 'border-neutral-300 hover:bg-neutral-50'
            }`}>
              <div className="flex items-start gap-2">
                <input
                  type="radio"
                  name="quote_preference"
                  value="fixed_budget"
                  checked={form.quote_preference === 'fixed_budget'}
                  onChange={() => update('quote_preference', 'fixed_budget')}
                  className="mt-1"
                />
                <div>
                  <span className="text-sm font-medium text-neutral-900">Fixed Budget / No Quotes</span>
                  <p className="text-xs text-neutral-500 mt-0.5">Tradies can express interest in your stated budget</p>
                </div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <h3 className="font-semibold text-neutral-900">Location</h3>

        <div>
          <label className="label">Street Address</label>
          <input
            type="text"
            value={form.address_line1}
            onChange={(e) => update('address_line1', e.target.value)}
            className={inputClass('address_line1')}
            placeholder="e.g. 123 Main Street"
          />
          {fieldErrors.address_line1 && <p className="text-sm text-red-600 mt-1">{fieldErrors.address_line1}</p>}
        </div>

        <div>
          <label className="label">Unit / Apt (optional)</label>
          <input
            type="text"
            value={form.address_line2}
            onChange={(e) => update('address_line2', e.target.value)}
            className={inputClass('address_line2')}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="label">Suburb</label>
            <input
              type="text"
              value={form.suburb}
              onChange={(e) => update('suburb', e.target.value)}
              className={inputClass('suburb')}
            />
          </div>
          <div>
            <label className="label">State</label>
            <select
              value={form.state}
              onChange={(e) => update('state', e.target.value)}
              className={inputClass('state')}
            >
              <option value="">Select...</option>
              {AUSTRALIAN_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Postcode</label>
            <input
              type="text"
              value={form.postcode}
              onChange={(e) => update('postcode', e.target.value)}
              className={inputClass('postcode')}
              maxLength={4}
            />
            {fieldErrors.postcode && <p className="text-sm text-red-600 mt-1">{fieldErrors.postcode}</p>}
          </div>
        </div>
      </div>

      <div className="card p-6 space-y-4">
        <div>
          <label className="label">Additional Notes (optional)</label>
          <textarea
            rows={3}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
            className={inputClass('notes')}
            placeholder="Any extra details for the tradie..."
          />
        </div>
      </div>

      {isEdit && job && job.status === 'open' && (
        <div className="card p-6 space-y-4">
          <h3 className="font-semibold text-neutral-900">Job Photos</h3>
          <p className="text-sm text-neutral-600">
            Upload photos so tradies can see the problem before submitting a quote.
          </p>
          {attachments.length > 0 && (
            <PhotoGallery
              attachments={attachments}
              currentUserId={profile.id}
              onDelete={handleDeleteAttachment}
            />
          )}
          <PhotoUploader
            jobId={job.id}
            attachmentType="job_photo"
            onUploaded={fetchAttachments}
            label="Add Job Photos"
          />
        </div>
      )}

      <div className="flex gap-4">
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'Saving...' : isEdit ? 'Save Changes' : 'Post Job'}
        </button>
        <button
          type="button"
          onClick={() => navigate(isEdit && job ? `/jobs/${job.id}` : '/jobs')}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
