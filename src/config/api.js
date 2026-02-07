const PROD_API_BASE_URL = '';

export const apiUrl = (endpoint) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // THIS IS FOR DEV: use Vite proxy (same-origin)
  if (import.meta.env.DEV) return path;

  // now prod: hit the real domain
  return `${PROD_API_BASE_URL}${path}`;
};

export default PROD_API_BASE_URL;
