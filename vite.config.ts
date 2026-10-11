import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from 'vite';
import react from '@vitejs/plugin-react';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Local development bridge: serves the Vercel functions in /api through the
 * Vite dev server, so `npm run dev` works without the Vercel CLI.
 * In production, Vercel runs the very same files as serverless functions.
 */
function apiDevBridge(): Plugin {
  return {
    name: 'marketlab-api-dev-bridge',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();
        const url = new URL(req.url, 'http://localhost');
        const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
        if (!/^[a-z-]+$/.test(name)) return next();
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const headers = new Headers();
          for (const [k, v] of Object.entries(req.headers)) {
            if (typeof v === 'string') headers.set(k, v);
          }
          const response: Response = await mod.GET(new Request(url.toString(), { headers }));
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ error: { code: 'INTERNAL', message: String(err) } }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
  return {
    plugins: [react(), apiDevBridge()],
    test: { environment: 'node', include: ['tests/**/*.test.ts'] },
    build: {
      rollupOptions: {
        output: {
          manualChunks: { tradingview: ['lightweight-charts'], recharts: ['recharts'] },
        },
      },
    },
  };
});
