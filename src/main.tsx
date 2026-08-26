import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// TEMPORARY DIAGNOSTIC LOGGING — remove after debugging is complete
window.addEventListener('hashchange', (e) => {
  console.warn('[DIAG] hashchange', {
    oldURL: e.oldURL,
    newURL: e.newURL,
    currentHash: window.location.hash,
    timestamp: new Date().toISOString(),
    stack: new Error().stack,
  })
})

window.addEventListener('popstate', (e) => {
  console.warn('[DIAG] popstate', {
    hash: window.location.hash,
    timestamp: new Date().toISOString(),
    state: e.state,
  })
})

// Log every second to track timing
let _diagSeconds = 0
const _diagInterval = setInterval(() => {
  _diagSeconds++
  console.log(`[DIAG] ${_diagSeconds}s hash=${window.location.hash}`)
  if (_diagSeconds >= 30) {
    clearInterval(_diagInterval)
  }
}, 1000)

// End of temporary diagnostic logging

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
