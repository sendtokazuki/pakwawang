import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  const BUILD_TIME = "2026-03-01 17:55";

  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      version: BUILD_TIME,
      supabase_configured: !!supabaseUrl && !!supabaseKey,
      db_type: "Supabase"
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

  // API Routes (Supabase)
  app.get("/api/records", async (req, res) => {
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).json({ error: "Supabase belum dikonfigurasi di Vercel." });
    }

    try {
      const { data, error } = await supabase
        .from('health_records')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      console.error("Supabase Fetch Error:", err);
      res.status(500).json({ error: `Gagal mengambil data: ${err.message}` });
    }
  });

  app.post("/api/records", async (req, res) => {
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase belum dikonfigurasi" });
    
    try {
      const { data, error } = await supabase
        .from('health_records')
        .insert([req.body])
        .select();

      if (error) throw error;
      
      broadcast({ type: "RECORD_ADDED" });
      res.json(data[0]);
    } catch (err: any) {
      console.error("Supabase Insert Error:", err);
      res.status(500).json({ error: "Gagal menyimpan data" });
    }
  });

  app.delete("/api/records/:id", async (req, res) => {
    if (!supabaseUrl || !supabaseKey) return res.status(500).json({ error: "Supabase belum dikonfigurasi" });
    
    try {
      const { error } = await supabase
        .from('health_records')
        .delete()
        .eq('id', req.params.id);

      if (error) throw error;
      
      broadcast({ type: "RECORD_DELETED" });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Supabase Delete Error:", err);
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
    
    app.get("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = await vite.transformIndexHtml(url, `
          <!doctype html>
          <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Health Dashboard Pro</title>
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
