import type { ImageStore, ImageType, StoredImage } from "@peni/core";
import type { Db } from "./db";

export class PrismaImageStore implements ImageStore {
  constructor(private readonly db: Db) {}

  async save(image: StoredImage): Promise<void> {
    const { id, ...rest } = image;
    const data = { ...rest, bytes: Buffer.from(rest.bytes) };
    await this.db().cafeImage.upsert({ where: { id }, create: { id, ...data }, update: data });
  }

  async get(id: string): Promise<StoredImage | null> {
    const row = await this.db().cafeImage.findUnique({ where: { id } });
    return row ? { ...row, contentType: row.contentType as ImageType, bytes: new Uint8Array(row.bytes) } : null;
  }
}
