import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function RecoveryRedirect() {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      // TEMPORARY DIAGNOSTIC LOGGING
      console.warn('[DIAG] RecoveryRedirect onAuthStateChange', {
        event,
        pathname: location.pathname,
        timestamp: new Date().toISOString(),
      })
      if (event === 'PASSWORD_RECOVERY' && location.pathname !== '/reset-password') {
        navigate('/reset-password', { replace: true })
      }
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [navigate, location.pathname])

  return null
}
