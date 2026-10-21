try {
  const port = process.env.PORT ?? '3000'
  const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(3000) })
  const body = await response.json()
  if (response.status !== 200 || body.status !== 'ok') process.exitCode = 1
} catch {
  process.exitCode = 1
}
