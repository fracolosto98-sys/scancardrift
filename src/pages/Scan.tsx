import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { findCandidates, readText, type Card } from '../lib'
import CardRow from './CardRow'

type Status = 'idle' | 'working' | 'done' | 'denied' | 'nocam'

export default function Scan() {
  const video = useRef<HTMLVideoElement>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [found, setFound] = useState<Card[]>([])

  useEffect(() => {
    let stream: MediaStream | undefined
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then(s => { stream = s; if (video.current) video.current.srcObject = s })
      .catch(e => setStatus(e?.name === 'NotAllowedError' ? 'denied' : 'nocam'))
    return () => stream?.getTracks().forEach(t => t.stop())
  }, [])

  async function capture() {
    const v = video.current
    if (!v || !v.videoWidth) return
    setStatus('working')
    // Recorta la zona del marco guía (centro, proporción de carta 5:7).
    const h = v.videoHeight * 0.8, w = h * 5 / 7
    const c = document.createElement('canvas')
    c.width = w * 1.5; c.height = h * 1.5
    c.getContext('2d')!.drawImage(v, (v.videoWidth - w) / 2, (v.videoHeight - h) / 2, w, h, 0, 0, c.width, c.height)
    setFound(await findCandidates(await readText(c)))
    setStatus('done')
  }

  if (status === 'denied') return <Msg text="Necesitamos permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a intentarlo." />
  if (status === 'nocam') return <Msg text="No hemos encontrado una cámara disponible en este dispositivo." />

  return (
    <div className="space-y-3">
      <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4]">
        <video ref={video} autoPlay playsInline muted className="w-full h-full object-cover" />
        <div className="absolute inset-0 m-auto h-[80%] aspect-[5/7] rounded-2xl border-4 border-[var(--teal)]" />
      </div>
      <p className="text-sm muted text-center">Encaja la carta en el marco, con buena luz, y pulsa Capturar.</p>
      <button className="btn" onClick={capture} disabled={status === 'working'}>
        {status === 'working' ? 'Analizando carta…' : 'Capturar'}
      </button>
      {status === 'done' && (found.length ? (
        <><h2 className="font-semibold">¿Es alguna de estas?</h2>{found.map(c => <CardRow key={c.id} card={c} />)}</>
      ) : (
        <div className="card p-4 space-y-2"><p>No hemos podido identificar la carta.</p>
          <Link to="/buscar" className="btn btn-ghost block text-center">Buscar manualmente</Link></div>
      ))}
    </div>
  )
}
const Msg = ({ text }: { text: string }) => (
  <div className="card p-4 space-y-3"><p>{text}</p><Link to="/buscar" className="btn block text-center">Buscar manualmente</Link></div>
)
