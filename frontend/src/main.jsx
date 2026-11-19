import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import LegalPage from './components/LegalPage.jsx'

// Simple routing: /privacy and /terms are public pages; everything else is the app.
const path = window.location.pathname.replace(/\/+$/, '')
let page = <App />
if (path === '/privacy') page = <LegalPage kind="privacy" />
else if (path === '/terms') page = <LegalPage kind="terms" />

try {
  const theme = localStorage.getItem('safeinbox.theme')
  if (theme === 'dark') document.documentElement.classList.add('dark')
} catch {
  // storage unavailable - keep the default light theme
}

createRoot(document.getElementById('root')).render(<StrictMode>{page}</StrictMode>)
