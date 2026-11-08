/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep automatic browser-test builds separate from the user's running app.
  distDir: process.env.P6_E2E_BUILD === '1' ? '.next-e2e' : '.next',
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
