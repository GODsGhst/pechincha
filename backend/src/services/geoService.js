const axios = require('axios');

// Geocodificação gratuita via Nominatim (OpenStreetMap).
// Sem API key; exige User-Agent identificável e tolera falha:
// se não conseguir geocodificar, o estabelecimento fica sem coordenadas
// e pode ser ajustado depois via PUT /api/estabelecimentos/:id.
async function geocodificarEndereco(endereco) {
  if (!endereco) return null;

  try {
    const resposta = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: { q: endereco, format: 'json', limit: 1, countrycodes: 'br' },
      timeout: 8000,
      headers: { 'User-Agent': 'ComparadorPrecos/1.0 (projeto academico)' }
    });

    const resultado = resposta.data && resposta.data[0];
    if (!resultado) return null;

    return { lat: Number(resultado.lat), lng: Number(resultado.lon) };
  } catch (_err) {
    return null;
  }
}

module.exports = { geocodificarEndereco };
