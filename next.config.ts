import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      {
        source: "/agendamentos",
        destination: "/nova-consulta",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
