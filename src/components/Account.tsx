import { useEffect, useState } from 'react'
import { deleteAccount, loginProviders, sendLoginEmail, signInWithGoogle, signOut, sync, verifyLoginCode } from '../lib/cloud'
import { useCloud, useToast } from '../state'

const ago = (ts: number) => {
  const s = Math.round((Date.now() - ts) / 1000)
  return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : new Date(ts).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })
}

/** Cuenta opcional: sin ella todo funciona igual, con ella los datos se sincronizan entre dispositivos. */
export default function Account() {
  const cloud = useCloud()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [google, setGoogle] = useState(false)
  const [withEmail, setWithEmail] = useState(false)
  useEffect(() => { loginProviders().then(p => setGoogle(p.google)) }, [])

  async function run(f: () => Promise<unknown>, ok?: string) {
    setBusy(true)
    try { await f(); if (ok) toast(ok) } catch (e) { toast((e as Error).message) }
    setBusy(false)
  }

  if (cloud.user) return (
    <section className="card p-4 space-y-3" aria-label="Cuenta">
      <h2 className="font-semibold">Cuenta</h2>
      <p className="text-sm">Has entrado como <b className="break-all">{cloud.user.email}</b>.</p>
      <p className={`text-sm ${cloud.status === 'error' ? 'text-[#e5484d]' : 'muted'}`} role="status">
        {cloud.status === 'syncing' ? 'Sincronizando…'
          : cloud.status === 'error' ? `No se pudo sincronizar: ${cloud.error}`
          : cloud.lastSync ? `Colección, favoritos y mazos sincronizados ${ago(cloud.lastSync)}.` : 'Pendiente de sincronizar.'}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <button className="btn btn-ghost" disabled={cloud.status === 'syncing'} onClick={() => sync()}>Sincronizar</button>
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(signOut, 'Sesión cerrada. Tus datos siguen en este dispositivo.')}>Cerrar sesión</button>
      </div>
      <button className="text-xs muted underline" disabled={busy} onClick={() => {
        if (confirm('Se borrará tu cuenta y todos los datos guardados en la nube. Lo que hay en este dispositivo se conserva. ¿Continuar?'))
          run(deleteAccount, 'Cuenta borrada')
      }}>Borrar mi cuenta</button>
    </section>
  )

  return (
    <section className="card p-4 space-y-3" aria-label="Cuenta">
      <h2 className="font-semibold">Guarda tu colección en la nube</h2>
      <p className="text-sm muted">Entra para tener la misma colección, favoritos y mazos en el móvil y en la web. Es opcional: sin cuenta todo sigue funcionando en este dispositivo.</p>
      {cloud.error && <p role="alert" className="text-sm text-[#e5484d]">{cloud.error}</p>}
      {google && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(signInWithGoogle)}>
          <GoogleLogo />Continuar con Google
        </button>
      )}
      {google && !withEmail ? (
        <button className="text-sm muted underline" onClick={() => setWithEmail(true)}>Entrar con email</button>
      ) : !sent ? (
        <form className="space-y-2" onSubmit={e => {
          e.preventDefault()
          run(async () => { await sendLoginEmail(email.trim()); setSent(true) })
        }}>
          <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="tu@email.com" aria-label="Email" className="field" />
          <button className="btn" disabled={busy || !email.includes('@')}>{busy ? 'Enviando…' : 'Enviarme un enlace de acceso'}</button>
        </form>
      ) : (
        <form className="space-y-2" onSubmit={e => {
          e.preventDefault()
          run(() => verifyLoginCode(email.trim(), code.trim()), 'Sesión iniciada')
        }}>
          <p className="text-sm">Te hemos enviado un email a <b className="break-all">{email}</b>. Pulsa el enlace del email desde este mismo navegador o, si el email trae un código, escríbelo aquí.</p>
          <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="Código" aria-label="Código del email" className="field text-center text-xl tracking-[.3em] tabular-nums" maxLength={10} />
          <button className="btn" disabled={busy || code.length < 6}>{busy ? 'Comprobando…' : 'Entrar'}</button>
          <button type="button" className="text-sm muted underline" onClick={() => { setSent(false); setCode('') }}>Usar otro email</button>
        </form>
      )}
    </section>
  )
}

const GoogleLogo = () => (
  <svg viewBox="0 0 48 48" className="w-5 h-5" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
  </svg>
)
