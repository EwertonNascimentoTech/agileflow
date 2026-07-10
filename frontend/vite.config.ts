import path from "path"
import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Isola vendors pesados em chunks próprios, cacheáveis e compartilhados
        // entre as rotas lazy (evita duplicá-los em cada chunk de página).
        // Forma de função (a de objeto conflita com a tipagem do Rollup).
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return
          if (id.includes("recharts")) return "vendor-charts"
          if (id.includes("react-markdown") || id.includes("remark-") || id.includes("micromark") || id.includes("mdast")) return "vendor-markdown"
          if (id.includes("@dnd-kit")) return "vendor-dnd"
          if (id.includes("react-router") || id.includes("/react-dom/") || id.includes("/react/")) return "vendor-react"
        },
      },
    },
  },
})
