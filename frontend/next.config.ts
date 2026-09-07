import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:8080/api/:path*",
      },
      {
        source: "/uploads/:path*",
        destination: "http://localhost:8080/uploads/:path*",
      },
    ];
  },
};

export default nextConfig;
