import sharp from "sharp";

// Lado máximo que aceptan los modelos actuales con visión de alta resolución.
// Más resolución ayuda a leer serigrafías pequeñas, a cambio de más tokens.
export const DEFAULT_MAX_EDGE = 2576;

// Límite de la API por imagen en base64 (5 MB); dejamos margen.
const MAX_BASE64_BYTES = 4.5 * 1024 * 1024;

const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp", "heif", "tiff", "gif"]);

export class ImageError extends Error {}

export interface PreparedImage {
  base64: string;
  mediaType: "image/jpeg";
  width: number;
  height: number;
  bytes: number;
}

// Valida el archivo por su contenido real (no por la extensión), corrige la
// orientación, reduce el tamaño y lo recodifica como JPEG. sharp no copia los
// metadatos al recodificar, así que el EXIF (incluida la ubicación GPS) se
// descarta y nunca sale del equipo.
export async function prepareImage(input: Buffer, maxEdge = DEFAULT_MAX_EDGE): Promise<PreparedImage> {
  const meta = await sharp(input)
    .metadata()
    .catch(() => {
      throw new ImageError("El archivo no es una imagen válida o está dañado.");
    });
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
    throw new ImageError(`Formato no admitido: ${meta.format ?? "desconocido"}.`);
  }
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < 200) {
    throw new ImageError("La imagen es demasiado pequeña para analizarla (mínimo 200 px por lado).");
  }

  for (const quality of [88, 78, 65]) {
    const encoded = await sharp(input)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        // Típico de fotos HEIC de iPhone: la versión precompilada de sharp no
        // decodifica HEVC.
        throw new ImageError(
          "No se ha podido decodificar la imagen. Si es una foto HEIC de iPhone, conviértela a JPEG (en Mac: sips -s format jpeg foto.heic --out foto.jpg).",
        );
      });
    const base64 = encoded.data.toString("base64");
    if (base64.length <= MAX_BASE64_BYTES) {
      return {
        base64,
        mediaType: "image/jpeg",
        width: encoded.info.width,
        height: encoded.info.height,
        bytes: encoded.data.length,
      };
    }
  }
  throw new ImageError("La imagen sigue siendo demasiado grande tras comprimirla.");
}
