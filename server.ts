import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Helper to get Supabase keys (Priority: Headers > Env)
const getSupabaseConfig = (req: express.Request) => {
  const headerUrl = req.headers['x-supabase-url'] as string;
  const headerKey = req.headers['x-supabase-key'] as string;
  
  const url = (headerUrl && headerUrl.trim()) || process.env.SUPABASE_URL || "";
  const key = (headerKey && headerKey.trim()) || process.env.SUPABASE_ANON_KEY || "";
  
  return { url, key };
};

const getSupabase = (req: express.Request) => {
  const { url, key } = getSupabaseConfig(req);
  
  if (!url || !key) return null;
  
  // Create a new client per request if using headers to avoid stale closures
  // or cache if using env vars
  return createClient(url, key);
};

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  const BUILD_TIME = "2026-03-01 19:25";

  app.get("/api/health", (req, res) => {
    const { url, key } = getSupabaseConfig(req);
    
    res.json({ 
      status: "ok", 
      version: BUILD_TIME,
      supabase_configured: !!url && !!key,
      db_type: "Supabase",
      debug: {
        has_url: !!url,
        has_key: !!key,
        url_preview: url ? `${url.substring(0, 15)}...` : "missing",
        source: req.headers['x-supabase-url'] ? "Manual (Header)" : "Vercel (Env)"
      }
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
    const client = getSupabase(req);
    if (!client) {
      return res.status(500).json({ error: "Supabase belum terhubung. Silakan atur URL dan Key." });
    }

    try {
      const { data, error } = await client
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
    const client = getSupabase(req);
    if (!client) return res.status(500).json({ error: "Supabase belum terhubung" });
    
    try {
      const { data, error } = await client
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
    const client = getSupabase(req);
    if (!client) return res.status(500).json({ error: "Supabase belum terhubung" });
    
    try {
      const { error } = await client
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
