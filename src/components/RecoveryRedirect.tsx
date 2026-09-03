import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function RecoveryRedirect() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathnameRef = useRef(location.pathname)

  pathnameRef.current = location.pathname

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && pathnameRef.current !== '/reset-password') {
        navigate('/reset-password', { replace: true })
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [navigate])

  return null
}
