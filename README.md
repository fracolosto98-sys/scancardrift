# ScanCard

PWA para escanear cartas de Riftbound. Sin backend: catálogo y precios de la API pública RiftHunt, datos del usuario en IndexedDB.

## Uso
    npm install
    npm run dev      # abre http://localhost:5173

La cámara exige HTTPS; en `localhost` funciona. Para probar en el móvil usa el despliegue (ver abajo) o un túnel HTTPS.

## Despliegue gratuito (Cloudflare Pages)
1. Sube el proyecto a un repositorio de GitHub.
2. dash.cloudflare.com > Workers & Pages > Create > Pages > Connect to Git.
3. Build command: `npm run build` · Output directory: `dist`.
4. Deploy. Recibirás una URL https://…pages.dev instalable como app.

## Pendiente de verificar con datos reales
- Forma exacta del campo `prices` (ver `usdPrices` en `src/lib.ts`).
- Posición/formato del código de colección en la carta y precisión del OCR.
- Iconos PNG 192/512 para la instalación en Android.
