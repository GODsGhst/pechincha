const METODOS_PERMITIDOS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']);
const METODOS_COM_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const MAX_URL_LENGTH = 2000;
const MAX_QUERY_PARAMS = 20;
const MAX_QUERY_KEY_LENGTH = 60;
const MAX_QUERY_VALUE_LENGTH = 220;
const MAX_QUERY_ARRAY_LENGTH = 5;

function temCorpo(req) {
  const contentLength = Number(req.headers['content-length'] || 0);
  return contentLength > 0 || Boolean(req.headers['transfer-encoding']);
}

function valoresQueryValidos(valor) {
  if (Array.isArray(valor)) {
    return valor.length <= MAX_QUERY_ARRAY_LENGTH && valor.every(valoresQueryValidos);
  }
  if (valor && typeof valor === 'object') return false;
  return String(valor || '').length <= MAX_QUERY_VALUE_LENGTH;
}

function requestHardening(req, res, next) {
  if (!METODOS_PERMITIDOS.has(req.method)) {
    res.setHeader('Allow', [...METODOS_PERMITIDOS].join(', '));
    return res.status(405).json({ error: 'Método não permitido' });
  }

  if (String(req.originalUrl || req.url || '').length > MAX_URL_LENGTH) {
    return res.status(414).json({ error: 'URL muito longa' });
  }

  if (METODOS_COM_BODY.has(req.method) && temCorpo(req) && !req.is('application/json')) {
    return res.status(415).json({ error: 'Use Content-Type application/json' });
  }

  const query = Object.entries(req.query || {});
  if (query.length > MAX_QUERY_PARAMS) {
    return res.status(400).json({ error: 'Muitos parâmetros de consulta' });
  }

  for (const [chave, valor] of query) {
    if (String(chave).length > MAX_QUERY_KEY_LENGTH || !valoresQueryValidos(valor)) {
      return res.status(400).json({ error: 'Parâmetro de consulta inválido' });
    }
  }

  return next();
}

module.exports = requestHardening;
