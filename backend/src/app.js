const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const produtoRoutes = require('./routes/produtoRoutes');
const compraRoutes = require('./routes/compraRoutes');
const estabelecimentoRoutes = require('./routes/estabelecimentoRoutes');
const nfceRoutes = require('./routes/nfceRoutes');
const comparacaoRoutes = require('./routes/comparacaoRoutes');
const listaRoutes = require('./routes/listaRoutes');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

function criarLimitador({ janelaMs, maximo, nome }) {
  const acessos = new Map();

  setInterval(() => {
    const agora = Date.now();
    for (const [chave, item] of acessos.entries()) {
      if (agora - item.inicio > janelaMs) acessos.delete(chave);
    }
  }, janelaMs).unref();

  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const agora = Date.now();
    const chave = `${nome}:${req.ip || req.headers['x-forwarded-for'] || 'anon'}`;
    const atual = acessos.get(chave);

    if (!atual || agora - atual.inicio > janelaMs) {
      acessos.set(chave, { inicio: agora, total: 1 });
      return next();
    }

    atual.total += 1;
    if (atual.total > maximo) {
      const retryAfter = Math.ceil((janelaMs - (agora - atual.inicio)) / 1000);
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({ error: 'Muitas tentativas. Aguarde um pouco e tente novamente.' });
    }

    return next();
  };
}

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
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
// Limite maior para aceitar fotos de cupom em base64
app.use(express.json({ limit: '15mb' }));

app.get('/', (_req, res) => {
  res.json({ message: 'API do Comparador de Preços por Cupons Fiscais', versao: '1.0.0' });
});

const limitadorAuth = criarLimitador({ nome: 'auth', janelaMs: 15 * 60 * 1000, maximo: 30 });
const limitadorNfce = criarLimitador({ nome: 'nfce', janelaMs: 60 * 1000, maximo: 20 });

app.use('/api/auth/login', limitadorAuth);
app.use('/api/auth/register', limitadorAuth);
app.use('/api/nfce/processar', limitadorNfce);

app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/estabelecimentos', estabelecimentoRoutes);
app.use('/api/nfce', nfceRoutes);
app.use('/api/comparacao', comparacaoRoutes);
app.use('/api/lista', listaRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;
