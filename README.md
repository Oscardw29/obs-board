# OBoardS — Tablero Colaborativo 1080p para OBS Studio

Herramienta web colaborativa en tiempo real creada específicamente para usarse como **Fuente de Navegador (Browser Source) transparente en OBS Studio**.

## Características principales

- **Salida OBS 100% transparente y limpia (`/obs/[id]?token=...`)**: sin cajas de selección, sin guías, sin controles de transformación, sin barras y sin cursores de colaboradores.
- **Modo fantasma al ocultar en directo**: al ocultar cualquier capa, en tu navegador se vuelve semi-transparente para seguir editándola, moviéndola o animándola, mientras en OBS desaparece al 100%.
- **Selección múltiple avanzada (`V`)**: arrastre de caja marquee y multi-selección con `Shift` o `Ctrl/Cmd`, además de alineación de grupo.
- **Herramienta de Borrador (`E`)**: modo de borrado de objeto completo o borrado parcial de trazos con división suave.
- **8 tipos de Pincel (`P`)**: Pluma, Marcador, Resaltador, Caligrafía, Neón, Tiza, Spray y Guionado, con nombres incrementales automáticos (`Trazo libre`, `Trazo libre 2`, `Trazo libre 3`…) y miniatura visual real del trazo en la lista de capas.
- **Textos con fuentes personalizables**: 15 tipografías de estudio integradas + importación de fuentes propias (`.ttf`, `.otf`, `.woff`, `.woff2`), contorno, sombra, interlineado y pastilla.
- **Documentos adjuntos**: importa `.pdf`, `.txt` o `.md`, elige exactamente qué páginas insertar y navega entre páginas en vivo.
- **Imán inteligente (`M`, activo por defecto) y Líneas Guías (`G`)**: alineación magnética suave estilo Canva con guías dinámicas al borde/centro del área o de otros objetos.
- **Biblioteca compartida con carpetas**: crea carpetas de colores, arrastra archivos entre carpetas, renombra y etiqueta recursos para todo el equipo del tablero.
- **Animaciones, Presets y controles 100% custom**: animaciones de entrada, bucle continuo y salida en OBS, presets listos + propios, selector de color avanzado y sliders/selectores custom.
- **Control en vivo de colaboradores**: el creador ve quién está conectado/desconectado, cambia permisos en tiempo real, pausa inmediatamente a un colaborador (suelta lo que esté haciendo y pasa a solo lectura), oculta/borra sus elementos o lo expulsa con opción de limpiar sus objetos.

---

## Arranque rápido en local (listo para OBS)

```bash
npm install
npm run dev
```

Abre `http://localhost:3000`:

1. Inicia sesión rápido con **"Entrar rápido como Streamer Demo"** (`demo@oboards.local` / `demo1234`) o crea tus propias cuentas.
2. Abre un tablero o crea uno nuevo.
3. Haz clic en **"Copiar URL OBS"**.

### Cómo añadirlo a OBS Studio

1. En OBS Studio, ve a **Fuentes → + → Navegador (Browser Source)**.
2. Pega la URL copiada (`/obs/<id>?token=<secret>`).
3. Configura **Ancho:** `1920`, **Alto:** `1080`, y marca **"Controlar audio vía OBS"**.
4. ¡Listo! El fondo es **100% transparente de forma nativa**.

---

## Despliegue en la nube (Supabase + Vercel)

1. Crea un proyecto en [Supabase](https://supabase.com).
2. Ve a **SQL Editor**, pega y ejecuta todo el contenido de [`supabase/schema.sql`](supabase/schema.sql).
3. Configura tus variables de entorno en `.env.local` o en **Vercel**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `SUPABASE_SECRET_KEY`
4. Despliega en [Vercel](https://vercel.com).

---

## Atajos de teclado en el editor

| Atajo | Acción |
| :--- | :--- |
| `V` | Seleccionar / Arrastre múltiple (marquee) |
| `E` | Borrador (objeto / parcial) |
| `P` | Pincel (8 estilos) |
| `R` / `O` / `L` / `A` | Rectángulo / Elipse / Línea / Flecha |
| `T` | Texto |
| `M` | Activar / desactivar Imán |
| `G` | Mostrar / ocultar Líneas Guías |
| `Espacio + arrastrar` | Mover vista del lienzo (Pan) |
| `Shift + H` | Ocultar / mostrar capa seleccionada en OBS |
| `Ctrl + Z` / `Ctrl + Y` | Deshacer / Rehacer |
| `Ctrl + A` / `Ctrl + D` | Seleccionar todo / Duplicar |
| `Ctrl + 0` | Encuadrar marco 16:9 (1920×1080) |
| `Supr` / `Backspace` | Eliminar elementos seleccionados |
