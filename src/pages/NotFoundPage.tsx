import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-24 text-center">
      <p className="text-6xl font-bold text-primary-600 mb-4">404</p>
      <h1 className="text-2xl font-semibold text-neutral-900 mb-3">Page Not Found</h1>
      <p className="text-neutral-600 mb-8">
        The page you're looking for doesn't exist or may have been moved.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link to="/" className="btn-primary">Go Home</Link>
        <Link to="/dashboard" className="btn-secondary">Dashboard</Link>
        <Link to="/jobs" className="btn-secondary">Jobs</Link>
      </div>
    </div>
  )
}
