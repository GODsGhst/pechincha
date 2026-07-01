const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const authRoutes = require('./routes/authRoutes');
const produtoRoutes = require('./routes/produtoRoutes');
const compraRoutes = require('./routes/compraRoutes');
const estabelecimentoRoutes = require('./routes/estabelecimentoRoutes');
const nfceRoutes = require('./routes/nfceRoutes');
const comparacaoRoutes = require('./routes/comparacaoRoutes');
const listaRoutes = require('./routes/listaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const rateLimit = require('./middleware/rateLimitMiddleware');
const requestHardening = require('./middleware/securityMiddleware');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

function requestId(req) {
  const recebido = String(req.headers['x-request-id'] || '').trim();
  if (/^[a-zA-Z0-9._:-]{8,80}$/.test(recebido)) return recebido;
  return crypto.randomUUID();
}

function cachePublicoCurto(req) {
  return req.method === 'GET' &&
    !req.headers.authorization &&
    (
      req.path.startsWith('/api/produtos') ||
      req.path.startsWith('/api/estabelecimentos')
    );
}

app.use((req, res, next) => {
  req.id = requestId(req);
  res.setHeader('X-Request-Id', req.id);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', cachePublicoCurto(req)
    ? 'public, max-age=20, stale-while-revalidate=60'
    : 'no-store');
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

const defaultAllowedOrigins = [
  'https://pechincha-web.onrender.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : defaultAllowedOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== 'production') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  }
};

app.use(cors(corsOptions));
app.use('/api', requestHardening);
const jsonPadrao = express.json({ limit: '1mb' });
const jsonNfce = express.json({ limit: '15mb' });

app.use((req, res, next) => {
  if (req.path === '/api/nfce/processar') {
    return jsonNfce(req, res, next);
  }
  return jsonPadrao(req, res, next);
});

app.get('/', (_req, res) => {
  res.json({ message: 'API do Comparador de Preços por Cupons Fiscais', versao: '1.0.0' });
});

app.use('/api', rateLimit({
  nome: 'api',
  janelaMs: 60 * 1000,
  max: 300,
  mensagem: 'Muitas requisições. Aguarde um pouco e tente novamente.'
}));
app.use('/api/nfce/processar', rateLimit({
  nome: 'nfce',
  janelaMs: 60 * 1000,
  max: 20,
  mensagem: 'Muitas leituras de cupom em pouco tempo. Aguarde e tente novamente.'
}));

app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/estabelecimentos', estabelecimentoRoutes);
app.use('/api/nfce', nfceRoutes);
app.use('/api/comparacao', comparacaoRoutes);
app.use('/api/lista', listaRoutes);
app.use('/api/admin', adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || (err.type === 'entity.parse.failed' ? 400 : 500);
  console.error(`[${req.id || 'sem-request-id'}]`, err);
  res.status(status).json({ error: status === 500 ? 'Erro interno do servidor' : err.message });
});

module.exports = app;
