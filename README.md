# Foilio

PWA para escanear cartas de Riftbound, consultar su precio y gestionar tu colección y tus mazos. Sin backend: catálogo y precios de la API pública [RiftHunt](https://rifthunt.com), datos del usuario en IndexedDB.

## Funciones
- **Escáner** (OCR con Tesseract en el propio móvil): reconoce el número de colección (`OGN · 247/298`) y el nombre, tolerando errores de lectura. Linterna, foto o imagen de la galería como alternativa a la cámara.
- **Modo lote**: escanea cartas seguidas y se añaden a tu colección (normal o foil), con deshacer.
- **Búsqueda** por nombre (sin importar acentos ni apóstrofos), número, etiqueta o texto de reglas; filtros por colección, rareza, tipo y dominio que se conservan al volver atrás.
- **Ficha de carta**: precio de mercado normal/foil, evolución del precio de las cartas que sigues, texto de reglas con sus símbolos, otras versiones y enlaces a Cardmarket y TCGplayer.
- **Colección** con cantidades por acabado, valor total y exportación a CSV; **favoritos**.
- **Mazos**: reglas de construcción de Riftbound comprobadas una a una, coste del mazo y de lo que te falta según tu colección, importar/exportar listas en texto, duplicar.
- **Ajustes**: euros o dólares, actualización manual de datos y copia de seguridad (exportar/restaurar).
- Funciona **sin conexión** con los últimos datos descargados.

## Uso
    npm install
    npm run dev        # http://localhost:5173
    npm test           # pruebas del reconocimiento de cartas
    npm run build      # comprueba tipos y genera dist/

Requiere Node 20.19 o superior. La cámara exige HTTPS; en `localhost` funciona. Para probar en el móvil usa el despliegue o un túnel HTTPS.

## Despliegue (Cloudflare)
`wrangler.jsonc` publica `dist/` como sitio estático. Con Cloudflare Pages: build command `npm run build`, output directory `dist`.

## Datos
- Precios: mercado de TCGplayer (USD) vía RiftHunt, actualizados a diario. Se convierten a euros con el tipo del BCE (Frankfurter). No existe una API pública gratuita con precios de Cardmarket, por eso para Cardmarket se enlaza a la ficha o a la búsqueda.
- Los precios se asocian por `tcgId`: varias impresiones comparten `riftboundId` (p. ej. Annie normal y Metal).
- Todo lo del usuario (colección, mazos, favoritos) vive solo en el dispositivo: usa la copia de seguridad de Ajustes para no perderlo.

## Pendiente de verificar con datos reales
- Precisión del escáner con la cámara de distintos móviles y cartas foil con reflejos.
- Si las versiones de arte alternativo imprimen un sufijo en el número (p. ej. `030a`); ahora mismo se ofrecen ambas para elegir.
