import { createServer } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const clientDir = join(__dirname, 'dist', 'client')

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

// Import the SSR server
const { default: server } = await import('./dist/server/server.js')

const httpServer = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`)

  // Try to serve static files from dist/client
  const filePath = join(clientDir, url.pathname)
  if (url.pathname !== '/' && existsSync(filePath)) {
    try {
      const data = readFileSync(filePath)
      const ext = extname(filePath)
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Cache-Control': url.pathname.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
      })
      res.end(data)
      return
    } catch {}
  }

  // SSR handler
  try {
    const headers = {}
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers[key] = value
    }

    const request = new Request(url.href, {
      method: req.method,
      headers,
    })

    const response = await server.fetch(request)

    res.writeHead(response.status, Object.fromEntries(response.headers.entries()))
    let body = await response.text()

    // Prevent FOUC: hide body until CSS + JS are ready
    body = body
      .replace('<body>', '<body style="opacity:0">')
      .replace('</body>', '<script>requestAnimationFrame(()=>requestAnimationFrame(()=>{document.body.style.opacity="1";document.body.style.transition="opacity .2s"}))</script></body>')

    res.end(body)
  } catch (err) {
    console.error('SSR Error:', err)
    res.writeHead(500)
    res.end('Internal Server Error')
  }
})

const port = process.env.PORT || 3000
httpServer.listen(port, '0.0.0.0', () => {
  console.log(`Frontend server listening on http://0.0.0.0:${port}`)
})
