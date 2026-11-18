// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest'
import { resolveConfig } from 'vite'
import config from '../../vite.config'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

test('all API and auth namespaces are proxied without path or Origin rewriting', () => {
  const proxies = config.server?.proxy
  expect(proxies?.['^/api(?:/|$)']).toEqual({ target: 'http://127.0.0.1:8000', proxyTimeout: 15_000 })
  expect(proxies?.['^/auth(?:/|$)']).toEqual({ target: 'http://127.0.0.1:8000', proxyTimeout: 40_000 })
  expect(proxies?.['^/health$']).toEqual({ target: 'http://127.0.0.1:8000', proxyTimeout: 5_000 })
})

test('proxy errors never log callback query, token, or original error stack', () => {
  const output = vi.spyOn(console, 'error').mockImplementation(() => {})
  config.customLogger?.error('http proxy error: /auth/google/callback?code=SENSITIVE', {
    error: new Error('SENSITIVE-STACK'),
  })
  const printed = output.mock.calls.flat().join(' ')
  expect(printed).toContain('Roam backend proxy failed')
  expect(printed).not.toContain('SENSITIVE')
})

test('debug logging cannot enable raw proxied callback URL logs', async () => {
  vi.stubEnv('DEBUG', 'vite:*')
  await expect(resolveConfig({ ...config, configFile: false }, 'serve', 'development')).rejects.toThrow('Disable DEBUG')
})
