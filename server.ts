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

  const GAS_URL = process.env.GAS_WEB_APP_URL || process.env.VITE_GAS_WEB_APP_URL;

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", mode: "Google Sheets Full" });
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
      console.warn("GAS_WEB_APP_URL is not configured");
      return res.json([]);
    }
    try {
      console.log("Fetching records from GAS...");
      const response = await fetch(GAS_URL);
      if (!response.ok) {
        const errorText = await response.text();
        console.error("GAS Fetch Error:", response.status, errorText);
        throw new Error(`GAS returned ${response.status}`);
      }
      const data = await response.json();
      res.json(data);
    } catch (err) {
      console.error("Error fetching from GAS:", err);
      res.status(500).json({ error: "Gagal mengambil data dari Google Sheets. Pastikan URL GAS benar dan sudah di-deploy sebagai 'Anyone'." });
    }
  });

  app.post("/api/records", async (req, res) => {
    if (!GAS_URL) return res.status(500).json({ error: "Google Sheets URL tidak dikonfigurasi" });
    try {
      console.log("Saving record to GAS...");
      const response = await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req.body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error("GAS Post Error:", response.status, errorText);
        throw new Error(`GAS returned ${response.status}`);
      }
      const result = await response.json();
      broadcast({ type: "RECORD_ADDED" });
      res.json(result);
    } catch (err) {
      console.error("Error saving to GAS:", err);
      res.status(500).json({ error: "Gagal menyimpan ke Google Sheets" });
    }
  });

  app.delete("/api/records/:id", async (req, res) => {
    if (!GAS_URL) return res.status(500).json({ error: "Google Sheets URL tidak dikonfigurasi" });
    try {
      // Kita kirim action delete ke GAS karena GAS tidak mendukung method DELETE secara native dengan mudah
      await fetch(GAS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: 'delete', timestamp: req.params.id })
      });
      broadcast({ type: "RECORD_DELETED" });
      res.json({ success: true });
    } catch (err) {
      console.error("Error deleting from GAS:", err);
      res.status(500).json({ error: "Gagal menghapus data" });
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
