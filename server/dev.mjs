process.env.API_ONLY = 'true'
process.env.PORT ??= '3001'
await import('./index.mjs')
