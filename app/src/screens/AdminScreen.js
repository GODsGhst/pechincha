import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import ProductImage from '../components/ProductImage';
import { useAuth } from '../context/AuthContext';
import { colors, fonts, radius } from '../theme';
import { formatBRL, formatPrecoUnidade } from '../utils/format';

const FORM_INICIAL = {
  nome: '',
  categoria: '',
  tipo: '',
  marca: '',
  quantidade: '',
  imagem_url: ''
};

function Campo({ label, value, onChangeText, placeholder, multiline = false }) {
  return (
    <View style={styles.campoBox}>
      <Text style={styles.campoLabel}>{label}</Text>
      <TextInput
        style={[styles.campo, multiline && styles.campoMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.inkMuted}
        multiline={multiline}
        autoCapitalize="sentences"
      />
    </View>
  );
}

function limparPayload(form) {
  return {
    nome: form.nome.trim(),
    categoria: form.categoria.trim() || null,
    tipo: form.tipo.trim() || null,
    marca: form.marca.trim() || null,
    quantidade: form.quantidade.trim() || null,
    imagem_url: form.imagem_url.trim() || null
  };
}

function formDeProduto(produto) {
  return {
    nome: produto?.nome || '',
    categoria: produto?.categoria || '',
    tipo: produto?.tipo || '',
    marca: produto?.marca || '',
    quantidade: produto?.quantidade || '',
    imagem_url: produto?.imagem_url || ''
  };
}

export default function AdminScreen({ navigation }) {
  const { usuario: usuarioAtual } = useAuth();
  const [aba, setAba] = useState('produtos');
  const [resumo, setResumo] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [auditoria, setAuditoria] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [precos, setPrecos] = useState([]);
  const [termo, setTermo] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [form, setForm] = useState(FORM_INICIAL);
  const [precoEditando, setPrecoEditando] = useState(null);
  const [precoValor, setPrecoValor] = useState('');
  const [destinoMerge, setDestinoMerge] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  const totais = resumo?.totais || {};
  const editando = Boolean(selecionado?.id);
  const superadmin = usuarioAtual?.papel === 'superadmin';

  const buscarProdutos = useCallback(async (texto = '') => {
    const query = texto.trim() ? `?nome=${encodeURIComponent(texto.trim())}` : '';
    const { produtos: lista } = await api.get(`/produtos${query}`, { timeoutMs: 20000 });
    setProdutos(lista || []);
  }, []);

  const carregar = useCallback(async () => {
    setErro('');
    try {
      const [resumoResp, usuariosResp, auditoriaResp] = await Promise.all([
        api.get('/admin/resumo', { timeoutMs: 20000 }),
        api.get('/admin/usuarios', { timeoutMs: 20000 }),
        api.get('/admin/auditoria?limite=30', { timeoutMs: 20000 })
      ]);
      setResumo(resumoResp);
      setUsuarios(usuariosResp.usuarios || []);
      setAuditoria(auditoriaResp.logs || []);
      await buscarProdutos('');
      const precosResp = await api.get('/admin/precos?limite=40', { timeoutMs: 20000 });
      setPrecos(precosResp.precos || []);
    } catch (e) {
      setErro(e.message || 'Não foi possível carregar o painel.');
    } finally {
      setCarregando(false);
    }
  }, [buscarProdutos]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = setTimeout(() => {
      buscarProdutos(termo).catch(() => setProdutos([]));
    }, 320);
    return () => clearTimeout(timer);
  }, [termo, buscarProdutos]);

  function atualizarCampo(chave, valor) {
    setForm((atual) => ({ ...atual, [chave]: valor }));
  }

  function novoProduto() {
    setSelecionado(null);
    setForm(FORM_INICIAL);
    setAba('produtos');
  }

  function selecionarProduto(produto) {
    setSelecionado(produto);
    setForm(formDeProduto(produto));
    setAba('produtos');
  }

  function selecionarPreco(preco) {
    setPrecoEditando(preco);
    setPrecoValor(String(preco.valor || ''));
    setAba('precos');
  }

  async function salvarProduto() {
    const payload = limparPayload(form);
    if (!payload.nome) {
      Alert.alert('Nome obrigatório', 'Informe o nome do produto.');
      return;
    }

    setSalvando(true);
    setErro('');
    try {
      const salvo = editando
        ? await api.put(`/produtos/${selecionado.id}`, payload, { timeoutMs: 20000 })
        : await api.post('/produtos', payload, { timeoutMs: 20000 });
      setSelecionado(salvo);
      setForm(formDeProduto(salvo));
      await buscarProdutos(termo);
      setResumo(await api.get('/admin/resumo', { timeoutMs: 20000 }));
    } catch (e) {
      Alert.alert('Não foi possível salvar', e.message || 'Tente novamente em alguns instantes.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarRemocao() {
    if (!selecionado?.id) return;
    Alert.alert(
      'Remover produto?',
      'O produto e o histórico de preço dele serão removidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            setSalvando(true);
            try {
              await api.delete(`/produtos/${selecionado.id}`, { timeoutMs: 20000 });
              novoProduto();
              await buscarProdutos(termo);
              setResumo(await api.get('/admin/resumo', { timeoutMs: 20000 }));
            } catch (e) {
              Alert.alert('Não foi possível remover', e.message || 'Tente novamente em alguns instantes.');
            } finally {
              setSalvando(false);
            }
          }
        }
      ]
    );
  }

  async function alterarPapel(usuario, papel) {
    setErro('');
    try {
      const atualizado = await api.put(`/admin/usuarios/${usuario.id}/papel`, { papel }, { timeoutMs: 20000 });
      setUsuarios((lista) => lista.map((item) => (item.id === atualizado.id ? atualizado : item)));
      setResumo(await api.get('/admin/resumo', { timeoutMs: 20000 }));
    } catch (e) {
      Alert.alert('Não foi possível alterar', e.message || 'Tente novamente.');
    }
  }

  async function salvarPreco() {
    if (!precoEditando?.id) return;
    setSalvando(true);
    try {
      const atualizado = await api.put(`/admin/precos/${precoEditando.id}`, {
        valor: Number(String(precoValor).replace(',', '.'))
      }, { timeoutMs: 20000 });
      setPrecos((lista) => lista.map((item) => item.id === atualizado.id ? atualizado : item));
      setPrecoEditando(atualizado);
      setPrecoValor(String(atualizado.valor || ''));
      setResumo(await api.get('/admin/resumo', { timeoutMs: 20000 }));
    } catch (e) {
      Alert.alert('Não foi possível salvar preço', e.message || 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  function confirmarRemocaoPreco(preco) {
    Alert.alert('Remover preço?', 'Esse registro será removido do histórico e o menor preço será recalculado.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          setSalvando(true);
          try {
            await api.delete(`/admin/precos/${preco.id}`, { timeoutMs: 20000 });
            setPrecos((lista) => lista.filter((item) => item.id !== preco.id));
            if (precoEditando?.id === preco.id) {
              setPrecoEditando(null);
              setPrecoValor('');
            }
          } catch (e) {
            Alert.alert('Não foi possível remover', e.message || 'Tente novamente.');
          } finally {
            setSalvando(false);
          }
        }
      }
    ]);
  }

  async function juntarProdutoSelecionado() {
    if (!selecionado?.id || !destinoMerge.trim()) {
      Alert.alert('IDs obrigatórios', 'Selecione o produto de origem e informe o ID do produto destino.');
      return;
    }
    setSalvando(true);
    try {
      await api.post('/admin/produtos/juntar', {
        origem_id: selecionado.id,
        destino_id: destinoMerge.trim()
      }, { timeoutMs: 20000 });
      setDestinoMerge('');
      novoProduto();
      await buscarProdutos(termo);
      const precosResp = await api.get('/admin/precos?limite=40', { timeoutMs: 20000 });
      setPrecos(precosResp.precos || []);
    } catch (e) {
      Alert.alert('Não foi possível juntar', e.message || 'Tente novamente.');
    } finally {
      setSalvando(false);
    }
  }

  const ultimasImportacoes = useMemo(() => resumo?.ultimas_importacoes || [], [resumo]);

  if (carregando) {
    return (
      <SafeAreaView style={styles.tela}>
        <ActivityIndicator color={colors.brand} style={{ marginTop: 48 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.voltar} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.titulo}>Admin</Text>
          <Text style={styles.subtitulo}>Produtos, usuários e importações</Text>
        </View>
        <Pressable style={styles.refresh} onPress={carregar} accessibilityLabel="Atualizar painel">
          <Ionicons name="refresh" size={18} color={colors.brand} />
        </Pressable>
      </View>

      {erro ? (
        <View style={styles.alerta}>
          <Ionicons name="alert-circle-outline" size={18} color={colors.location} />
          <Text style={styles.alertaTexto}>{erro}</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }} showsVerticalScrollIndicator={false}>
        <View style={styles.metricas}>
          <View style={styles.metrica}>
            <Text style={styles.metricaValor}>{totais.produtos ?? '-'}</Text>
            <Text style={styles.metricaLabel}>produtos</Text>
          </View>
          <View style={styles.metrica}>
            <Text style={styles.metricaValor}>{totais.usuarios ?? '-'}</Text>
            <Text style={styles.metricaLabel}>usuários</Text>
          </View>
          <View style={styles.metrica}>
            <Text style={styles.metricaValor}>{totais.compras ?? '-'}</Text>
            <Text style={styles.metricaLabel}>notas</Text>
          </View>
        </View>

        <View style={styles.abas}>
          <Pressable style={[styles.aba, aba === 'produtos' && styles.abaAtiva]} onPress={() => setAba('produtos')}>
            <Text style={[styles.abaTexto, aba === 'produtos' && styles.abaTextoAtivo]}>Produtos</Text>
          </Pressable>
          <Pressable style={[styles.aba, aba === 'usuarios' && styles.abaAtiva]} onPress={() => setAba('usuarios')}>
            <Text style={[styles.abaTexto, aba === 'usuarios' && styles.abaTextoAtivo]}>Usuários</Text>
          </Pressable>
          <Pressable style={[styles.aba, aba === 'precos' && styles.abaAtiva]} onPress={() => setAba('precos')}>
            <Text style={[styles.abaTexto, aba === 'precos' && styles.abaTextoAtivo]}>Preços</Text>
          </Pressable>
          <Pressable style={[styles.aba, aba === 'importacoes' && styles.abaAtiva]} onPress={() => setAba('importacoes')}>
            <Text style={[styles.abaTexto, aba === 'importacoes' && styles.abaTextoAtivo]}>Notas</Text>
          </Pressable>
          <Pressable style={[styles.aba, aba === 'auditoria' && styles.abaAtiva]} onPress={() => setAba('auditoria')}>
            <Text style={[styles.abaTexto, aba === 'auditoria' && styles.abaTextoAtivo]}>Logs</Text>
          </Pressable>
        </View>

        {aba === 'produtos' && (
          <>
            <View style={styles.buscaLinha}>
              <View style={styles.busca}>
                <Ionicons name="search" size={17} color={colors.inkMuted} />
                <TextInput
                  style={styles.buscaInput}
                  value={termo}
                  onChangeText={setTermo}
                  placeholder="Buscar produto"
                  placeholderTextColor={colors.inkMuted}
                />
              </View>
              <Pressable style={styles.novoBotao} onPress={novoProduto}>
                <Ionicons name="add" size={18} color={colors.white} />
              </Pressable>
            </View>

            <View style={styles.editor}>
              <Text style={styles.editorTitulo}>{editando ? 'Editar produto' : 'Novo produto'}</Text>
              <Campo label="Nome" value={form.nome} onChangeText={(v) => atualizarCampo('nome', v)} placeholder="Coca-Cola 2L" />
              <View style={styles.duasColunas}>
                <Campo label="Categoria" value={form.categoria} onChangeText={(v) => atualizarCampo('categoria', v)} placeholder="Bebidas" />
                <Campo label="Tipo" value={form.tipo} onChangeText={(v) => atualizarCampo('tipo', v)} placeholder="Refrigerante" />
              </View>
              <View style={styles.duasColunas}>
                <Campo label="Marca" value={form.marca} onChangeText={(v) => atualizarCampo('marca', v)} placeholder="Coca-Cola" />
                <Campo label="Tamanho" value={form.quantidade} onChangeText={(v) => atualizarCampo('quantidade', v)} placeholder="2L" />
              </View>
              <Campo
                label="Imagem URL"
                value={form.imagem_url}
                onChangeText={(v) => atualizarCampo('imagem_url', v)}
                placeholder="https://..."
                multiline
              />
              <View style={styles.editorAcoes}>
                {editando && (
                  <Pressable style={styles.remover} onPress={confirmarRemocao} disabled={salvando}>
                    <Ionicons name="trash-outline" size={17} color={colors.danger} />
                    <Text style={styles.removerTexto}>Remover</Text>
                  </Pressable>
                )}
                <Pressable style={styles.salvar} onPress={salvarProduto} disabled={salvando}>
                  {salvando ? (
                    <ActivityIndicator size="small" color={colors.white} />
                  ) : (
                    <Ionicons name="save-outline" size={17} color={colors.white} />
                  )}
                  <Text style={styles.salvarTexto}>{salvando ? 'Salvando' : 'Salvar'}</Text>
                </Pressable>
              </View>
              {editando && (
                <View style={styles.mergeBox}>
                  <Text style={styles.campoLabel}>Juntar este produto em outro ID</Text>
                  <View style={styles.mergeLinha}>
                    <TextInput
                      style={styles.mergeInput}
                      value={destinoMerge}
                      onChangeText={setDestinoMerge}
                      placeholder="ID do produto destino"
                      placeholderTextColor={colors.inkMuted}
                      autoCapitalize="none"
                    />
                    <Pressable style={styles.mergeBotao} onPress={juntarProdutoSelecionado} disabled={salvando}>
                      <Ionicons name="git-merge-outline" size={17} color={colors.white} />
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            <Text style={styles.secao}>Produtos encontrados</Text>
            {produtos.length === 0 ? (
              <Text style={styles.vazio}>Nenhum produto encontrado.</Text>
            ) : (
              produtos.map((produto) => (
                <Pressable key={produto.id} style={styles.produtoRow} onPress={() => selecionarProduto(produto)}>
                  <ProductImage uri={produto.imagem_url} style={styles.produtoImg} iconSize={18} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.produtoNome} numberOfLines={1}>{produto.nome}</Text>
                    <Text style={styles.produtoMeta} numberOfLines={1}>
                      {[produto.categoria, produto.tipo, produto.marca, produto.quantidade].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.produtoPreco}>{formatBRL(produto.menor_preco)}</Text>
                    {!!formatPrecoUnidade(produto.preco_unidade) && (
                      <Text style={styles.produtoUnidade}>{formatPrecoUnidade(produto.preco_unidade)}</Text>
                    )}
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {aba === 'usuarios' && (
          <>
            <Text style={styles.secao}>Usuários</Text>
            {!superadmin && (
              <Text style={styles.vazio}>Somente superadmin pode alterar permissões.</Text>
            )}
            {usuarios.map((usuario) => {
              const admin = usuario.papel === 'admin' || usuario.papel === 'superadmin';
              return (
                <View key={usuario.id} style={styles.usuarioRow}>
                  <View style={styles.usuarioAvatar}>
                    <Ionicons name={admin ? 'shield-checkmark' : 'person-outline'} size={18} color={admin ? colors.brandDark : colors.inkMuted} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.usuarioNome} numberOfLines={1}>{usuario.nome}</Text>
                    <Text style={styles.usuarioEmail} numberOfLines={1}>{usuario.email}</Text>
                  </View>
                  <Pressable
                    style={[styles.papelBotao, admin && styles.papelBotaoAdmin]}
                    onPress={() => superadmin && alterarPapel(usuario, admin ? 'usuario' : 'admin')}
                    disabled={!superadmin}
                  >
                    <Text style={[styles.papelTexto, admin && styles.papelTextoAdmin]}>{usuario.papel === 'superadmin' ? 'Super' : admin ? 'Admin' : 'Usuário'}</Text>
                  </Pressable>
                </View>
              );
            })}
          </>
        )}

        {aba === 'precos' && (
          <>
            <Text style={styles.secao}>Últimos preços</Text>
            {precoEditando && (
              <View style={styles.editor}>
                <Text style={styles.editorTitulo}>{precoEditando.produto || 'Produto'}</Text>
                <Text style={styles.produtoMeta}>{precoEditando.estabelecimento || 'Estabelecimento'} · {precoEditando.data ? new Date(precoEditando.data).toLocaleString('pt-BR') : ''}</Text>
                <View style={styles.mergeLinha}>
                  <TextInput
                    style={styles.mergeInput}
                    value={precoValor}
                    onChangeText={setPrecoValor}
                    keyboardType="decimal-pad"
                    placeholder="Valor"
                    placeholderTextColor={colors.inkMuted}
                  />
                  <Pressable style={styles.salvar} onPress={salvarPreco} disabled={salvando}>
                    <Ionicons name="save-outline" size={17} color={colors.white} />
                    <Text style={styles.salvarTexto}>Salvar</Text>
                  </Pressable>
                </View>
              </View>
            )}
            {precos.map((preco) => (
              <Pressable key={preco.id} style={styles.importacaoRow} onPress={() => selecionarPreco(preco)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.importacaoStatus}>{preco.produto || 'Produto'}</Text>
                  <Text style={styles.importacaoMeta} numberOfLines={1}>
                    {preco.estabelecimento || 'Local'} · {preco.data ? new Date(preco.data).toLocaleDateString('pt-BR') : ''}
                  </Text>
                </View>
                <Text style={styles.importacaoTempo}>{formatBRL(preco.valor)}</Text>
                <Pressable onPress={() => confirmarRemocaoPreco(preco)} hitSlop={8}>
                  <Ionicons name="trash-outline" size={17} color={colors.danger} />
                </Pressable>
              </Pressable>
            ))}
          </>
        )}

        {aba === 'importacoes' && (
          <>
            <Text style={styles.secao}>Últimas notas</Text>
            {ultimasImportacoes.length === 0 ? (
              <Text style={styles.vazio}>Sem importações recentes.</Text>
            ) : (
              ultimasImportacoes.map((item) => (
                <View key={item.id} style={styles.importacaoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importacaoStatus}>{item.status}</Text>
                    <Text style={styles.importacaoMeta} numberOfLines={1}>
                      {item.usuario?.email || 'sem usuário'} · {item.chave_acesso || 'sem chave'}
                    </Text>
                  </View>
                  <Text style={styles.importacaoTempo}>
                    {item.tempo_processamento_ms ? `${item.tempo_processamento_ms}ms` : '—'}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {aba === 'auditoria' && (
          <>
            <Text style={styles.secao}>Auditoria admin</Text>
            {auditoria.length === 0 ? (
              <Text style={styles.vazio}>Sem ações administrativas registradas.</Text>
            ) : (
              auditoria.map((item) => (
                <View key={item.id} style={styles.importacaoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importacaoStatus}>{item.acao}</Text>
                    <Text style={styles.importacaoMeta} numberOfLines={2}>
                      {item.resumo || item.alvo_tipo} · {item.usuario?.email || 'admin'} · {item.criado_em ? new Date(item.criado_em).toLocaleString('pt-BR') : ''}
                    </Text>
                  </View>
                  <Ionicons name="shield-checkmark-outline" size={18} color={colors.brandDark} />
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  voltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  refresh: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  titulo: { fontFamily: fonts.display, fontSize: 20, color: colors.ink },
  subtitulo: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 1 },
  alerta: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: '#F0C6B4', borderRadius: radius.md, marginHorizontal: 16, marginTop: 6, padding: 10 },
  alertaTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft },
  metricas: { flexDirection: 'row', gap: 8 },
  metrica: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 },
  metricaValor: { fontFamily: fonts.monoMedium, fontSize: 20, color: colors.brandDark },
  metricaLabel: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkMuted, marginTop: 2 },
  abas: { flexDirection: 'row', gap: 6, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 4, marginTop: 14 },
  aba: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  abaAtiva: { backgroundColor: colors.brandDark },
  abaTexto: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  abaTextoAtivo: { color: colors.white },
  buscaLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  busca: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, height: 44, paddingHorizontal: 12 },
  buscaInput: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  novoBotao: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  editor: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginTop: 12 },
  editorTitulo: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink, marginBottom: 10 },
  duasColunas: { flexDirection: 'row', gap: 8 },
  campoBox: { flex: 1, marginBottom: 9 },
  campoLabel: { fontFamily: fonts.medium, fontSize: 10.5, color: colors.inkMuted, marginBottom: 5 },
  campo: { minHeight: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, paddingHorizontal: 10, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  campoMulti: { minHeight: 64, paddingTop: 10, textAlignVertical: 'top' },
  editorAcoes: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 3 },
  remover: { height: 42, borderRadius: radius.md, borderWidth: 1, borderColor: '#F0C6B4', backgroundColor: '#FFF3EC', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 },
  removerTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.danger },
  salvar: { minWidth: 112, height: 42, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 14 },
  salvarTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  mergeBox: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 12, paddingTop: 10 },
  mergeLinha: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  mergeInput: { flex: 1, minHeight: 42, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.canvas, paddingHorizontal: 10, fontFamily: fonts.body, fontSize: 13, color: colors.ink },
  mergeBotao: { width: 44, height: 42, borderRadius: radius.md, backgroundColor: colors.brandDark, alignItems: 'center', justifyContent: 'center' },
  secao: { fontFamily: fonts.display, fontSize: 16, color: colors.ink, marginTop: 18, marginBottom: 10 },
  produtoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  produtoImg: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: '#F1F0EA', alignItems: 'center', justifyContent: 'center' },
  produtoNome: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  produtoMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 2 },
  produtoPreco: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.brand },
  produtoUnidade: { fontFamily: fonts.body, fontSize: 9.5, color: colors.inkMuted, marginTop: 1 },
  vazio: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginTop: 16 },
  usuarioRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  usuarioAvatar: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.brandSoft, alignItems: 'center', justifyContent: 'center' },
  usuarioNome: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  usuarioEmail: { fontFamily: fonts.body, fontSize: 11, color: colors.inkSoft, marginTop: 2 },
  papelBotao: { minWidth: 72, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  papelBotaoAdmin: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftLine },
  papelTexto: { fontFamily: fonts.semibold, fontSize: 11, color: colors.inkSoft },
  papelTextoAdmin: { color: colors.brandDark },
  importacaoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 11, marginBottom: 8 },
  importacaoStatus: { fontFamily: fonts.semibold, fontSize: 13, color: colors.ink },
  importacaoMeta: { fontFamily: fonts.body, fontSize: 10.5, color: colors.inkSoft, marginTop: 2 },
  importacaoTempo: { fontFamily: fonts.monoMedium, fontSize: 11, color: colors.brandDark }
});
