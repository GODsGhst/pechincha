const crypto = require('crypto');
const mongoose = require('mongoose');
const RateLimitBucket = require('../models/RateLimitBucket');

const bucketsMemoria = new Map();

function limparAntigosMemoria(agora) {
  for (const [chave, bucket] of bucketsMemoria.entries()) {
    if (bucket.resetAt <= agora) bucketsMemoria.delete(chave);
  }
}

function ipDaRequisicao(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'desconhecido';
}

function hashChave(chave) {
  return crypto.createHash('sha256').update(String(chave || 'desconhecido')).digest('hex');
}

function incrementarMemoria(chave, janelaMs) {
  const agora = Date.now();
  limparAntigosMemoria(agora);

  const chaveHash = hashChave(chave);
  const bucket = bucketsMemoria.get(chaveHash) || { count: 0, resetAt: agora + janelaMs };
  if (bucket.resetAt <= agora) {
    bucket.count = 0;
    bucket.resetAt = agora + janelaMs;
  }

  bucket.count += 1;
  bucketsMemoria.set(chaveHash, bucket);
  return { count: bucket.count, resetAt: new Date(bucket.resetAt) };
}

async function incrementarMongo(chave, janelaMs) {
  const agora = new Date();
  const expiraEm = new Date(agora.getTime() + janelaMs);
  const chaveHash = hashChave(chave);

  try {
    const bucket = await RateLimitBucket.findOneAndUpdate(
      { chave: chaveHash },
      [
        {
          $set: {
            chave: chaveHash,
            contador: {
              $cond: [
                { $gt: ['$expira_em', agora] },
                { $add: [{ $ifNull: ['$contador', 0] }, 1] },
                1
              ]
            },
            expira_em: {
              $cond: [
                { $gt: ['$expira_em', agora] },
                '$expira_em',
                expiraEm
              ]
            },
            atualizado_em: agora
          }
        }
      ],
      { new: true, upsert: true }
    ).lean();

    return { count: bucket.contador, resetAt: bucket.expira_em };
  } catch (err) {
    if (err && err.code === 11000) {
      return incrementarMongo(chave, janelaMs);
    }
    throw err;
  }
}

async function incrementarBucket(chave, janelaMs) {
  if (mongoose.connection.readyState !== 1) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Banco indisponível para rate limit');
    }
    return incrementarMemoria(chave, janelaMs);
  }

  try {
    return await incrementarMongo(chave, janelaMs);
  } catch (err) {
    if (process.env.NODE_ENV === 'production') throw err;
    console.warn('[rate-limit] usando fallback em memória:', err.message);
    return incrementarMemoria(chave, janelaMs);
  }
}

function rateLimit({
  janelaMs = 15 * 60 * 1000,
  max = 20,
  mensagem = 'Muitas tentativas. Tente novamente mais tarde.',
  nome = 'rate',
  keyGenerator
} = {}) {
  return async (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    try {
      const chaveCustomizada = keyGenerator ? keyGenerator(req) : null;
      const chave = chaveCustomizada || `${nome}:${ipDaRequisicao(req)}`;
      const bucket = await incrementarBucket(chave, janelaMs);
      const resetAtMs = new Date(bucket.resetAt).getTime();

      res.setHeader('RateLimit-Limit', String(max));
      res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
      res.setHeader('RateLimit-Reset', String(Math.ceil(resetAtMs / 1000)));

      if (bucket.count > max) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000))));
        return res.status(429).json({ error: mensagem });
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = rateLimit;
