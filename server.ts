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

  // URL Cadangan jika Environment Variable tidak diatur di Vercel
  const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbyTB8FiRcuwgyiiKam-D7DayFsyqSy5gwqLN2iCPpSLmRXLSoM2tCevaRopdRYvUgfj/exec";
  
  const envGasUrl = (process.env.GAS_WEB_APP_URL || process.env.VITE_GAS_WEB_APP_URL || "").trim();
  const GAS_URL = envGasUrl || DEFAULT_GAS_URL;

  console.log("GAS Configuration Status:");
  console.log("- Environment URL:", envGasUrl ? "Detected" : "Not Detected");
  console.log("- Final GAS URL:", GAS_URL.substring(0, 40) + "...");

  app.get("/api/health", (req, res) => {
    const isDefault = GAS_URL === DEFAULT_GAS_URL;
    res.json({ 
      status: "ok", 
      mode: "Google Sheets Full",
      gas_configured: true, // Always true now because of fallback
      gas_valid: GAS_URL.includes("/exec"),
      gas_preview: `${GAS_URL.substring(0, 25)}...${GAS_URL.slice(-10)}`,
      is_using_fallback: isDefault
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
        redirect: "follow" // Ensure we follow Google's redirects
      });
      
      if (response.status === 404) {
        return res.status(500).json({ error: "Google Apps Script tidak ditemukan (404). Pastikan URL sudah benar dan script sudah di-deploy ulang." });
      }

      const text = await response.text();
      
      if (!response.ok) {
        console.error("GAS Error Response:", response.status, text.substring(0, 200));
        return res.status(500).json({ error: `Google Sheets mengembalikan error ${response.status}: ${text.substring(0, 50)}` });
      }

      try {
        const data = JSON.parse(text);
        res.json(data);
      } catch (parseErr) {
        console.error("GAS Response is not JSON:", text.substring(0, 200));
        if (text.includes("Google Accounts") || text.includes("login") || text.includes("Sign in")) {
          return res.status(500).json({ error: "Akses ditolak. Pastikan Google Apps Script di-deploy dengan akses 'Anyone' (Bukan 'Anyone with Google Account')." });
        }
        if (text.includes("not found") || text.includes("NotFound")) {
          return res.status(500).json({ error: "Halaman script tidak ditemukan. Pastikan URL Web App Anda benar dan sudah di-deploy." });
        }
        return res.status(500).json({ error: "Format data dari Google Sheets salah. Pastikan script sudah di-deploy sebagai Web App." });
      }
    } catch (err: any) {
      console.error("Error fetching from GAS:", err);
      res.status(500).json({ error: `Gagal terhubung ke Google Sheets: ${err.message}` });
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
