// Preparación de la foto en el navegador antes de enviarla: aplica la
// orientación, la reduce al tamaño que usa el modelo y la recodifica como
// JPEG. Al recodificar se pierden los metadatos (EXIF, ubicación GPS), así
// que nunca salen del dispositivo.

const MAX_EDGE = 2576;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;

export class ClientImageError extends Error {}

export async function prepareForUpload(file: File): Promise<Blob> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new ClientImageError("El archivo no es una imagen.");
  }
  if (file.size > MAX_INPUT_BYTES) {
    throw new ClientImageError("La imagen es demasiado grande (máximo 40 MB).");
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ClientImageError("No podemos leer esta imagen. Prueba con una foto en JPEG o PNG.");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (Math.min(width, height) < 200) {
    bitmap.close();
    throw new ClientImageError("La imagen es demasiado pequeña para analizarla.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ClientImageError("Tu navegador no permite procesar la imagen.");
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
  if (!blob) throw new ClientImageError("No hemos podido preparar la imagen.");
  return blob;
}
