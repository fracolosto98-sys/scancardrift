import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { ensureCatalog } from './lib'
import Home from './pages/Home'
import Scan from './pages/Scan'
import Search from './pages/Search'
import CardPage from './pages/CardPage'
import Favorites from './pages/Favorites'
import Decks, { DeckPage } from './pages/Decks'

const tabs = [['/', 'Inicio'], ['/buscar', 'Buscar'], ['/escanear', 'Escanear'], ['/mazos', 'Mazos'], ['/favoritos', 'Favoritos']]

export default function App() {
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ensureCatalog()
      .then(() => setState('ok'))
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Error desconocido')
        setState('error')
      })
  }, [])

  if (state === 'loading') return <p className="p-8 muted">Preparando el catálogo…</p>
  if (state === 'error') return (
    <><p className="text-sm muted mt-2">{error}</p><div className="p-8"><p>No se pudo cargar el catálogo. Comprueba tu conexión.</p>
      <button className="btn mt-4" onClick={() => location.reload()}>Reintentar</button></div></>
  )
  return (
    <div className="mx-auto max-w-md min-h-dvh pb-24">
      <main className="p-4"><Routes>
        <Route path="/" element={<Home />} />
        <Route path="/escanear" element={<Scan />} />
        <Route path="/buscar" element={<Search />} />
        <Route path="/favoritos" element={<Favorites />} />
        <Route path="/carta/:id" element={<CardPage />} />
        <Route path="/mazos" element={<Decks />} />
        <Route path="/mazos/:id" element={<DeckPage />} />
      </Routes></main>
      <nav className="card fixed bottom-3 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-md flex justify-around p-2 text-sm">
        {tabs.map(([to, label]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `px-2 py-2 rounded-xl ${isActive ? 'bg-[var(--rift)] text-white' : 'muted'}`}>{label}</NavLink>
        ))}
      </nav>
    </div>
  )
}
