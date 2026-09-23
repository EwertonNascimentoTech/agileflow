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
        // Isola vendors pesados em chunks próprios, cacheáveis e compartilhados entre as rotas
        // lazy. Grupos do Rolldown (o `manualChunks` antigo virava grupo e puxava as
        // dependências junto: o React caía dentro de vendor-charts/markdown e a tela de login
        // pré-carregava gráficos + markdown + dnd, ~160 kB gzip). O grupo do React tem a maior
        // prioridade: o que ele captura sai dos outros grupos.
        codeSplitting: {
          groups: [
            {
              name: "vendor-react",
              priority: 30,
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|react-is|clsx|prop-types|use-sync-external-store)[\\/]/,
            },
            { name: "vendor-charts", priority: 20, test: /node_modules[\\/].*recharts/ },
            { name: "vendor-markdown", priority: 20, test: /node_modules[\\/].*(react-markdown|remark-|micromark|mdast)/ },
            { name: "vendor-dnd", priority: 20, test: /node_modules[\\/]@dnd-kit[\\/]/ },
          ],
        },
      },
    },
  },
})
