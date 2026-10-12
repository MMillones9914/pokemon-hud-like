# assets/

Contenido estático no procesado por Vite (imágenes, fondos, audio…).
Se copia tal cual a `dist/` por `rollup-plugin-copy` (`{ src: "assets", dest: "dist" }`).

Uso sugerido para el fondo del HUD estilo Pokémon: colocar aquí u.n
`background.webp` y referenciarlo desde `src/styles/module.scss` con una URL relativa
que Vite no reescribe (al vivir fuera de `src/`, la URL se resuelve en runtime
respecto al CSS en `dist/module/`).