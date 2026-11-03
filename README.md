# AI Electronics Diagnostic

Aplicación web que identifica componentes electrónicos y detecta posibles daños a partir de una fotografía.

**Demo:** [ai-electronics-diagnostic.vercel.app](https://ai-electronics-diagnostic.vercel.app)

> La demo funciona con la capa gratuita de Gemini y de Tavily, compartida por todos los visitantes. Puede mostrar «servicio saturado» o «cuota agotada» en momentos de mucho uso: si pasa, prueba más tarde. En este modo de pruebas, Google puede usar las fotos para mejorar sus modelos, así que no subas imágenes con datos personales. El diagnóstico es visual y orientativo: no sustituye a una comprobación con instrumentos.

**Estado:** MVP completo: flujo principal (captura → preparación → análisis con IA → informe), documentación técnica con enlaces comprobados, asistente conversacional e historial local.

## Estructura

```
src/app/             Aplicación Next.js
  page.tsx           Página principal
  api/analyze/       Endpoint de análisis (valida, limita el uso y transmite el progreso)
  api/chat/          Endpoint del asistente (valida la conversación y transmite la respuesta)
  api/docs/          Endpoint de documentación técnica
src/components/      Pantallas: captura, preparación, espera, informe, documentación, visor de la foto, chat e historial
src/lib/             Utilidades de la interfaz (preparación de la foto, historial en IndexedDB, textos, límites)
src/core/            Núcleo compartido por la aplicación y la evaluación
  report-schema.ts   Contrato del informe (esquema Zod → JSON Schema para la IA)
  prompt.ts          Instrucciones del análisis
  chat-prompt.ts     Instrucciones del asistente (incluye el informe como datos)
  chat.ts            Punto único de entrada al chat
  docs/              Búsqueda de documentación (Tavily), dominios oficiales y comprobación segura de enlaces
  analyze.ts         Punto único de entrada al análisis; elige el proveedor según el modelo
  providers/         Un archivo por proveedor de IA (Anthropic, Google Gemini)
  image.ts           Validación, orientación, redimensionado y eliminación de EXIF/GPS
  safety.ts          Avisos de seguridad fijos, independientes del modelo
  models.ts          Modelos candidatos y precios
src/eval/            Prueba técnica: compara modelos con fotos etiquetadas
eval/                Fotos, etiquetas y resultados de la evaluación (no se suben al repositorio)
```

## Puesta en marcha

Necesitas Node.js 20.9 o superior y una clave de API de al menos uno de estos proveedores:
- **Google Gemini** (`GEMINI_API_KEY`), con capa gratuita: [aistudio.google.com/apikey](https://aistudio.google.com/apikey). En la capa gratuita, Google puede usar lo que envías para mejorar sus productos, y la aplicación lo indica como «Modo de pruebas». Sirve para probar, nunca para fotos de usuarios. Sus límites de uso son bajos y cambian a menudo.
- **Anthropic** (`ANTHROPIC_API_KEY`), de pago y prepago: [platform.claude.com](https://platform.claude.com).

Para la documentación técnica hace falta además una clave de **Tavily** (`TAVILY_API_KEY`), un buscador para aplicaciones con IA. El plan gratuito incluye 1.000 búsquedas al mes y no pide tarjeta: [app.tavily.com](https://app.tavily.com). Sin esta clave, la app funciona igual y la sección de documentación indica que no está configurada.

```bash
npm install
```

```bash
cp .env.example .env
```

Abre `.env`, pega tu clave y elige el modelo con `AI_MODEL` (`gemini`, `gemini38`, `opus`, `sonnet` o `haiku`). El archivo `.env` está en `.gitignore`: no lo subas nunca. Las claves solo se usan en el servidor.

## Aplicación

```bash
npm run dev
```

Abre http://localhost:3000. Para probarla en el móvil, conéctalo a la misma red wifi y abre la dirección «Network» que muestra la terminal.

Otros comandos: `npm run build` (compilación de producción), `npm run typecheck` (comprobación de tipos).

## Prueba técnica (evaluación)

Pasa tus fotos etiquetadas por uno o varios modelos, genera el mismo informe que la aplicación y lo compara con la respuesta correcta.

**Para hacer la validación con tus fotos, sigue [eval/GUIA.md](eval/GUIA.md)**: qué fotografiar, cómo etiquetar y cómo continuar otro día si se agota la cuota.

### Preparar las fotos

1. Copia tus fotos en `eval/images/`. Se admiten JPEG, PNG, WebP y HEIC (las HEIC se convierten en el paso siguiente, solo en macOS).
2. Ejecuta `npm run eval:prepare`: convierte las fotos HEIC a JPEG y añade a `eval/labels.csv` una fila por cada foto nueva con la categoría `REVISAR`. Después completa cada fila. Puedes editarlo con Excel; acepta coma o punto y coma como separador.

| Columna | Qué poner |
|---|---|
| `file` | Nombre del archivo en `eval/images/` |
| `category` | Una de las categorías de la tabla siguiente |
| `manufacturer` | Fabricante, si se ve en la foto o lo sabes con certeza. Si no, `-` |
| `model` | Modelo exacto **solo si se lee en la foto**. Si no se ve, `-`: así detectamos cuándo el modelo se lo inventa |
| `damage` | `yes` si hay un daño visible, `no` si está sano, `unknown` si no lo sabes |
| `context` | Opcional: lo que contaría un usuario («no enciende», «huele a quemado») |
| `notes` | Opcional: notas para ti |

Categorías: `motherboard` (placa base), `graphics_card` (tarjeta gráfica), `ram_module`, `cpu`, `power_supply` (fuente), `storage_device`, `appliance_board` (placa de electrodoméstico), `pcb_assembly` (otra placa), `electronic_module`, `integrated_circuit`, `capacitor`, `resistor`, `transistor`, `diode`, `inductor`, `connector`, `cable`, `battery`, `other_electronic`, `not_electronic`, `unknown`.

**Un buen conjunto de prueba** tiene entre 30 y 50 fotos variadas:
- placas con el modelo visible y sin él;
- componentes dañados y sanos;
- primeros planos de SMD;
- algunas fotos malas a propósito (desenfocadas, con reflejos o poca luz);
- 2 o 3 fotos que no sean electrónica, como control.

### Ejecutar

Primero, una comprobación gratuita. Valida las fotos y las etiquetas y estima el coste sin llamar a la IA:

```bash
npm run eval -- --dry-run
```

Prueba con pocas fotos antes de lanzar todo:

```bash
npm run eval -- --limit 3
```

La ejecución completa usa Opus 5.5 y Sonnet 5.5 si hay clave de Anthropic, y Gemini 3.6 Flash si solo hay clave de Gemini, con esfuerzo `high`:

```bash
npm run eval
```

Para continuar una evaluación que se cortó (por ejemplo, porque se agotó la cuota diaria de Gemini), repitiendo solo lo que falló o faltaba:

```bash
npm run eval -- --resume
```

Otras opciones: `--models opus,sonnet,haiku,gemini,gemini38`, `--effort medium`, `--max-edge 1568`, `--goal damage`, `--level beginner`, `--only foto.jpg`. Usa `npm run eval -- --help` para verlas todas.

### Leer los resultados

Cada ejecución crea una carpeta en `eval/results/` con:
- **`resumen.md`**: la tabla comparativa por modelo y una sección por foto, con la imagen, lo esperado y lo que respondió cada modelo. Ábrelo con la vista previa de Markdown de VS Code para ver las fotos.
- **`results.json`**: el informe completo de cada análisis, con el uso de tokens, el coste, la puntuación y los avisos de seguridad.

Las métricas automáticas detectan los fallos más graves:
- modelos inventados («Sin modelo visible: inventa uno»);
- especificaciones sin respaldo;
- daños no detectados y falsas alarmas.

**No sustituyen la revisión a mano.** Lee los informes y valora si las observaciones son correctas, si las hipótesis están bien justificadas y si las comprobaciones y los avisos de seguridad son adecuados.

## Decisiones técnicas

- **Imagen a 2576 px de lado máximo.** Es lo que admiten los modelos actuales y ayuda a leer serigrafías pequeñas. Cuesta hasta unos 4.800 tokens por imagen; con `--max-edge 1568` puedes medir si compensa.
- **Sin modelo de respaldo ante rechazos en la evaluación.** Falsearía la comparación entre modelos; los rechazos aparecen como error.
- **Los avisos de seguridad los añade el código**, a partir de la categoría y de los riesgos que señale el modelo. Así no dependen de que el modelo se acuerde de incluirlos.
- **La foto se envía sin metadatos.** La aplicación la reduce y la recodifica en el navegador, así que el EXIF y la ubicación GPS no salen del dispositivo; el servidor vuelve a validarla y tampoco la guarda.
- **Estados de carga reales.** El endpoint responde con un evento por línea (NDJSON): la interfaz solo muestra «Analizando con IA» cuando el servidor ha validado la imagen y ha empezado el análisis.
- **Cadena de modelos en la capa gratuita.** Gemini se satura a menudo. La aplicación prueba Gemini 3.6 Flash y, si está saturado o tarda más de 45 s, pasa a Gemini 3.8 Flash, con un máximo de 110 s en total. El informe indica qué modelo respondió. Flash-Lite se descartó porque en las pruebas leyó mal el modelo de una placa. Los reintentos automáticos del SDK de Google están desactivados porque multiplicaban las esperas y el consumo de cuota. La evaluación no usa la cadena, para no mezclar modelos.
- **Asistente sin estado en el servidor.** Cada pregunta envía la foto ya reducida, el informe y la conversación (máximo 20 mensajes). El servidor no guarda nada. La respuesta llega en streaming y, si un modelo está saturado antes de empezar a responder, pasa al siguiente de la cadena.
- **Historial solo en el dispositivo.** Cada análisis se guarda en IndexedDB del navegador con la foto reducida (sin metadatos), el informe y la conversación, que se actualiza con cada respuesta. Se conservan los 50 más recientes y se pueden borrar uno a uno o todos. No hay cuentas ni copia en la nube: cambiar de navegador o borrar los datos del sitio vacía el historial. En ventanas privadas puede no estar disponible, y la app lo indica.
- **Documentación sin enlaces inventados.** La búsqueda de Google de Gemini no está disponible en su capa gratuita, así que se usa Tavily. Solo se busca si el modelo exacto está identificado con confianza alta. Primero se busca en los dominios oficiales del fabricante (`src/core/docs/official-domains.ts`) y, si no hay nada, en el resto de la web. Un enlace se muestra solo si menciona el modelo exacto (fuera de la web oficial, en el título o la dirección) y si el servidor comprueba que responde. Esa comprobación solo admite https e IPs públicas, también en cada redirección, para evitar SSRF. Los resultados se guardan 24 h en memoria y en el historial, para no gastar búsquedas.
- **Límite de uso.** 8 análisis, 30 preguntas y 10 búsquedas de documentación cada 10 minutos por IP, en memoria. Con varias instancias en producción habrá que moverlo a un almacén compartido como Redis.
