import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { addOwned, baseName, collectorNo, es, finishPrice, type Card, type FinishName } from '../lib'
import { buildIndex, findMatches } from '../lib/match'
import { cardCanvas, getWorker, readText } from '../lib/ocr'
import { useCatalog, useToast } from '../state'
import CardRow, { CardImg } from '../components/CardRow'
import { Segmented } from '../components/bits'
import Icon from '../components/Icon'

type Cam = 'starting' | 'live' | 'denied' | 'nocam'
const VIEW_ASPECT = 3 / 4 // proporción del visor (aspect-[3/4])
const buzz = () => navigator.vibrate?.(40)

export default function Scan() {
  const { cards, priceOf } = useCatalog()
  const idx = useMemo(() => buildIndex(cards), [cards])
  const nav = useNavigate()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const batch = params.get('modo') === 'lote'
  const video = useRef<HTMLVideoElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const photo = useRef<HTMLInputElement>(null)
  const cooldown = useRef('') // en modo lote, la carta recién añadida no se vuelve a contar mientras siga delante
  const [cam, setCam] = useState<Cam>('starting')
  const [ocr, setOcr] = useState<'loading' | 'ready' | 'error'>('loading')
  const [choices, setChoices] = useState<Card[] | null>(null)
  const [torch, setTorch] = useState<boolean | null>(null) // null: la cámara no tiene linterna
  const [finish, setFinish] = useState<FinishName>('normal')
  const [session, setSession] = useState<{ card: Card; finish: FinishName; n: number }[]>([])
  const [reading, setReading] = useState(false)

  useEffect(() => { getWorker().then(() => setOcr('ready'), () => setOcr('error')) }, [])

  // La cámara se abre una sola vez al entrar.
  useEffect(() => {
    let stream: MediaStream | undefined
    let stopped = false
    if (!navigator.mediaDevices?.getUserMedia) { setCam('nocam'); return }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
    }).then(s => {
      if (stopped) { s.getTracks().forEach(t => t.stop()); return }
      stream = s
      track.current = s.getVideoTracks()[0] ?? null
      const caps = track.current?.getCapabilities?.() as { torch?: boolean } | undefined
      if (caps?.torch) setTorch(false)
      if (video.current) video.current.srcObject = s
      setCam('live')
    }).catch(e => setCam(e?.name === 'NotAllowedError' ? 'denied' : 'nocam'))
    return () => { stopped = true; stream?.getTracks().forEach(t => t.stop()) }
  }, [])

  async function toggleTorch() {
    const on = !torch
    try { await track.current?.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); setTorch(on) }
    catch { setTorch(null) }
  }

  async function add(card: Card) {
    // Si la carta no existe en el acabado elegido (p. ej. solo hay foil), se usa el que sí existe.
    const other: FinishName = finish === 'normal' ? 'foil' : 'normal'
    const p = priceOf(card)
    const f = finishPrice(p, finish) == null && finishPrice(p, other) != null ? other : finish
    await addOwned(card.id, f, 1)
    buzz()
    setSession(s => {
      const i = s.findIndex(x => x.card.id === card.id && x.finish === f)
      return i < 0 ? [{ card, finish: f, n: 1 }, ...s] : s.map((x, j) => j === i ? { ...x, n: x.n + 1 } : x)
    })
    toast(`+1 ${baseName(card)}${f === 'foil' ? ' (foil)' : ''}`, {
      label: 'Deshacer', run: () => {
        addOwned(card.id, f, -1)
        setSession(s => s.map(x => x.card.id === card.id && x.finish === f ? { ...x, n: x.n - 1 } : x).filter(x => x.n > 0))
      },
    })
  }

  /** Qué hacer con un reconocimiento: abrir la ficha, añadir a la colección o preguntar entre varias. */
  const accept = useRef<(cands: Card[]) => boolean>(() => false)
  accept.current = cands => {
    if (cands.length > 1) { buzz(); setChoices(cands); return true }
    if (!batch) { buzz(); nav(`/carta/${cands[0].id}`); return true }
    add(cands[0])
    return false // en lote, seguir escaneando
  }

  // Bucle de reconocimiento: se acepta una lectura segura (número + nombre) o la misma dos veces seguidas.
  useEffect(() => {
    if (cam !== 'live' || ocr !== 'ready' || choices) return
    let stopped = false, last = '', misses = 0
    const tick = async () => {
      const v = video.current
      const canvas = v && cardCanvas(v, { viewAspect: VIEW_ASPECT })
      if (canvas) {
        const { cards: cands, confident } = findMatches(await readText(canvas), idx)
        if (stopped) return
        const key = cands.map(c => c.id).join()
        if (key && key === cooldown.current) misses = 0
        else {
          if (cooldown.current && ++misses >= 2) cooldown.current = ''
          if (!cooldown.current && cands.length && (confident || key === last)) {
            cooldown.current = key; last = ''
            if (accept.current(cands)) return
          } else last = key
        }
      }
      if (!stopped) setTimeout(tick, 250)
    }
    tick()
    return () => { stopped = true }
  }, [cam, ocr, choices, idx])

  async function fromPhoto(file: File | undefined) {
    if (!file) return
    setReading(true)
    try {
      const bmp = await createImageBitmap(file)
      const canvas = cardCanvas(bmp, { crop: false })
      bmp.close()
      const { cards: cands } = findMatches(canvas ? await readText(canvas) : '', idx)
      if (!cands.length) toast('No se ha reconocido la carta. Prueba con otra foto, más cerca y con buena luz.')
      else { cooldown.current = ''; accept.current(cands) }
    } catch { toast('No se pudo leer la imagen.') }
    setReading(false)
    if (photo.current) photo.current.value = ''
  }

  const pick = (c: Card) => { setChoices(null); if (batch) add(c); else nav(`/carta/${c.id}`) }
  const total = session.reduce((s, x) => s + x.n, 0)

  return (
    <div className="space-y-3">
      <Segmented label="Modo de escaneo" value={batch ? 'lote' : 'ficha'} onChange={v => setParams(v === 'lote' ? { modo: 'lote' } : {}, { replace: true })}
        options={[['ficha', 'Ver precio'], ['lote', 'Añadir a colección']]} />

      {cam === 'denied' || cam === 'nocam' ? (
        <div className="card p-4 space-y-2">
          <p>{cam === 'denied'
            ? 'Necesitamos permiso para usar la cámara. Actívalo en los ajustes del navegador y vuelve a abrir esta pestaña.'
            : 'No hay una cámara disponible (solo funciona con HTTPS).'}</p>
          <p className="text-sm muted">También puedes hacer una foto a la carta o elegir una imagen.</p>
        </div>
      ) : (
        <div className="relative rounded-3xl overflow-hidden bg-black aspect-[3/4]">
          <video ref={video} autoPlay playsInline muted className="w-full h-full object-cover" />
          <div className="absolute inset-0 m-auto h-[80%] aspect-[5/7] rounded-2xl border-4 border-[var(--teal)] shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
          {torch !== null && (
            <button onClick={toggleTorch} aria-pressed={torch} aria-label="Linterna"
              className={`absolute top-3 right-3 p-3 rounded-full ${torch ? 'bg-[var(--gold)] text-black' : 'bg-black/50 text-white'}`}>
              <Icon name="flash" filled={torch} />
            </button>
          )}
          <p className="absolute bottom-3 inset-x-0 text-center text-sm text-white/90" aria-live="polite">
            {ocr === 'loading' ? 'Preparando el reconocimiento…' : ocr === 'error' ? 'No se pudo cargar el reconocimiento de texto.'
              : cam === 'starting' ? 'Abriendo la cámara…' : choices ? '' : 'Coloca la carta dentro del marco, con buena luz'}
          </p>
        </div>
      )}

      {batch && (
        <div className="flex items-center justify-between">
          <span className="text-sm">Acabado de las cartas</span>
          <div className="w-44"><Segmented<FinishName> label="Acabado" value={finish} onChange={setFinish} options={[['normal', 'Normal'], ['foil', 'Foil']]} /></div>
        </div>
      )}

      {choices && (
        <section className="space-y-2">
          <h2 className="font-semibold">¿Cuál de estas es?</h2>
          {batch
            ? choices.map(c => (
              <button key={c.id} onClick={() => pick(c)} className="card flex items-center gap-3 p-3 w-full text-left">
                <CardImg card={c} className="w-12 rounded-lg" />
                <span className="flex-1 min-w-0"><b className="block truncate">{c.name}</b><span className="text-sm muted">{c.setName} · {collectorNo(c)} · {es(c.rarity)}</span></span>
              </button>
            ))
            : choices.map(c => <CardRow key={c.id} card={c} />)}
          <button className="btn" onClick={() => setChoices(null)}>Escanear de nuevo</button>
        </section>
      )}

      <button className="btn btn-ghost" disabled={reading || ocr !== 'ready'} onClick={() => photo.current?.click()}>
        <Icon name="camera" />{reading ? 'Leyendo la foto…' : 'Hacer o elegir una foto'}
      </button>
      <input ref={photo} type="file" accept="image/*" capture="environment" hidden onChange={e => fromPhoto(e.target.files?.[0])} />
      <Link to="/buscar" className="btn btn-ghost"><Icon name="search" />Buscar manualmente</Link>

      {batch && session.length > 0 && (
        <section className="space-y-2">
          <div className="flex justify-between items-baseline">
            <h2 className="font-semibold">Añadidas en esta sesión ({total})</h2>
            <Link to="/coleccion" className="text-sm underline muted">Ver colección</Link>
          </div>
          {session.map(x => <CardRow key={`${x.card.id}-${x.finish}`} card={x.card} sub={<>{x.n} × {es(x.finish)}</>} />)}
        </section>
      )}
    </div>
  )
}
