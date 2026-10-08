import type { Worker } from 'tesseract.js'

let worker: Promise<Worker> | null = null

/** Carga Tesseract solo cuando hace falta (es la dependencia más pesada) y reutiliza el worker. */
export function getWorker(): Promise<Worker> {
  worker ??= import('tesseract.js').then(async ({ createWorker, PSM }) => {
    const w = await createWorker('eng')
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT, preserve_interword_spaces: '1' })
    return w
  }).catch(e => { worker = null; throw e })
  return worker
}

/** Escala de grises y estiramiento de contraste: el OCR falla mucho menos con brillos y fondos de color. */
function enhance(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h), d = img.data
  let lo = 255, hi = 0
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000
    d[i] = g
    if (g < lo) lo = g
    if (g > hi) hi = g
  }
  const k = 255 / Math.max(1, hi - lo)
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = (d[i] - lo) * k
  ctx.putImageData(img, 0, 0)
}

/**
 * Prepara una imagen para el OCR. Por defecto recorta el centro con proporción de carta (5:7) ocupando `frac`
 * de la zona visible; `viewAspect` es la proporción del visor cuando el vídeo se muestra con object-cover,
 * para que el recorte coincida con el marco que ve el usuario. Con `crop: false` usa la imagen entera.
 */
export function cardCanvas(
  src: HTMLVideoElement | ImageBitmap,
  { frac = 0.88, viewAspect, crop = true }: { frac?: number; viewAspect?: number; crop?: boolean } = {},
): HTMLCanvasElement | null {
  const sw = src instanceof HTMLVideoElement ? src.videoWidth : src.width
  const sh = src instanceof HTMLVideoElement ? src.videoHeight : src.height
  if (!sw || !sh) return null
  let w = sw, h = sh
  if (crop) {
    h = (viewAspect ? Math.min(sh, sw / viewAspect) : sh) * frac; w = (h * 5) / 7
    if (w > sw) { w = sw; h = (w * 7) / 5 }
  }
  const scale = Math.min(2, 1600 / Math.max(w, h)) // ~1600 px en el lado mayor basta; más solo ralentiza
  const c = document.createElement('canvas')
  c.width = Math.round(w * scale); c.height = Math.round(h * scale)
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(src, (sw - w) / 2, (sh - h) / 2, w, h, 0, 0, c.width, c.height)
  enhance(ctx, c.width, c.height)
  return c
}

export async function readText(canvas: HTMLCanvasElement): Promise<string> {
  return (await (await getWorker()).recognize(canvas)).data.text
}
