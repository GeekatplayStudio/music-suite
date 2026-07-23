import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/index",
        destination: "/",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
