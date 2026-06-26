// Resolve imagens publicas para produtos conhecidos. O campo salvo no banco
// sempre tem prioridade; este fallback evita criar um banco de imagens agora.

const IMAGENS = [
  {
    marca: 'Coca-Cola',
    url: 'https://upload.wikimedia.org/wikipedia/commons/c/c3/Olympic_Coca_Cola_Bottle.png',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Detergente',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Amaciante',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Limpa alumínio',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Limpador',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Desinfetante',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Água sanitária',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Sabão',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c2/Laundry_detergents.jpg/960px-Laundry_detergents.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Arroz',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/Golden_Rice.jpg/960px-Golden_Rice.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Feijão',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f4/Phaseolus_vulgaris_seed.jpg/960px-Phaseolus_vulgaris_seed.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Café',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/A_small_cup_of_coffee.JPG/960px-A_small_cup_of_coffee.JPG',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Açúcar',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Sugar_2xmacro.jpg/960px-Sugar_2xmacro.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Macarrão',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Pasta_Penne_Lisce.jpg/960px-Pasta_Penne_Lisce.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Leite',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fc/Glass_of_milk_on_tablecloth.jpg/960px-Glass_of_milk_on_tablecloth.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Tomate',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/89/Tomato_je.jpg/960px-Tomato_je.jpg',
    credito: 'Wikimedia Commons'
  },
  {
    tipo: 'Batata',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Patates.jpg/960px-Patates.jpg',
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
