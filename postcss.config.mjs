// The production script uses webpack, so the Turbopack-only CSS loader is not
// enough. Process utilities in production as well as during local development.
const config = {
  plugins: { '@tailwindcss/postcss': {} },
};

export default config;
