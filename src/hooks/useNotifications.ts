import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { AppNotification } from '../types'

export function useNotifications() {
  const { profile } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const fetchNotifications = useCallback(async () => {
    if (!profile) return
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(30)
    setNotifications((data || []) as AppNotification[])
    setUnreadCount((data || []).filter((n) => !n.read_at).length)
    setLoading(false)
  }, [profile])

  useEffect(() => {
    if (!profile) return
    fetchNotifications()

    const channel = supabase
      .channel('notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as AppNotification, ...prev].slice(0, 30))
          setUnreadCount((prev) => prev + 1)
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        () => fetchNotifications()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile, fetchNotifications])

  const markAsRead = useCallback(async (notificationId: string) => {
    await supabase.rpc('mark_notification_read', { p_notification_id: notificationId })
    fetchNotifications()
  }, [fetchNotifications])

  const markAllAsRead = useCallback(async () => {
    await supabase.rpc('mark_all_notifications_read')
    fetchNotifications()
  }, [fetchNotifications])

  return { notifications, unreadCount, loading, markAsRead, markAllAsRead, refetch: fetchNotifications }
}
