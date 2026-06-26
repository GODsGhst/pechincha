// Resolve imagens publicas para produtos conhecidos. O campo salvo no banco
// sempre tem prioridade; este fallback evita criar um banco de imagens agora.

const COMMONS_FILE = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

const IMAGENS = [
  {
    marca: 'Coca-Cola',
    url: `${COMMONS_FILE}Olympic%20Coca%20Cola%20Bottle.png?width=640`,
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Detergente',
    url: `${COMMONS_FILE}Laundry%20detergents.jpg?width=640`,
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Amaciante',
    url: `${COMMONS_FILE}Laundry%20detergents.jpg?width=640`,
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Sabão',
    url: `${COMMONS_FILE}Laundry%20detergents.jpg?width=640`,
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Arroz',
    url: `${COMMONS_FILE}Golden%20Rice.jpg?width=640`,
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Banana',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/de/Bananavarieties.jpg',
    credito: 'Wikimedia Commons'
  }
];

function normalizarTexto(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function igual(a, b) {
  return normalizarTexto(a) === normalizarTexto(b);
}

function imagemDoProduto(produto = {}) {
  if (produto.imagem_url) {
    return {
      url: produto.imagem_url,
      credito: produto.imagem_credito || null
    };
  }

  const encontrada = IMAGENS.find((imagem) => {
    if (imagem.marca && igual(produto.marca, imagem.marca)) return true;
    if (imagem.tipo && igual(produto.tipo, imagem.tipo)) return true;
    return false;
  });

  if (!encontrada) return { url: null, credito: null };
  return { url: encontrada.url, credito: encontrada.credito };
}

module.exports = { imagemDoProduto };
