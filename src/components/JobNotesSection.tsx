import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { JobNote } from '../types'

interface JobNotesSectionProps {
  jobId: string
  canAddNote: boolean
}

export function JobNotesSection({ jobId, canAddNote }: JobNotesSectionProps) {
  const { profile } = useAuth()
  const [notes, setNotes] = useState<JobNote[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [newNote, setNewNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const fetchNotes = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('job_notes')
      .select(`
        *,
        author:profiles!job_notes_author_id_fkey (
          id, email, full_name, role, business_name
        )
      `)
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError('Could not load notes.')
      setLoading(false)
      return
    }

    setNotes((data || []) as JobNote[])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleAddNote = async () => {
    if (!newNote.trim() || !profile) return
    setSubmitting(true)
    setError('')

    const { error: insertError } = await supabase
      .from('job_notes')
      .insert({
        job_id: jobId,
        author_id: profile.id,
        note: newNote.trim(),
      })

    if (insertError) {
      setError('Could not add note. You may not have permission to add notes to this job.')
      setSubmitting(false)
      return
    }

    setNewNote('')
    setSubmitting(false)
    fetchNotes()
  }

  const formatDateTime = (dateStr: string) =>
    new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  const roleBadgeColor = (role: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-700'
    if (role === 'tradie') return 'bg-accent-100 text-accent-700'
    return 'bg-primary-100 text-primary-700'
  }

  if (loading) {
    return (
      <div className="card p-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Job Notes</h3>
        <div className="flex justify-center py-6">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <h3 className="font-semibold text-neutral-900 mb-4">Job Notes</h3>

      {error && <div className="alert-error mb-4">{error}</div>}

      {notes.length === 0 ? (
        <p className="text-neutral-400 text-sm mb-4">No notes yet.</p>
      ) : (
        <div className="space-y-4 mb-6">
          {notes.map((note) => (
            <div key={note.id} className="border-l-4 border-primary-200 pl-4 py-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-medium text-neutral-900">
                  {note.author?.full_name || note.author?.email || 'Unknown'}
                </span>
                {note.author?.role && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleBadgeColor(note.author.role)}`}>
                    {note.author.role}
                  </span>
                )}
                {note.author?.business_name && (
                  <span className="text-xs text-neutral-400">{note.author.business_name}</span>
                )}
                <span className="text-xs text-neutral-400 ml-auto">{formatDateTime(note.created_at)}</span>
              </div>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap">{note.note}</p>
            </div>
          ))}
        </div>
      )}

      {canAddNote && (
        <div className="space-y-3">
          <textarea
            rows={2}
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            className="input"
            placeholder="Add a note for this job..."
          />
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || submitting}
            className="btn-secondary text-sm"
          >
            {submitting ? 'Adding...' : 'Add Note'}
          </button>
        </div>
      )}
    </div>
  )
}
