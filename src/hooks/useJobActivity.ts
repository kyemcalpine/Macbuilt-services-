import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type { JobActivity } from '../types'

export function useJobActivity(jobId: string | undefined) {
  const [activities, setActivities] = useState<JobActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const fetchActivities = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    setError('')

    const { data, error: fetchError } = await supabase
      .from('job_activity')
      .select(`
        *,
        actor:profiles!job_activity_actor_id_fkey (
          id, full_name, email, role, business_name
        )
      `)
      .eq('job_id', jobId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError('Could not load activity.')
      setLoading(false)
      return
    }

    setActivities((data || []) as JobActivity[])
    setLoading(false)
  }, [jobId])

  useEffect(() => {
    if (!jobId) return
    fetchActivities()

    const channel = supabase
      .channel(`job_activity:${jobId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'job_activity', filter: `job_id=eq.${jobId}` },
        () => fetchActivities()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [jobId, fetchActivities])

  return { activities, loading, error, refetch: fetchActivities }
}
