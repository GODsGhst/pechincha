const buckets = new Map();

function limparAntigos(agora) {
  for (const [chave, bucket] of buckets.entries()) {
    if (bucket.resetAt <= agora) buckets.delete(chave);
  }
}

function rateLimit({ janelaMs = 15 * 60 * 1000, max = 20, mensagem = 'Muitas tentativas. Tente novamente mais tarde.' } = {}) {
  return (req, res, next) => {
    const agora = Date.now();
    limparAntigos(agora);

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'desconhecido';
    const chave = `${req.method}:${req.originalUrl}:${ip}`;
    const bucket = buckets.get(chave) || { count: 0, resetAt: agora + janelaMs };

    if (bucket.resetAt <= agora) {
      bucket.count = 0;
      bucket.resetAt = agora + janelaMs;
    }

    bucket.count += 1;
    buckets.set(chave, bucket);

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - bucket.count)));
    res.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      return res.status(429).json({ error: mensagem });
    }

    return next();
  };
}

module.exports = rateLimit;
