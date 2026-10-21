import { createApp } from './app.mjs'

const port = Number(process.env.PORT ?? 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer between 1 and 65535')
const app = createApp({ serveClient: process.env.API_ONLY !== 'true' })
const server = app.listen(port, '0.0.0.0', () => {
  console.info(`BI Academy listening on 0.0.0.0:${port}`)
})
server.on('error', (error) => { console.error(error.message); process.exitCode = 1 })
server.once('close', () => app.locals.closeDatabase())

function shutdown() {
  server.close(() => { process.exitCode = 0 })
  setTimeout(() => { server.closeAllConnections() }, 5000).unref()
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
