import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` doesn't need a database; migrate commands do and will fail clearly without one.
  datasource: { url: process.env.DATABASE_URL ?? "postgresql://localhost/peni" },
});
