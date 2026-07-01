const buckets = new Map();

function limparAntigos(agora) {
  for (const [chave, bucket] of buckets.entries()) {
    if (bucket.resetAt <= agora) buckets.delete(chave);
  }
}

function ipDaRequisicao(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'desconhecido';
}

function rateLimit({
  janelaMs = 15 * 60 * 1000,
  max = 20,
  mensagem = 'Muitas tentativas. Tente novamente mais tarde.',
  nome = 'rate',
  keyGenerator
} = {}) {
  return (req, res, next) => {
    if (req.method === 'OPTIONS') return next();

    const agora = Date.now();
    limparAntigos(agora);

    const chaveCustomizada = keyGenerator ? keyGenerator(req) : null;
    const chave = chaveCustomizada || `${nome}:${ipDaRequisicao(req)}`;
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
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((bucket.resetAt - agora) / 1000))));
      return res.status(429).json({ error: mensagem });
    }

    return next();
  };
}

module.exports = rateLimit;
