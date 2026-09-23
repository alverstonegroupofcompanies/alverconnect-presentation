import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  server: {
    port: 5173,
    open: true,
    headers: {
      // Avoid sticky browser/SW caches while iterating on public assets.
      "Cache-Control": "no-store",
    },
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
        // Don't precache large slide PNGs — they change often under the same filename.
        globPatterns: ["**/*.{js,css,html,ico,svg,woff,woff2}"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/assets/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "alver-assets",
              networkTimeoutSeconds: 4,
              expiration: {
                maxEntries: 120,
                maxAgeSeconds: 60 * 60 * 24,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      // Service worker in dev was serving stale replaced images until hard reload.
      devOptions: {
        enabled: false,
      },
    }),
  ],
});
