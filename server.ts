import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // Google Apps Script Web App URL from environment variables
  const GAS_URL = (process.env.GAS_WEB_APP_URL || process.env.VITE_GAS_WEB_APP_URL || "").trim();

  const BUILD_TIME = "2026-03-01 17:05"; // Versi Reset Bersih

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      version: BUILD_TIME,
      gas_configured: !!GAS_URL, 
      gas_valid: GAS_URL.includes("/exec"),
      gas_preview: GAS_URL ? `${GAS_URL.substring(0, 25)}...${GAS_URL.slice(-10)}` : "Belum diatur"
    });
  });

  // Broadcast to all clients
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // API Routes (Proxying to Google Sheets)
  app.get("/api/records", async (req, res) => {
    if (!GAS_URL) {
      return res.status(500).json({ error: "GAS_WEB_APP_URL belum dikonfigurasi di Environment Variables Vercel." });
    }
    
    if (GAS_URL.includes("/edit") || !GAS_URL.includes("/exec")) {
      return res.status(500).json({ error: "URL Google Apps Script tidak valid. Pastikan menggunakan URL 'Web App' (akhiran /exec), bukan URL editor." });
    }

    try {
      console.log("Fetching records from GAS...");
      const response = await fetch(GAS_URL, {
        method: "GET",
        headers: { "Accept": "application/json" },
        redirect: "follow"
      });
      
      const text = await response.text();
      
      if (!response.ok) {
        return res.status(500).json({ error: `Google Sheets error ${response.status}` });
      }

      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (parseErr) {
        if (text.includes("Google Accounts") || text.includes("login")) {
          return res.status(500).json({ error: "Akses ditolak. Set akses ke 'Anyone'." });
        }
        return res.status(500).json({ error: "Format data salah." });
      }
    } catch (err: any) {
      res.status(500).json({ error: `Gagal terhubung: ${err.message}` });
    }
  });

  app.post("/api/records", async (req, res) => {
    if (!GAS_URL) return res.status(500).json({ error: "URL tidak dikonfigurasi" });
    try {
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      const result = await response.json();
      broadcast({ type: "RECORD_ADDED" });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: "Gagal menyimpan" });
    }
  });

  app.delete("/api/records/:id", async (req, res) => {
    if (!GAS_URL) return res.status(500).json({ error: "URL tidak dikonfigurasi" });
    try {
      await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: 'delete', timestamp: req.params.id })
      });
      broadcast({ type: "RECORD_DELETED" });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Gagal menghapus" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    
    // Fallback for SPA routing in dev mode
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await vite.transformIndexHtml(url, `
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Catatan Kesehatan Bapak</title>
            </head>
            <body>
              <div id="root"></div>
              <script type="module" src="/src/main.tsx"></script>
            </body>
          </html>
        `);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e) {
        vite.ssrFixStacktrace(e as Error);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
