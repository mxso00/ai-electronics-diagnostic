# Guía de validación: fotos y etiquetas

El objetivo es comprobar, con fotos reales hechas con tu móvil, si la app identifica bien los componentes, detecta los daños y, sobre todo, si **reconoce cuándo no sabe algo** en lugar de inventarlo.

## 1. Qué fotografiar (unas 40 fotos)

| Tipo | Cuántas | Para qué sirve |
|---|---|---|
| Placas con el **modelo legible** (placa base, tarjeta gráfica, router, placa de electrodoméstico…) | 8 | ¿Lee bien la serigrafía y da el modelo exacto? |
| Placas **sin modelo visible** (o con la etiqueta tapada) | 5 | ¿Se inventa un modelo? No debería |
| Componentes **con daño visible**: condensadores hinchados, quemaduras, corrosión, pines doblados, conectores rotos | 8 | ¿Detecta el daño y lo explica? |
| Componentes **sanos** | 6 | ¿Inventa daños que no hay? |
| **Componentes sueltos** con marcado: condensador electrolítico, resistencias, regulador o transistor, chip | 6 | ¿Lee valores y referencias? |
| Primeros planos de **componentes SMD** | 3 | El caso más difícil |
| Fotos **malas a propósito**: desenfocada, con reflejos, con poca luz | 3 | ¿Pide una foto mejor en vez de adivinar? |
| Algo que **no sea electrónica** (una taza, un libro…) | 2 | ¿Lo reconoce? |

No hace falta que sean exactamente estas cantidades: lo importante es la variedad.

## 2. Cómo hacer las fotos

- **Buena luz**, mejor natural. Evita el flash directo: crea reflejos en los chips y condensadores.
- **Un componente o una placa por foto**, ocupando buena parte del encuadre.
- Para leer el modelo, haz **otra foto acercándote a la etiqueta o la serigrafía**.
- Pásalas **a resolución completa** (AirDrop o cable). No las envíes por WhatsApp ni hagas capturas de pantalla: se comprimen y se pierde detalle.
- **Privacidad:** en el modo de pruebas (Gemini gratuito), Google puede usar las imágenes para mejorar sus modelos. No fotografíes caras, documentos ni etiquetas con datos personales.

## 3. Pasarlas al proyecto

1. Pásalas al Mac (con AirDrop llegan a Descargas).
2. Muévelas a la carpeta `eval/images/` del proyecto. Las fotos HEIC del iPhone valen tal cual.
3. En la terminal, dentro del proyecto:
   ```bash
   npm run eval:prepare
   ```
   Este comando convierte las fotos HEIC a JPEG y añade a `eval/labels.csv` una fila por cada foto nueva, con la categoría puesta como `REVISAR`.

## 4. Rellenar `eval/labels.csv`

Ábrelo con Numbers, Excel o un editor de texto. Hay una fila por foto:

| Columna | Qué poner |
|---|---|
| `file` | Ya viene puesto: el nombre de la foto |
| `category` | Cambia `REVISAR` por la categoría correcta (tabla siguiente) |
| `manufacturer` | El fabricante si lo sabes con certeza; si no, `-` |
| `model` | El modelo exacto **solo si se lee en la foto**. Si no se ve, deja `-`: así se detecta si la IA se lo inventa |
| `damage` | `yes` si hay daño visible, `no` si está sano, `unknown` si no lo sabes |
| `context` | Opcional: lo que contaría alguien con ese equipo («no enciende», «huele a quemado») |
| `notes` | Opcional: notas para ti |

**Categorías:**

| Valor | Significado | Valor | Significado |
|---|---|---|---|
| `motherboard` | Placa base | `capacitor` | Condensador |
| `graphics_card` | Tarjeta gráfica | `resistor` | Resistencia |
| `ram_module` | Memoria RAM | `transistor` | Transistor o regulador |
| `cpu` | Procesador | `diode` | Diodo |
| `power_supply` | Fuente de alimentación | `inductor` | Bobina |
| `storage_device` | Disco o SSD | `connector` | Conector |
| `appliance_board` | Placa de electrodoméstico | `cable` | Cable |
| `pcb_assembly` | Otra placa de circuito | `battery` | Batería |
| `electronic_module` | Módulo (Arduino, sensor…) | `other_electronic` | Otro componente |
| `integrated_circuit` | Chip / circuito integrado | `not_electronic` | No es electrónica |

Si tienes dudas con una categoría, pon la que mejor encaje y explícalo en `notes`.

## 5. Ejecutar la evaluación

Primero una comprobación gratuita (no llama a la IA):

```bash
npm run eval -- --dry-run
```

Después, la evaluación:

```bash
npm run eval
```

Con la capa gratuita de Gemini es normal que **se agote la cuota diaria** a mitad de camino. El progreso se guarda tras cada foto, así que al día siguiente continúa donde lo dejaste:

```bash
npm run eval -- --resume
```

`--resume` también repite las fotos que dieron error, por ejemplo cuando Gemini estaba saturado.

## 6. Revisar los resultados

Se guardan en `eval/results/<fecha>/resumen.md`. Ábrelo con la vista previa de Markdown de VS Code para ver cada foto junto a lo que respondió la IA.

Fíjate sobre todo en:
- **«Sin modelo visible: inventa uno»**: lo más grave. Revisa esas fotos una a una.
- **Daños no detectados y falsas alarmas.**
- **Incumplimientos**: especificaciones sin respaldo o hipótesis de avería sin ninguna anomalía.

Cuando lo tengas, avísame y lo revisamos juntos para ajustar las instrucciones del modelo.
