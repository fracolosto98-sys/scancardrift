import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import App from './App'
import { ToastProvider } from './state'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><ToastProvider><App /></ToastProvider></HashRouter></React.StrictMode>
)
