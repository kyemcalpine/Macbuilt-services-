import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function HomePage() {
  const { session, profile } = useAuth()

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary-700 via-primary-600 to-primary-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <h1 className="text-4xl md:text-5xl font-bold leading-tight mb-6">
              Find trusted tradies across Australia
            </h1>
            <p className="text-lg md:text-xl text-primary-100 mb-8 leading-relaxed">
              Post your job, receive competitive quotes from verified service providers, and hire with confidence. From plumbing to painting, we connect you with the right tradie for the job.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              {session ? (
                <Link to="/dashboard" className="btn-accent text-base px-8 py-3">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="btn-accent text-base px-8 py-3">
                    Get Started — It's Free
                  </Link>
                  <Link to="/signin" className="btn bg-white/10 backdrop-blur text-white border border-white/30 hover:bg-white/20 text-base px-8 py-3">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-neutral-900 mb-4">How Macbuilt Works</h2>
          <p className="text-lg text-neutral-600">A simple, transparent process from start to finish</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="card p-8 text-center hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Post Your Job</h3>
            <p className="text-neutral-600">Tell us what you need done. It takes less than two minutes and it's completely free.</p>
          </div>
          <div className="card p-8 text-center hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-full bg-accent-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Compare Quotes</h3>
            <p className="text-neutral-600">Receive quotes from verified tradies, compare prices and reviews, and pick the right one for you.</p>
          </div>
          <div className="card p-8 text-center hover:shadow-md transition-shadow">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-7 h-7 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold mb-2">Hire with Confidence</h3>
            <p className="text-neutral-600">Pay securely through the platform, message your tradie, and leave a review when the job's done.</p>
          </div>
        </div>
      </section>

      {/* CTA */}
      {!session && (
        <section className="bg-neutral-900 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
            <h2 className="text-3xl font-bold mb-4">Ready to get started?</h2>
            <p className="text-lg text-neutral-300 mb-8">Join thousands of customers and tradies on Macbuilt Services today.</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/signup" className="btn-accent text-base px-8 py-3">
                Sign Up as a Customer
              </Link>
              <Link to="/signup" className="btn bg-white/10 backdrop-blur text-white border border-white/30 hover:bg-white/20 text-base px-8 py-3">
                Join as a Tradie
              </Link>
            </div>
          </div>
        </section>
      )}

      {session && profile?.role === 'tradie' && profile.verification_status === 'pending' && (
        <section className="bg-accent-50 border-t border-accent-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 text-center">
            <p className="text-accent-800 font-medium">
              Your tradie account is pending admin approval. You'll be able to submit quotes once approved.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
