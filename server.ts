import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

import { analyzeBloodTest } from "./src/services/gemini";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware for parsing JSON
  app.use(express.json({ limit: '50mb' }));

  // API Route for Gemini Analysis
  app.post("/api/analyze", async (req, res) => {
    try {
      const { input, profile, history } = req.body;
      
      if (!input) {
        return res.status(400).json({ error: "Falta el contenido para analizar." });
      }

      const report = await analyzeBloodTest(input, profile, history);
      res.json(report);
    } catch (error) {
      console.error("Server Analysis Error:", error);
      res.status(500).json({ 
        error: error instanceof Error ? error.message : "Error interno del servidor al procesar con IA." 
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
