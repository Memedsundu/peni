/** The longest side a photo keeps; enough for a phone held sideways, small enough to send quickly. */
const MAX_SIDE = 1600;

/**
 * Shrinks a photo in the browser before it's sent (plan piece 14): turned the right way up,
 * at most 1600px on its longest side, as WebP (JPEG where the browser can't make WebP).
 * Phone photos of 4–12 MB come out at a few hundred KB.
 */
export async function shrinkPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const as = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.82));
  const webp = await as("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await as("image/jpeg");
  if (!jpeg) throw new Error("Could not read this photo");
  return jpeg;
}
