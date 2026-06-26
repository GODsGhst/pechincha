function arredondar(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return null;
  return Number(Number(valor).toFixed(2));
}

function partesQuantidade(quantidadeNormalizada) {
  const partes = String(quantidadeNormalizada || '')
    .split('|')
    .map((parte) => parte.trim())
    .filter(Boolean);

  if (partes.length === 0) return null;

  const medidas = [];
  for (const parte of partes) {
    const match = parte.match(/^(\d+(?:\.\d+)?)(ml|g|un)$/i);
    if (!match) return null;
    medidas.push({ valor: Number(match[1]), unidade: match[2].toLowerCase() });
  }

  const unidade = medidas[0].unidade;
  if (!medidas.every((medida) => medida.unidade === unidade)) return null;

  const total = medidas.reduce((soma, medida) => soma + medida.valor, 0);
  return total > 0 ? { total, unidade } : null;
}

function precoPorMedida(preco, produto) {
  const valor = Number(preco);
  const medida = partesQuantidade(produto && produto.quantidade_normalizada);
  if (!Number.isFinite(valor) || valor <= 0 || !medida) return null;

  if (medida.unidade === 'ml') {
    return {
      valor: arredondar((valor / medida.total) * 1000),
      unidade: 'L',
      rotulo: 'R$/L'
    };
  }

  if (medida.unidade === 'g') {
    return {
      valor: arredondar((valor / medida.total) * 1000),
      unidade: 'kg',
      rotulo: 'R$/kg'
    };
  }

  if (medida.unidade === 'un') {
    return {
      valor: arredondar(valor / medida.total),
      unidade: 'un',
      rotulo: 'R$/un'
    };
  }

  return null;
}

function confiancaPreco(data, agora = Date.now()) {
  if (!data) {
    return {
      nivel: 'sem_data',
      rotulo: 'sem data',
      dias: null,
      data: null
    };
  }

  const dataPreco = new Date(data);
  if (Number.isNaN(dataPreco.getTime())) {
    return {
      nivel: 'sem_data',
      rotulo: 'sem data',
      dias: null,
      data: null
    };
  }

  const dias = Math.max(0, Math.floor((agora - dataPreco.getTime()) / 86400000));
  if (dias <= 1) {
    return { nivel: 'recente', rotulo: dias === 0 ? 'hoje' : 'ontem', dias, data: dataPreco };
  }
  if (dias <= 7) return { nivel: 'recente', rotulo: 'recente', dias, data: dataPreco };
  if (dias <= 30) return { nivel: 'bom', rotulo: 'este mês', dias, data: dataPreco };
  if (dias <= 90) return { nivel: 'antigo', rotulo: 'antigo', dias, data: dataPreco };
  return { nivel: 'desatualizado', rotulo: 'desatualizado', dias, data: dataPreco };
}

module.exports = {
  arredondar,
  precoPorMedida,
  confiancaPreco
};
