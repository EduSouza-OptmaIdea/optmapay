import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

import fs from 'fs';
import { loadEnv } from 'vite';

function apiDevMiddleware(env: Record<string, string>) {
  // Inject env vars to process.env in Node dev server
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) {
      process.env[k] = v;
    }
  }

  return {
    name: 'api-dev-middleware',
    configureServer(server: any) {
      server.middlewares.use(async (req: any, res: any, next: any) => {
        const urlObj = new URL(req.url || '/', 'http://localhost');
        const pathname = urlObj.pathname;

        if (!pathname.startsWith('/api/')) {
          return next();
        }

        // Mock de e-mail local para dev
        if (pathname === '/api/v1/email/send') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ success: true, message: 'Email simulado em sandbox local' }));
          return;
        }

        // Mapeia pathname para arquivo ts
        const possibleFiles = [
          path.resolve(__dirname, `.${pathname}.ts`),
          path.resolve(__dirname, `.${pathname}/index.ts`),
        ];

        let targetFile: string | null = null;
        for (const file of possibleFiles) {
          if (fs.existsSync(file)) {
            targetFile = file;
            break;
          }
        }

        if (!targetFile) {
          return next();
        }

        // Parse query params
        req.query = Object.fromEntries(urlObj.searchParams);

        // Parse body para métodos com payload
        if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method || '')) {
          const buffers: Buffer[] = [];
          for await (const chunk of req) {
            buffers.push(chunk);
          }
          const rawBody = Buffer.concat(buffers).toString('utf-8');
          try {
            req.body = rawBody ? JSON.parse(rawBody) : {};
          } catch {
            req.body = {};
          }
        }

        // Mock Vercel response helpers se não existirem
        if (!res.status) {
          res.status = (code: number) => {
            res.statusCode = code;
            return res;
          };
        }
        if (!res.json) {
          res.json = (data: any) => {
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(data));
            return res;
          };
        }

        try {
          const module = await server.ssrLoadModule(targetFile);
          if (typeof module.default === 'function') {
            await module.default(req, res);
          } else {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: 'Handler default não encontrado no módulo de API' }));
          }
        } catch (err: any) {
          console.error(`[API Dev Error ${pathname}]:`, err);
          if (!res.writableEnded) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: { message: err.message, stack: err.stack } }));
          }
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), apiDevMiddleware(env)],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    define: {
      'process.env': {},
    },
  };
});
