import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@peni/core", "@peni/api", "@peni/brand"],
};

export default config;
