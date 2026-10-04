import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { findCandidates, readText, type Card } from '../lib'
import CardRow from './CardRow'

type Status = 'scanning' | 'found' | 'denied' | 'nocam'

export default function Scan() {
  const video = useRef<HTMLVideoElement>(null)
  const nav = useNavigate()
  const [status, setStatus] = useState<Status>('scanning')
  const [found, setFound] = useState<Card[]>([])

  // La cámara se abre una sola vez al entrar.
  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    if (!navigator.mediaDevices?.getUserMedia) { setStatus('nocam'); return }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => {
        if (stopped) { s.getTracks().forEach(t => t.stop()); return }
        stream = s
        if (video.current) video.current.srcObject = s
      })
      .catch(e => setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'nocam'))
    return () => { stopped = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Bucle de reconocimiento mientras el estado sea "scanning".
  useEffect(() => {
    if (status !== 'scanning') return
    let stopped = false
    let last = ''
    const tick = async () => {
      const v = video.current
      if (v?.videoWidth) {
        const h = v.videoHeight * 0.8, w = (h * 5) / 7
        const c = document.createElement('canvas')
        c.width = w * 1.5; c.height = h * 1.5
        c.getContext('2d')!.drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, c.width, c.height)
        const cands = await findCandidates(await readText(c))
        if (stopped) return
        const key = cands.map(x => x.id).join()
        if (cands.length && key === last) { // misma lectura dos veces seguidas
          if (cands.length === 1) nav(`/carta/${cands[0].id}`, { replace: true })
          else { setFound(cands); setStatus('found') }
          return
        }
        last = key
      }
      if (!stopped) setTimeout(tick, 400)
    }
    tick()
    return () => { stopped = true }
  }, [status, nav])

  if (status === 'denied') return <Msg text="Necesitamos permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a abrir esta pestaña." />
  if (status === 'nocam') return <Msg text="No hemos encontrado una cámara disponible (la cámara solo funciona con HTTPS)." />

  return (
    <div className="space-y-3">
      <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4]">
        <video ref={video} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div className="absolute inset-0 m-auto h-[80%] aspect-[5/7] rounded-2xl border-4 border-[var(--teal)]" />
      </div>
      {status === 'scanning' ? (
        <p className="text-sm muted text-center animate-pulse">Coloca la carta dentro del marco, con buena luz…</p>
      ) : (
        <>
          <h2 className="font-semibold">¿Es alguna de estas?</h2>
          {found.map(c => <CardRow key={c.id} card={c} />)}
          <button className="btn" onClick={() => setStatus('scanning')}>Escanear de nuevo</button>
        </>
      )}
      <Link to="/buscar" className="btn btn-ghost block text-center">Buscar manualmente</Link>
    </div>
  )
}
const Msg = ({ text }: { text: string }) => (
  <div className="card p-4 space-y-3"><p>{text}</p><Link to="/buscar" className="btn block text-center">Buscar manualmente</Link></div>
)