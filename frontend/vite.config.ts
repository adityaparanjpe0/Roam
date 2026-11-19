import react from '@vitejs/plugin-react'
import { createLogger, defineConfig } from 'vite'

// Vite's default proxy-error logger includes req.url, which can contain an
// OAuth code. Preserve an actionable error without logging URL/header details.
const logger = createLogger()
const writeError = logger.error.bind(logger)
logger.error = (message, options) => {
  if (message.includes('proxy error:')) {
    writeError('Roam backend proxy failed. Check that FastAPI is running.', { timestamp: options?.timestamp })
  } else {
    writeError(message, options)
  }
}

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
  plugins: [react(), {
    name: 'roam-auth-proxy-privacy',
    configResolved(config) {
      // Vite DEBUG logs bypass customLogger and print proxied URLs. Fail closed
      // instead of running an OAuth proxy with callback-query logging enabled.
      if (config.command === 'serve' && process.env.DEBUG) {
        throw new Error('Disable DEBUG before running the Roam auth proxy; OAuth callback URLs contain credentials.')
      }
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '^/health$': {
        target: 'http://127.0.0.1:8000',
        proxyTimeout: 5_000,
      },
      '^/api(?:/|$)': {
        target: 'http://127.0.0.1:8000',
        proxyTimeout: 15_000,
      },
      '^/auth(?:/|$)': {
        target: 'http://127.0.0.1:8000',
        proxyTimeout: 40_000,
      },
    },
  },
})
