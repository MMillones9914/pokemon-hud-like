# packs/

Compendiums estáticos del módulo (NeDB/JSONL). Se copian a `dist/` por
`rollup-plugin-copy` (`{ src: "packs", dest: "dist" }`).

Ejemplo de entrada en `module.json` (descomentar cuando exista contenido):

```json
"packs": [
  {
    "name": "pokemon-hud-powers",
    "label": "Pokémon HUD: Poderes de ejemplo",
    "system": "dnd5e",
    "path": "packs/pokemon-hud-powers",
    "type": "Item"
  }
]
```

Foundry convierte el `.db` (NeDB) a LevelDB la primera vez que se abre un mundo.