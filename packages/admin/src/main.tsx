import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import './styles/globals.css'
import App from './App.tsx'
import { ToasterWrap } from '@/shared/ui/custom/ToasterWrap'

window.React = React
window.PlankAddonAdminModules = window.PlankAddonAdminModules ?? {}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <App />
      <ToasterWrap />
    </ThemeProvider>
  </React.StrictMode>
)
