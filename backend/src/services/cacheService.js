const namespaces = new Map();

function namespace(nome) {
  if (!namespaces.has(nome)) namespaces.set(nome, new Map());
  return namespaces.get(nome);
}

function get(nome, chave) {
  const store = namespace(nome);
  const item = store.get(chave);
  if (!item) return null;
  if (Date.now() > item.expiraEm) {
    store.delete(chave);
    return null;
  }
  return item.valor;
}

function set(nome, chave, valor, { ttlMs = 30 * 1000, max = 100 } = {}) {
  const store = namespace(nome);
  if (store.size >= max) {
    const [primeira] = store.keys();
    store.delete(primeira);
  }
  store.set(chave, { valor, expiraEm: Date.now() + ttlMs });
}

function clear(nome) {
  if (!nome) {
    namespaces.clear();
    return;
  }
  namespace(nome).clear();
}

function stats() {
  return [...namespaces.entries()].reduce((acc, [nome, store]) => {
    acc[nome] = store.size;
    return acc;
  }, {});
}

module.exports = { get, set, clear, stats };
