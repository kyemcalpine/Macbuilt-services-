import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { JobForm } from '../components/JobForm'
import type { Job } from '../types'

export function JobEditPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchJob = async () => {
      const { data, error: fetchError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (fetchError) {
        setError('Could not load this job.')
        setLoading(false)
        return
      }

      if (!data) {
        setError('Job not found.')
        setLoading(false)
        return
      }

      setJob(data as Job)
      setLoading(false)
    }

    fetchJob()
  }, [id])

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !job) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12">
        <div className="alert-error">{error || 'An error occurred.'}</div>
      </div>
    )
  }

  return <JobForm job={job} />
}
