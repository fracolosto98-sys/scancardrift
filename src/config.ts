// ---------- Cuenta y sincronización (Supabase) ----------
export const SUPABASE_URL = 'https://xyeyffdoewdiscsjqsuq.supabase.co'
/** Clave pública ("publishable"): está pensada para ir en el cliente. La seguridad la dan las políticas RLS de supabase/schema.sql. */
export const SUPABASE_KEY = 'sb_publishable_e1wLq74bxvIP-uixFM03uA_p6Q1cmd1'

// ---------- Monetización: deja '' lo que no uses y no se mostrará ----------
export const MONEY = {
  /**
   * Enlace base de tu cuenta de afiliado de TCGplayer (programa en Impact), p. ej. 'https://tcgplayer.pxf.io/c/1234567/1830156/21018'.
   * Vacío: se usa el enlace que da RiftHunt (que lleva su propio código de afiliado).
   */
  tcgplayerAffiliate: '',
  /** Parámetros que añadir a los enlaces de Cardmarket si te dan un código de socio, p. ej. 'referrer=foilio'. */
  cardmarketParams: '',
  /** Tag de Amazon Afiliados (p. ej. 'foilio-21'). Vacío: no se muestra la sección de accesorios. */
  amazonTag: '',
  /** Página de apoyo (Ko-fi, Buy Me a Coffee, Patreon…). Vacío: no se muestra el botón. */
  supportUrl: '',
}
export const HAS_AFFILIATES = !!(MONEY.tcgplayerAffiliate || MONEY.cardmarketParams || MONEY.amazonTag)
