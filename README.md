# OBS Board — Tablero Colaborativo 1080p para OBS Studio

Herramienta web colaborativa en tiempo real estilo Excalidraw creada específicamente para usarse como **Fuente de Navegador (Browser Source) transparente en OBS Studio**.

## Características principales

- **Salida OBS 100% transparente y limpia (`/obs/[id]?token=...`)**: sin cajas de selección, sin controles de transformación, sin barras, sin cuadrícula y sin cursores de colaboradores.
- **Marco guía 16:9 (1920×1080) en el editor**: dibuja y coloca elementos sabiendo exactamente qué entra en la escena de OBS.
- **Herramientas estilo Excalidraw**: lápiz libre suave (`perfect-freehand`), rectángulos, elipses, líneas, flechas, texto estilizado (manuscrita, moderna, mono, sombra y pastilla de fondo), imágenes y videos.
- **Biblioteca persistente de clips MP4/WebM e imágenes**: importa tus memes, alertas o clips (incluidos WebM con canal alfa transparente) una vez y dispáralos o insértalos en cualquier tablero al instante, con soporte para **Disparar desde 0:00**, **Loop**, **Volumen/Mute** y **Auto-ocultar al terminar**.
- **Panel de Capas con visibilidad instantánea**: muestra u oculta cualquier elemento en vivo (👁️) sin borrarlo, reordena capas y bloquea elementos.
- **Colaboración privada por cuenta e invitación**: controla exactamente qué correos electrónicos pueden acceder (Editor o Solo lectura) y regenera el token de OBS cuando quieras.
- **Pantalla de inicio (Dashboard)**: gestiona todos tus tableros propios y compartidos con miniaturas en vivo.

---

## Arranque rápido en local (listo para OBS en 1 minuto)

No necesitas configurar ninguna base de datos externa para probarlo localmente:

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`:

1. Haz clic en **"Entrar rápido como Streamer Demo"** (`demo@obsboard.local` / `demo1234`) o crea tus propias cuentas para probar invitaciones.
2. Abre un tablero o crea uno nuevo.
3. Haz clic en **"Copiar URL OBS"**.

### Cómo añadirlo a OBS Studio

1. En OBS Studio, haz clic en **Fuentes → + → Navegador (Browser Source)**.
2. Pega la URL copiada (`/obs/<id>?token=<secret>`).
3. Configura:
   - **Ancho:** `1920`
   - **Alto:** `1080`
   - Marca **"Controlar audio vía OBS"** para ajustar el volumen de tus clips desde el mezclador de OBS.
4. ¡Listo! El fondo es **100% transparente de forma nativa** (no requiere Chroma Key) y todo lo que dibujes, ocultes o dispares se actualizará al instante en OBS.

---

## Despliegue en la nube gratis (Supabase + Vercel)

Cuando quieras invitar colaboradores desde internet sin depender de tu PC:

1. Crea un proyecto gratuito en [Supabase](https://supabase.com).
2. Ve a **SQL Editor**, pega y ejecuta todo el contenido de [`supabase/schema.sql`](supabase/schema.sql).
3. *(Opcional)* Si quieres inicio de sesión con Google, actívalo en **Authentication → Providers → Google** y añade `https://TU-DOMINIO.vercel.app/auth/callback` en **Authentication → URL Configuration → Redirect URLs**.
4. Copia tus claves de Supabase en `.env.local` (o en las variables de entorno de **Vercel**):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (necesaria para validar tokens de solo lectura en la vista `/obs/[id]`)
5. Despliega el repositorio en [Vercel](https://vercel.com) en 1 clic.

La aplicación detecta automáticamente las variables de Supabase y cambia de *Modo Local (SSE + `.data/`)* a *Modo Nube (Supabase Auth + Postgres + subida directa a Storage hasta 50 MB + Realtime Broadcast)*.

---

## Atajos de teclado en el editor

| Atajo | Acción |
| :--- | :--- |
| `V` | Seleccionar / mover |
| `H` o `Espacio + arrastrar` | Mover vista (Pan) |
| `P` | Lápiz libre |
| `R` / `O` / `L` / `A` | Rectángulo / Elipse / Línea / Flecha |
| `T` | Texto |
| `Shift + H` | Ocultar / mostrar capa seleccionada en OBS |
| `Ctrl + Z` / `Ctrl + Y` | Deshacer / Rehacer |
| `Ctrl + D` | Duplicar elemento |
| `Ctrl + 0` | Encuadrar marco 16:9 (1920×1080) |
| `Supr` / `Backspace` | Eliminar elemento |
