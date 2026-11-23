import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const identityProxyTarget = env.VITE_IDENTITY_PROXY_TARGET || "https://api.fonitas.com";

  return {
    server: {
      // Browser calls same-origin /fonitas-api in DEV to avoid CORS on localhost.
      proxy: {
        "/fonitas-api": {
          target: identityProxyTarget,
          changeOrigin: true,
          secure: true,
          rewrite: path => path.replace(/^\/fonitas-api/, ""),
        },
      },
    },
  };
});
