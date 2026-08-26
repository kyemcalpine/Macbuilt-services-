export function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-300 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 3L3 9v12h6v-6h6v6h6V9z" />
                </svg>
              </div>
              <span className="text-lg font-bold text-white">Macbuilt</span>
            </div>
            <p className="text-sm text-neutral-400">
              Australia's trusted marketplace connecting customers with quality tradies and service providers.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">For Customers</h4>
            <ul className="space-y-2 text-sm">
              <li>Post a Job</li>
              <li>Browse Tradies</li>
              <li>Get Quotes</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">For Tradies</h4>
            <ul className="space-y-2 text-sm">
              <li>Create Profile</li>
              <li>Browse Jobs</li>
              <li>Submit Quotes</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-white mb-3">Company</h4>
            <ul className="space-y-2 text-sm">
              <li>About Us</li>
              <li>How It Works</li>
              <li>Contact</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-neutral-800 mt-8 pt-8 text-center text-sm text-neutral-500">
          &copy; {new Date().getFullYear()} Macbuilt Services. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
