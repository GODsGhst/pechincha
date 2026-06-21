const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/authRoutes');
const produtoRoutes = require('./routes/produtoRoutes');
const compraRoutes = require('./routes/compraRoutes');
const estabelecimentoRoutes = require('./routes/estabelecimentoRoutes');
const nfceRoutes = require('./routes/nfceRoutes');
const comparacaoRoutes = require('./routes/comparacaoRoutes');

const app = express();

// Em produção, restrinja a origens conhecidas via CORS_ORIGIN (separadas por vírgula)
const corsOptions = process.env.CORS_ORIGIN
  ? { origin: process.env.CORS_ORIGIN.split(',').map((o) => o.trim()) }
  : {};

app.use(cors(corsOptions));
// Limite maior para aceitar fotos de cupom em base64
app.use(express.json({ limit: '15mb' }));

app.get('/', (_req, res) => {
  res.json({ message: 'API do Comparador de Preços por Cupons Fiscais', versao: '1.0.0' });
});

app.use('/api/auth', authRoutes);
app.use('/api/produtos', produtoRoutes);
app.use('/api/compras', compraRoutes);
app.use('/api/estabelecimentos', estabelecimentoRoutes);
app.use('/api/nfce', nfceRoutes);
app.use('/api/comparacao', comparacaoRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Erro interno do servidor' });
});

module.exports = app;
