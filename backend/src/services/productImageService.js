// Resolve imagens publicas para produtos conhecidos. O campo salvo no banco
// sempre tem prioridade; este fallback evita criar um banco de imagens agora.

function commons(arquivo, largura = 320) {
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(arquivo)}?width=${largura}`;
}

const IMAGENS = [
  {
    marca: 'Coca-Cola',
    url: commons('Olympic_Coca_Cola_Bottle.png', 160),
    credito: 'Wikimedia Commons'
  },
  {
    marca: 'Rezende',
    url: commons('Hamburger_(black_bg).jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    marca: 'Arcor',
    url: commons('Chocolate.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Detergente',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Amaciante',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Limpa alumínio',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Limpador',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Desinfetante',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Água sanitária',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Sabão',
    url: commons('Laundry_detergents.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Hambúrguer',
    url: commons('Hamburger_(black_bg).jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Bombom',
    url: commons('Chocolate.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Arroz',
    url: commons('Golden_Rice.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Feijão',
    url: commons('Phaseolus_vulgaris_seed.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Café',
    url: commons('A_small_cup_of_coffee.JPG'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Açúcar',
    url: commons('Sugar_2xmacro.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Macarrão',
    url: commons('Pasta_Penne_Lisce.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Leite',
    url: commons('Glass_of_milk_on_tablecloth.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Tomate',
    url: commons('Tomato_je.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Batata',
    url: commons('Patates.jpg'),
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Banana',
    url: commons('Bananavarieties.jpg'),
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
    if (imagem.categoria && igual(produto.categoria, imagem.categoria)) return true;
    return false;
  });

  if (!encontrada) return { url: null, credito: null };
  return { url: encontrada.url, credito: encontrada.credito };
}

module.exports = { imagemDoProduto };
