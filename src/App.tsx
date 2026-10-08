import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useLocation, useNavigationType } from 'react-router'
import { hasCatalog, syncAll } from './lib'
import { initCloud } from './lib/cloud'
import { CatalogProvider, useToast } from './state'
import Icon, { type IconName } from './components/Icon'
import { ErrorBoundary } from './components/bits'
import Home from './pages/Home'
import Search from './pages/Search'
import CardPage from './pages/CardPage'
import Collection from './pages/Collection'
import Decks, { DeckPage } from './pages/Decks'
import Settings from './pages/Settings'

const Scan = lazy(() => import('./pages/Scan')) // arrastra el OCR: solo se carga al escanear

const tabs: [string, string, IconName][] = [
  ['/', 'Inicio', 'home'], ['/buscar', 'Buscar', 'search'], ['/escanear', 'Escanear', 'scan'],
  ['/coleccion', 'Colección', 'collection'], ['/mazos', 'Mazos', 'decks'],
]
const Loading = () => <p className="p-8 muted">Cargando…</p>

export default function App() {
  const [boot, setBoot] = useState<'checking' | 'syncing' | 'ready' | 'error'>('checking')
  const [error, setError] = useState('')
  const toast = useToast()

  function start() {
    setBoot('syncing')
    syncAll().then(() => setBoot('ready'), err => { setError(err instanceof Error ? err.message : String(err)); setBoot('error') })
  }

  useEffect(() => {
    initCloud()
    // Con catálogo guardado la app abre al instante (también sin conexión) y actualiza en segundo plano.
    hasCatalog().then(has => {
      if (!has) return start()
      setBoot('ready')
      syncAll().then(errs => { if (errs.length && !navigator.onLine) toast('Sin conexión: usando los datos guardados') }, () => {})
    })
  }, [])

  if (boot === 'checking') return null
  if (boot === 'syncing') return <p className="p-8 muted">Descargando el catálogo de cartas…</p>
  if (boot === 'error') return (
    <div className="p-8 space-y-3 max-w-md mx-auto">
      <p className="font-semibold">No se pudo descargar el catálogo.</p>
      <p className="text-sm muted">Comprueba tu conexión. ({error})</p>
      <button className="btn" onClick={start}>Reintentar</button>
    </div>
  )
  return (
    <CatalogProvider fallback={<Loading />}>
      <ScrollToTop />
      <div className="mx-auto max-w-md min-h-dvh pb-28">
        <main className="p-4">
          <ErrorBoundary>
            <Suspense fallback={<Loading />}>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/escanear" element={<Scan />} />
                <Route path="/buscar" element={<Search />} />
                <Route path="/coleccion" element={<Collection />} />
                <Route path="/favoritos" element={<Navigate to="/coleccion?ver=favoritos" replace />} />
                <Route path="/carta/:id" element={<CardPage />} />
                <Route path="/mazos" element={<Decks />} />
                <Route path="/mazos/:id" element={<DeckPage />} />
                <Route path="/ajustes" element={<Settings />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
        <nav aria-label="Principal" className="card fixed left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md flex justify-around p-1.5 text-[11px] z-40"
          style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}>
          {tabs.map(([to, label, icon]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-1.5 rounded-xl ${isActive ? 'bg-[var(--rift)] text-white' : 'muted'}`}>
              <Icon name={icon} />{label}
            </NavLink>
          ))}
        </nav>
      </div>
    </CatalogProvider>
  )
}

/** Al navegar a otra pantalla, empezar arriba; al volver atrás, el navegador restaura la posición. */
function ScrollToTop() {
  const { pathname } = useLocation()
  const type = useNavigationType()
  useEffect(() => { if (type !== 'POP') window.scrollTo(0, 0) }, [pathname, type])
  return null
}

function NotFound() {
  return (
    <div className="card p-4 space-y-3">
      <p>Esta página no existe.</p>
      <Link to="/" className="btn">Ir al inicio</Link>
    </div>
  )
}
