const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

let accessToken = null;
let renovando   = null;

export function setAccessToken(token) { accessToken = token; }
export function clearAccessToken() { accessToken = null; }

async function renovarToken() {
  if (renovando) return renovando;
  renovando = fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST', credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) throw new Error('No se pudo renovar el token');
      const data = await res.json();
      accessToken = data.accessToken;
      return accessToken;
    })
    .finally(() => { renovando = null; });
  return renovando;
}

export async function api(endpoint, opts = {}) {
  const hacerPeticion = async (token) => {
    const headers = {
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    return fetch(`${BASE_URL}${endpoint}`, {
      ...opts, credentials: 'include', headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  };

  let res = await hacerPeticion(accessToken);

  if (res.status === 401) {
    const data = await res.json().catch(() => ({}));
    if (data.code === 'TOKEN_EXPIRED') {
      try {
        const nuevoToken = await renovarToken();
        res = await hacerPeticion(nuevoToken);
      } catch {
        clearAccessToken();
        window.dispatchEvent(new Event('auth:logout'));
        throw new Error('Sesión expirada. Por favor, iniciá sesión nuevamente.');
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error del servidor' }));
    throw new Error(err.error || 'Error desconocido');
  }

  if (res.status === 204) return null;
  return res.json();
}

export const get   = (url, opts) => api(url, { ...opts, method: 'GET' });
export const post  = (url, body) => api(url, { method: 'POST',  body });
export const put   = (url, body) => api(url, { method: 'PUT',   body });
export const patch = (url, body) => api(url, { method: 'PATCH', body });
export const del   = (url)       => api(url, { method: 'DELETE' });
