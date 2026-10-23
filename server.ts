import app from './api/index.ts';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configure Vite or Static Serve
async function setupServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.use('*', async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = (await import('fs')).readFileSync(
          path.resolve(__dirname, 'index.html'),
          'utf-8'
        );
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ 'Content-Type': 'text/html; charset=utf-8' }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  const args = process.argv.slice(2);
  let cliPort: number | undefined;
  let cliHost = '0.0.0.0';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      cliPort = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i].startsWith('--port=')) {
      cliPort = parseInt(args[i].split('=')[1], 10);
    } else if (args[i] === '--host' && args[i + 1]) {
      cliHost = args[i + 1];
      i++;
    } else if (args[i].startsWith('--host=')) {
      cliHost = args[i].split('=')[1];
    }
  }

  const PORT = cliPort || (process.env.NODE_ENV === 'production' && process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
  const HOST = cliHost;

  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 MCQ Genius Server running at http://${HOST}:${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Exiting process so process manager can restart.`);
      process.exit(1);
    } else {
      console.error('Server error:', err);
    }
  });
}

setupServer();
