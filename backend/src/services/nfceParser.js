const cheerio = require('cheerio');

// Converte número em formato pt-BR ("1.234,56") para Number (1234.56)
function parseNumeroBR(texto) {
  if (texto === undefined || texto === null) return null;
  const limpo = String(texto).replace(/[^\d.,-]/g, '');
  if (!limpo) return null;
  const normalizado = limpo.replace(/\./g, '').replace(',', '.');
  const numero = Number(normalizado);
  return Number.isNaN(numero) ? null : numero;
}

// Converte data "01/06/2025 14:30:00" para Date
function parseDataBR(texto) {
  if (!texto) return null;
  const m = String(texto).match(/(\d{2})\/(\d{2})\/(\d{4})[\sT]*(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  const [, dia, mes, ano, hora, min, seg] = m;
  return new Date(Number(ano), Number(mes) - 1, Number(dia), Number(hora), Number(min), Number(seg || 0));
}

// Chave de acesso da NFC-e: 44 dígitos, identificador nacional único da nota.
// Costuma aparecer agrupada com espaços a cada 4 dígitos no cupom.
function extrairChaveAcesso(texto) {
  if (!texto) return null;
  // Junta dígitos separados apenas por espaços ("1234 5678" -> "12345678")
  const colado = String(texto).replace(/(?<=\d)\s+(?=\d)/g, '');
  // Após o rótulo "Chave de acesso", se houver
  const rotulo = colado.match(/Chave\s*de\s*acesso[:\s]*(\d{44})/i);
  if (rotulo) return rotulo[1];
  // Fallback: qualquer sequência isolada de exatamente 44 dígitos
  const generico = colado.match(/(?<!\d)\d{44}(?!\d)/);
  return generico ? generico[0] : null;
}

// Extrai a chave de acesso da URL do QR Code (primeiro segmento do parâmetro p=)
function chaveAcessoDaUrl(url) {
  if (!url) return null;
  const m = String(url).match(/[?&]p=([^|&]+)/i);
  if (!m) return null;
  const digitos = m[1].replace(/\D/g, '');
  return digitos.length >= 44 ? digitos.slice(0, 44) : null;
}

// A estrutura do HTML da NFC-e varia por estado e sistema emissor,
// por isso cada campo tenta seletores específicos antes de cair em regex
// sobre o texto completo da página.
function parseNfceHtml(html) {
  const $ = cheerio.load(html);
  const textoPagina = $('body').text().replace(/\s+/g, ' ');

  // --- Estabelecimento ---
  const nomeEstabelecimento =
    $('.txtTopo').first().text().trim() ||
    $('#u20').first().text().trim() ||
    null;

  const cnpjMatch = textoPagina.match(/CNPJ[:\s]*([\d]{2}\.?[\d]{3}\.?[\d]{3}\/?[\d]{4}-?[\d]{2})/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^\d]/g, '') : null;

  // Endereço costuma ser o bloco .text logo após o CNPJ
  let endereco = null;
  $('.text').each((_i, el) => {
    const t = $(el).text().replace(/\s+/g, ' ').trim();
    if (!endereco && t && !/CNPJ/i.test(t)) endereco = t;
  });

  // --- Data de emissão ---
  const emissaoMatch = textoPagina.match(/Emiss[ãa]o[:\s]*(\d{2}\/\d{2}\/\d{4}[\sT]*\d{2}:\d{2}(?::\d{2})?)/i);
  const dataCompra = parseDataBR(emissaoMatch ? emissaoMatch[1] : textoPagina);

  // --- Valor total ---
  let valorTotal = null;
  const totalEl = $('.totalNumb.txtMax').first().text() || $('.txtMax').first().text();
  valorTotal = parseNumeroBR(totalEl);
  if (valorTotal === null) {
    const totalMatch = textoPagina.match(/Valor a pagar[^\d]*([\d.,]+)/i) ||
      textoPagina.match(/Valor total[^\d]*([\d.,]+)/i);
    valorTotal = totalMatch ? parseNumeroBR(totalMatch[1]) : null;
  }

  // --- Itens ---
  // O layout varia muito entre estados/emissores, então tentamos várias
  // fontes de linhas e, dentro de cada linha, vários jeitos de achar
  // nome/quantidade/preço, com fallback por regex de preço pt-BR.
  const itens = [];
  const REGEX_PRECO = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
  const ROTULOS = /^(c[óo]d(igo)?|descri|qtde?|un|vl\.?|valor|total|item|produto|pre[çc]o|c[óo]digo)\b/i;

  function processarLinhas(linhas) {
    linhas.each((_i, tr) => {
      const linha = $(tr);
      const nome = (
        linha.find('.txtTit2').first().text().trim() ||
        linha.find('.txtTit').first().text().trim() ||
        linha.find('span').first().text().trim()
      );
      if (!nome || nome.length < 2 || ROTULOS.test(nome)) return;

      const qtdTexto = linha.find('.Rqtd').text();
      const unitTexto = linha.find('.RvlUnit').text();
      let totalTexto = linha.find('.valor').first().text();
      // fallback: último preço com formato pt-BR na linha (costuma ser o total do item)
      if (!parseNumeroBR(totalTexto)) {
        const precos = linha.text().match(REGEX_PRECO);
        if (precos && precos.length) totalTexto = precos[precos.length - 1];
      }

      const quantidade = parseNumeroBR(qtdTexto.replace(/Qtde\.?:?/i, '')) || 1;
      let valorUnitario = parseNumeroBR(unitTexto.replace(/Vl\.?\s*Unit\.?:?/i, ''));
      let valorTotalItem = parseNumeroBR(totalTexto);

      if (valorUnitario === null && valorTotalItem !== null) valorUnitario = valorTotalItem / quantidade;
      if (valorTotalItem === null && valorUnitario !== null) valorTotalItem = valorUnitario * quantidade;
      if (valorUnitario === null && valorTotalItem === null) return;

      itens.push({
        nome,
        quantidade,
        valor_unitario: Number(valorUnitario.toFixed(4)),
        valor_total: Number(valorTotalItem.toFixed(2))
      });
    });
  }

  processarLinhas($('#tabResult tr')); // layout padrão SEFAZ
  if (itens.length === 0) processarLinhas($('table tr')); // fallback: qualquer tabela

  if (valorTotal === null && itens.length > 0) {
    valorTotal = Number(itens.reduce((soma, i) => soma + i.valor_total, 0).toFixed(2));
  }

  return {
    estabelecimento: { nome: nomeEstabelecimento, cnpj, endereco },
    chave_acesso: extrairChaveAcesso(textoPagina),
    data_compra: dataCompra,
    valor_total: valorTotal,
    itens
  };
}

module.exports = { parseNfceHtml, parseNumeroBR, parseDataBR, extrairChaveAcesso, chaveAcessoDaUrl };
