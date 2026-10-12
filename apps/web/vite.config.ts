import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "import.meta.env.VITE_BUILD_ID": JSON.stringify(
      process.env.VITE_BUILD_ID ?? process.env.SOURCE_COMMIT ?? "development",
    ),
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
});
