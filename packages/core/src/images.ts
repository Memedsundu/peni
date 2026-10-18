/**
 * Photos a café uploads (plan piece 14: the feed; menu photos can use them too). The
 * browser shrinks a photo before it's sent, so each one stays small enough to keep in
 * Postgres for now; a file store can take over behind this interface later.
 */
export interface StoredImage {
  id: string;
  cafeId: string;
  contentType: ImageType;
  bytes: Uint8Array;
  /** The staff member who uploaded it. */
  uploadedBy: string;
  createdAt: Date;
}

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

/** The most one photo may weigh once the browser has shrunk it. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export interface ImageStore {
  save(image: StoredImage): Promise<void>;
  get(id: string): Promise<StoredImage | null>;
}

export class InMemoryImageStore implements ImageStore {
  private readonly images = new Map<string, StoredImage>();
  async save(image: StoredImage) {
    this.images.set(image.id, { ...image, bytes: image.bytes.slice() });
  }
  async get(id: string) {
    const i = this.images.get(id);
    return i ? { ...i, bytes: i.bytes.slice() } : null;
  }
}

/** What the bytes really are, by their first bytes; null for anything that isn't a photo we take. */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
  const at = (i: number, ...b: number[]) => b.every((x, k) => bytes[i + k] === x);
  if (at(0, 0xff, 0xd8, 0xff)) return "image/jpeg";
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "image/png";
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return "image/webp";
  return null;
}

/** Where an uploaded photo is served from. */
export const imageUrl = (id: string) => `/api/v1/images/${id}`;

/** The image id behind one of our own photo URLs, or null for anything else. */
export function imageIdOf(url: string): string | null {
  const m = /^\/api\/v1\/images\/(img_[A-Za-z0-9-]{8,64})$/.exec(url);
  return m ? m[1]! : null;
}
