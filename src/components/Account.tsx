import { useState } from 'react'
import { deleteAccount, sendLoginEmail, signOut, sync, verifyLoginCode } from '../lib/cloud'
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
      <p className="text-sm muted">Entra con tu email para tener la misma colección, favoritos y mazos en el móvil y en la web. Es opcional: sin cuenta todo sigue funcionando en este dispositivo.</p>
      {!sent ? (
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
