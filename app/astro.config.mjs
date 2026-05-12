import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import vercel from "@astrojs/vercel";

export default defineConfig({
  output: "server",
  adapter: vercel(),
  integrations: [react()],
  site: "https://book.lifelongpep.fit",
  server: { port: 4321, host: true },
  vite: {
    ssr: {
      noExternal: ["ical-generator"],
    },
  },
});
