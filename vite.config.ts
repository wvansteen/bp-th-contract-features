import adapter from "@sveltejs/adapter-vercel";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig(({ command }) => ({
  plugins: [sveltekit({ adapter: adapter({ runtime: "bun1.x" }) })],
  ...(command === "build" ? { ssr: { noExternal: true } } : {}),
  server: {
    allowedHosts: ["host.containers.internal"],
  },
}));
