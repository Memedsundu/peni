import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` doesn't need a database; migrate commands do and will fail clearly without one.
  // Migrations take DIRECT_URL when set: Neon's pooled address (DATABASE_URL) can't hold the lock they need.
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://localhost/peni" },
});
