// Formatação de valores em Real brasileiro.
export function formatBRL(valor) {
  if (valor === null || valor === undefined || Number.isNaN(Number(valor))) return '—';
  return Number(valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// "há 2 h", "há 3 d" a partir de uma data ISO.
export function tempoRelativo(dataIso) {
  if (!dataIso) return '';
  const ms = Date.now() - new Date(dataIso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.round(h / 24);
  return `há ${d} d`;
}
