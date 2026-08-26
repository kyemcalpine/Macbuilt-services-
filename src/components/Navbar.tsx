import { Link, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export function Navbar() {
  const { session, profile } = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-40">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 3L3 9v12h6v-6h6v6h6V9z" />
              </svg>
            </div>
            <span className="text-lg font-bold text-neutral-900">Macbuilt</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link to="/" className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
              Home
            </Link>
            {session && (
              <Link to="/dashboard" className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
                Dashboard
              </Link>
            )}
            {session && (
              <Link to="/jobs" className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
                Jobs
              </Link>
            )}
            {session && (
              <Link to="/profile" className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
                Profile
              </Link>
            )}
            {profile?.role === 'admin' && (
              <Link to="/admin" className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
                Admin
              </Link>
            )}

            {session ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-neutral-500">
                  {profile?.full_name || profile?.email}
                </span>
                <button onClick={handleSignOut} className="btn-secondary text-sm">
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link to="/signin" className="btn-secondary text-sm">
                  Sign In
                </Link>
                <Link to="/signup" className="btn-primary text-sm">
                  Sign Up
                </Link>
              </div>
            )}
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-neutral-100"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Menu"
          >
            <svg className="w-6 h-6 text-neutral-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-neutral-200 py-4 space-y-3">
            <Link to="/" className="block text-sm font-medium text-neutral-600 hover:text-primary-600" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            {session ? (
              <>
                <Link to="/dashboard" className="block text-sm font-medium text-neutral-600 hover:text-primary-600" onClick={() => setMenuOpen(false)}>
                  Dashboard
                </Link>
                <Link to="/jobs" className="block text-sm font-medium text-neutral-600 hover:text-primary-600" onClick={() => setMenuOpen(false)}>
                  Jobs
                </Link>
                <Link to="/profile" className="block text-sm font-medium text-neutral-600 hover:text-primary-600" onClick={() => setMenuOpen(false)}>
                  Profile
                </Link>
                {profile?.role === 'admin' && (
                  <Link to="/admin" className="block text-sm font-medium text-neutral-600 hover:text-primary-600" onClick={() => setMenuOpen(false)}>
                    Admin
                  </Link>
                )}
                <button onClick={handleSignOut} className="btn-secondary w-full text-sm">
                  Sign Out
                </button>
              </>
            ) : (
              <div className="flex gap-3">
                <Link to="/signin" className="btn-secondary flex-1 text-sm" onClick={() => setMenuOpen(false)}>
                  Sign In
                </Link>
                <Link to="/signup" className="btn-primary flex-1 text-sm" onClick={() => setMenuOpen(false)}>
                  Sign Up
                </Link>
              </div>
            )}
          </div>
        )}
      </nav>
    </header>
  )
}
