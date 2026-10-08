import { Component, type ReactNode } from 'react'
import { DOMAIN_COLORS, es, parseRules, type Card } from '../lib'

export function DomainChip({ d }: { d: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-white" style={{ background: DOMAIN_COLORS[d] ?? '#888' }}>
      {es(d)}
    </span>
  )
}

const RUNE_COLOR: Record<string, string> = Object.fromEntries(Object.entries(DOMAIN_COLORS).map(([k, v]) => [k.toLowerCase(), v]))

/** Texto de reglas con los símbolos del juego dibujados en lugar de ":rb_energy_2:". */
export function RulesText({ card }: { card: Card }) {
  const parts = parseRules(card)
  if (!parts.length) return null
  return (
    <p className="leading-relaxed">
      {parts.map((p, i) => {
        switch (p.t) {
          case 'text': return <span key={i}>{p.v}</span>
          case 'br': return <br key={i} />
          case 'kw': return <b key={i} className="kw">{p.v}</b>
          case 'energy': return <span key={i} className="sym" title={`${p.n} de energía`}>{p.n}</span>
          case 'might': return <span key={i} className="sym" title="Poderío">⚔</span>
          case 'exhaust': return <span key={i} className="sym" title="Agotar">↷</span>
          case 'rune': return p.d === 'rainbow'
            ? <span key={i} className="sym sym-rainbow" title="Runa de cualquier dominio">◆</span>
            : <span key={i} className="sym text-white" style={{ background: RUNE_COLOR[p.d] }} title={`Runa de ${es(p.d[0].toUpperCase() + p.d.slice(1))}`}>◆</span>
        }
      })}
    </p>
  )
}

export function Stepper({ value, onChange, label, max = 99 }: { value: number; onChange: (d: 1 | -1) => void; label: string; max?: number }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button className="step" aria-label={`Quitar una (${label})`} disabled={value <= 0} onClick={() => onChange(-1)}>−</button>
      <b className="w-7 text-center tabular-nums" aria-live="polite">{value}</b>
      <button className="step" aria-label={`Añadir una (${label})`} disabled={value >= max} onClick={() => onChange(1)}>+</button>
    </div>
  )
}

/** Gráfico mínimo de la evolución de un precio. */
export function Sparkline({ points }: { points: number[] }) {
  if (points.length < 2) return null
  const w = 240, h = 48, min = Math.min(...points), max = Math.max(...points), span = max - min || 1
  const xy = points.map((p, i) => `${(i / (points.length - 1)) * w},${h - 4 - ((p - min) / span) * (h - 8)}`)
  const up = points[points.length - 1] >= points[0]
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" role="img" aria-label="Evolución del precio">
      <polyline points={xy.join(' ')} fill="none" stroke={up ? 'var(--teal)' : '#e5484d'} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T; options: [T, string][]; onChange: (v: T) => void; label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="card flex p-1 gap-1">
      {options.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`flex-1 rounded-xl py-2 text-sm font-medium ${value === v ? 'bg-[var(--rift)] text-white' : 'muted'}`}>{l}</button>
      ))}
    </div>
  )
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="card p-4 space-y-3">
        <p className="font-semibold">Algo ha fallado en esta pantalla.</p>
        <p className="text-sm muted break-words">{this.state.error.message}</p>
        <button className="btn" onClick={() => { this.setState({ error: null }); location.hash = '#/' }}>Volver al inicio</button>
      </div>
    )
  }
}
