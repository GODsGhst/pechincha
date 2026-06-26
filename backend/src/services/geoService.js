const axios = require('axios');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CACHE = 500;
const cache = new Map();

function chaveEndereco(endereco) {
  return String(endereco || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function lerCache(chave) {
  const item = cache.get(chave);
  if (!item) return undefined;
  if (Date.now() - item.criadoEm > CACHE_TTL_MS) {
    cache.delete(chave);
    return undefined;
  }
  return item.valor;
}

function salvarCache(chave, valor) {
  if (cache.size >= MAX_CACHE) {
    const [primeira] = cache.keys();
    cache.delete(primeira);
  }
  cache.set(chave, { valor, criadoEm: Date.now() });
}

// Geocodificação gratuita via Nominatim (OpenStreetMap).
// Sem API key; exige User-Agent identificável e tolera falha:
// se não conseguir geocodificar, o estabelecimento fica sem coordenadas
// e pode ser ajustado depois via PUT /api/estabelecimentos/:id.
async function geocodificarEndereco(endereco) {
  if (!endereco) return null;
  const chave = chaveEndereco(endereco);
  const emCache = lerCache(chave);
  if (emCache !== undefined) return emCache;

  try {
    const resposta = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: endereco, format: 'json', limit: 1, countrycodes: 'br' },
      timeout: 5000,
      headers: { 'User-Agent': 'ComparadorPrecos/1.0 (projeto academico)' }
    });

    const resultado = resposta.data && resposta.data[0];
    if (!resultado) {
      salvarCache(chave, null);
      return null;
    }

    const coords = { lat: Number(resultado.lat), lng: Number(resultado.lon) };
    salvarCache(chave, coords);
    return coords;
  } catch (_err) {
    salvarCache(chave, null);
    return null;
  }
}

module.exports = { geocodificarEndereco };
