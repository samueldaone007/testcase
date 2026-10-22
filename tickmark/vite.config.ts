import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { handleAssistant } from './server/assistant.mjs'

/**
 * In dev, Vite serves the client but there is no Node server in front of it, so
 * this middleware exposes the same /api/assistant endpoint the production
 * server provides. It keeps the API key on the server side in both modes.
 */
function assistantEndpoint(): Plugin {
  return {
    name: 'tickmark-assistant-endpoint',
    configureServer(server) {
      server.middlewares.use('/api/assistant', (req, res) => {
        handleAssistant(req, res).catch((err) => {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Unexpected error.' }))
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), assistantEndpoint()],
})
