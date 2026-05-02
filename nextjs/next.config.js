/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    unoptimized: true,
    domains: ['localhost', '127.0.0.1'],
  },
  async rewrites() {
    return [
      // Proxy avatar animations
      {
        source: '/avatars/:path*',
        destination: 'http://localhost/avatars/:path*',
      },
      // Proxy course resources
      {
        source: '/resources/:path*',
        destination: 'http://localhost/resources/:path*',
      },
      {
        source: '/miniapps/:path*',
        destination: 'http://localhost/miniapps/:path*',
      },
    ];
  },
};

module.exports = nextConfig;
