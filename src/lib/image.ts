const MAX_SIDE = 1024;

/**
 * Shrink a photo before it leaves the browser. A phone camera produces
 * several megabytes; a plate is readable at 1024px, and the smaller payload
 * is the difference between a snappy answer and a timeout on a bad signal.
 * Aspect ratio is kept — cropping a plate square can cut food off the edge.
 */
export async function shrinkImage(
  file: File,
  maxSide = MAX_SIDE,
  quality = 0.8,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Couldn't process that image.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", quality);
}
