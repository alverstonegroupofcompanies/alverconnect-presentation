import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
  },
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "icons/favicon.ico",
        "icons/apple-touch-icon.png",
        "assets/logo/logo-mark.svg",
      ],
      manifest: {
        name: "AlverConnect — Connecting the Future of Healthcare",
        short_name: "AlverConnect",
        description:
          "AlverConnect is a digital healthcare staffing platform connecting hospitals and qualified doctors with efficiency, transparency and trust. HOSPEX 2026.",
        theme_color: "#1f529b",
        background_color: "#1f529b",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        scope: "/",
        lang: "en",
        categories: ["business", "medical", "health"],
        icons: [
          {
            src: "icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff,woff2,jpg,jpeg,webp}"],
        navigateFallback: "/index.html",
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
});
