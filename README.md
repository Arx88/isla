# 🏝️ ISLA — una simulación de mundo con agentes LLM

> Diez náufragos despiertan solos en distintas costas de una isla procedural.
> Cada uno fue **escrito** por alguien: su personalidad es un instructivo.
> Nadie los controla. Sobreviven, sienten miedo, se enamoran, se traicionan,
> negocian con el DIOS de la isla… o mueren.

## Qué hace diferente a ISLA

- **Vida interior real**: 9 emociones discretas con causas y decaimiento (miedo, enojo, alegría, tristeza, amor, celos, vergüenza, orgullo, rencor), pensamientos privados que no dicen en voz alta, metas propias que declaran ellos, temperatura corporal (tiritan de frío, sudan en ola de calor).
- **Nacen separados, se encuentran**: cada naufrago aparece solo en una desembocadura distinta. Huellas frescas en la arena los guían hacia los otros — el encuentro emerge, no se fuerza.
- **Mapa mental por persona**: cada uno recuerda dónde hay agua, comida, madera, zonas peligrosas (jabalíes), lugares tranquilos — y **nota cuando algo cambió** ("el arbuesto de siempre está vacío").
- **El DIOS**: otro agente LLM con humor propio. Nunca da objetos: da *conocimiento* (recetas) a cambio de devoción y ofrendas. El motor valida que nada rompa las leyes de conservación.
- **Mundo vivo**: clima de 6 estados que afecta el cuerpo (ola de calor deshidrata ×1.4, tormenta bloquea la pesca, niebla corta la visión), fauna en manadas, cataratas con arcoíris, eventos misteriosos (columnas de humo, ballena varada, velas en el horizonte), comida que se pudre.
- **Traición por supervivencia**: al borde de la muerte por hambre, pueden robarle comida a otro — con vergüenza si los descubren, y la relación queda marcada para siempre.
- **Cerebro de 3 capas**: cuerpo (determinista) → hábitos (aprendidos) → deliberación (LLM, solo cuando hay tensión real). Menos LLM = más humano.
- **Niebla de guerra del espectador**: bruma animada cubre lo que ningún náufrago pisó todavía.

## Correrlo

```bash
# con Ollama local (recomendado, gratis)
node server.mjs --provider ollama --model qwen2.5:7b --port 3456
# o con cualquier API compatible OpenAI
node server.mjs --provider openai --model <modelo> --openai-base <url>

# abrir http://localhost:3456, escribir los instructivos y COMENZAR TEMPORADA
```

Cero dependencias: solo Node 18+ y (opcional) Ollama.

## Auditoría

```bash
node scripts/audit.mjs --days 7 --provider heuristic   # rápido, sin LLM
node scripts/audit.mjs --days 3 --provider ollama      # con cerebro real
```

Mide movimiento, exploración, loop de comida, ratio hábito/deliberación, emociones y muertes — para verificar que el mundo se sienta vivo y no determinista.

## Estructura

```
src/engine/   mundo, cuerpo, hábitos, memoria+lugares, acciones, DIOS, eventos
src/agents/   prompts y parsing (brain), Ollama, OpenAI-compat, heurística
web/          UI en vivo (canvas pixel-art, SSE, expediente con tabs)
server.mjs    servidor SSE en tiempo real
scripts/      auditoría y parches
docs          diseño (en ../docs del monorepo original)
```

---
Hecho con un loop obsesivo de probar→mejorar. La temporada siempre evoluciona distinto.
