# AURA — Recepcionista virtual

Aplicación web multilingüe para conectar una recepcionista virtual fotorealista con un
agente de voz de RetellAI. Incluye español, catalán e inglés y sincronización
labial basada en el audio reproducido por Retell.

## Publicar en GitHub

1. Crea un repositorio vacío en GitHub.
2. Descomprime este ZIP.
3. Sube **el contenido de la carpeta**, no la carpeta ZIP.
4. No subas nunca un archivo `.env.local` ni una API key.

## Publicar en Vercel

1. En Vercel, selecciona **Add New → Project**.
2. Importa el repositorio de GitHub.
3. Vercel reconocerá automáticamente Next.js.
4. En **Environment Variables**, añade:

   - `RETELL_API_KEY`: clave privada de RetellAI. Márcala como secreta.
   - `RETELL_AGENT_ID`: identificador del agente publicado.

5. Activa las variables para Production, Preview y Development.
6. Pulsa **Deploy**.

## Desarrollo local

Requiere Node.js 22.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completa `.env.local` con tus propios valores. El archivo está excluido de Git.

## Funcionamiento

El navegador llama a `/api/retell-call`. Esta ruta utiliza la clave privada
únicamente en el servidor para solicitar a RetellAI un token temporal. La clave
privada nunca se entrega al navegador.

El SDK se inicia con `emitRawAudioSamples: true`. El nivel RMS del audio separa
suavemente los labios de la fotografía mientras habla el agente y vuelve a
cerrarlos cuando termina. La animación conserva intactos el rostro y el cuerpo.
