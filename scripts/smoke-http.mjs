import assert from 'node:assert/strict'

const base = process.env.HTTP_BASE_URL ?? 'http://127.0.0.1:3000'
const health = await fetch(`${base}/healthz`)
assert.equal(health.status, 200)
assert.deepEqual(await health.json(), { status: 'ok' })

for (const path of ['/', '/intro', '/assessment', '/results', '/development', '/print', '/demo']) {
  const response = await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } })
  assert.equal(response.status, 200, path)
  assert.match(response.headers.get('content-type') ?? '', /text\/html/)
  const html = await response.text()
  assert.match(html, /id="root"/)
  if (path === '/') {
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+)"/g)]
    assert.ok(assets.length > 0, 'Built assets not found')
    for (const asset of assets) {
      const assetResponse = await fetch(`${base}${asset[1]}`)
      assert.equal(assetResponse.status, 200)
      assert.match(assetResponse.headers.get('content-type') ?? '', asset[1]?.endsWith('.css') ? /text\/css/ : /javascript/)
    }
  }
}
for (const path of ['/assets/missing.js', '/assets/missing', '/missing.css', '/api/missing']) {
  assert.equal((await fetch(`${base}${path}`, { headers: { Accept: 'text/html' } })).status, 404, path)
}
console.info(`HTTP smoke passed: ${base}`)
