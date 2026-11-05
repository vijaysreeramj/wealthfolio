export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function errorMessage(body, status) {
  if (!body) return `Request failed (${status})`
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail)) {
    // FastAPI validation errors
    return body.detail
      .map((d) => {
        const msg = (d.msg || '').replace(/^Value error, /, '')
        const field = d.loc?.filter((x) => x !== 'body').join('.')
        return field && !msg.toLowerCase().includes('choose') ? `${field.replaceAll('_', ' ')}: ${msg}` : msg
      })
      .join('. ')
  }
  return `Request failed (${status})`
}

async function request(method, path, body, params) {
  let url = `/api${path}`
  if (params) {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''))
    if ([...qs].length) url += `?${qs}`
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('wf:unauthorized'))
    throw new ApiError(res.status, errorMessage(data, res.status))
  }
  return data
}

export const api = {
  get: (path, params) => request('GET', path, undefined, params),
  post: (path, body) => request('POST', path, body ?? {}),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
}
