import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import type { Message } from '../types'

export function useConversationMessages(conversationId: string | undefined) {
  const { profile } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const markedRef = useRef(false)

  const fetchMessages = useCallback(async () => {
    if (!conversationId) return
    const { data, error: fetchError } = await supabase
      .from('messages')
      .select(`
        *,
        sender:profiles!messages_sender_id_fkey (
          id, email, full_name, role, business_name
        )
      `)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (fetchError) {
      setError('Could not load messages.')
      setLoading(false)
      return
    }

    setMessages((data || []) as Message[])
    setLoading(false)
  }, [conversationId])

  const markAsRead = useCallback(async () => {
    if (!conversationId || !profile) return
    await supabase.rpc('mark_messages_read', { p_conversation_id: conversationId })
  }, [conversationId, profile])

  useEffect(() => {
    if (!conversationId) return
    setLoading(true)
    markedRef.current = false
    fetchMessages()

    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, fetchMessages])

  const sendMessage = useCallback(async (body: string) => {
    if (!conversationId || !body.trim()) return false
    const { error: insertError } = await supabase
      .from('messages')
      .insert({ conversation_id: conversationId, body: body.trim() })
    if (insertError) return false
    return true
  }, [conversationId])

  return { messages, loading, error, sendMessage, markAsRead, refetch: fetchMessages }
}
