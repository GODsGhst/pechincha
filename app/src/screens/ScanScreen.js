// Tela de leitura de QR Code.
// Fluxo (cliente fino): câmera lê o QR -> o app busca o HTML na SEFAZ ->
// envia pro backend, que faz parsing, cadastro e análise. Só o RESULTADO
// volta pro app — nenhuma regra de negócio ou dado fica no dispositivo.

import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, scanFromURLAsync, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, fonts, radius } from '../theme';
import { formatBRL } from '../utils/format';

const FILA_CUPONS_KEY = 'pechincha.cuponsPendentes.v1';

export default function ScanScreen({ navigation }) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [lido, setLido] = useState(false);
  const [flash, setFlash] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);
  const [duplicado, setDuplicado] = useState(null);
  const [etapa, setEtapa] = useState('');
  const [segundos, setSegundos] = useState(0);
  const [cuponsPendentes, setCuponsPendentes] = useState(0);
  const [sincronizandoPendentes, setSincronizandoPendentes] = useState(false);

  useEffect(() => {
    carregarCuponsPendentes().then((fila) => {
      setCuponsPendentes(fila.length);
      if (fila.length > 0) sincronizarCuponsPendentes();
    });
  }, []);

  useEffect(() => {
    if (!processando) {
      setSegundos(0);
      return undefined;
    }

    const inicio = Date.now();
    const timer = setInterval(() => {
      const decorrido = Math.floor((Date.now() - inicio) / 1000);
      setSegundos(decorrido);
      if (decorrido >= 14) setEtapa('Salvando preços e organizando produtos...');
      else if (decorrido >= 5) setEtapa('Consultando a página da NFC-e...');
    }, 1000);

    return () => clearInterval(timer);
  }, [processando]);

  function iniciarProcessamento(mensagem) {
    setProcessando(true);
    setEtapa(mensagem);
    setSegundos(0);
    setErro(null);
    setDuplicado(null);
  }

  function mensagemProcessamento() {
    if (!processando) return 'Posicione o QR Code dentro da moldura';
    return segundos >= 3 ? `${etapa} ${segundos}s` : etapa;
  }

  function horarioCurto(valor) {
    if (!valor) return null;
    try {
      return new Date(valor).toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch (_e) {
      return null;
    }
  }

  function tratarFalhaProcessamento(e, mensagemPadrao) {
    if (e.status === 409) {
      const info = e.payload || {};
      setDuplicado(info.compra_id ? info : null);
      if (info.status_importacao === 'processando') {
        const recebido = horarioCurto(info.recebido_em);
        setErro(recebido
          ? `Este cupom já está sendo processado desde ${recebido}. Aguarde alguns segundos.`
          : 'Este cupom já está sendo processado. Aguarde alguns segundos.');
        return;
      }

      const importado = horarioCurto(info.importado_em);
      setErro(importado
        ? `Este cupom já foi cadastrado em ${importado}. Cada nota conta uma vez só.`
        : 'Este cupom já foi cadastrado. Cada nota conta uma vez só.');
      return;
    }

    if (e.status === 'timeout') {
      setErro('A leitura demorou demais. A nota pode estar lenta na SEFAZ; tente novamente em alguns segundos.');
      return;
    }

    setErro(e.message || mensagemPadrao);
  }

  function erroDeConexao(e) {
    return !e || e.status === undefined || e.status === 'timeout';
  }

  async function carregarCuponsPendentes() {
    try {
      const bruto = await AsyncStorage.getItem(FILA_CUPONS_KEY);
      const fila = bruto ? JSON.parse(bruto) : [];
      return Array.isArray(fila) ? fila : [];
    } catch (_e) {
      await AsyncStorage.removeItem(FILA_CUPONS_KEY);
      return [];
    }
  }

  async function salvarCuponsPendentes(fila) {
    const limpa = Array.isArray(fila) ? fila.slice(-30) : [];
    await AsyncStorage.setItem(FILA_CUPONS_KEY, JSON.stringify(limpa));
    setCuponsPendentes(limpa.length);
  }

  async function enfileirarCupom(url) {
    const fila = await carregarCuponsPendentes();
    if (fila.some((item) => item.url_origem === url)) {
      setCuponsPendentes(fila.length);
      return;
    }
    await salvarCuponsPendentes([...fila, { url_origem: url, criado_em: new Date().toISOString() }]);
  }

  async function sincronizarCuponsPendentes() {
    if (sincronizandoPendentes) return;
    setSincronizandoPendentes(true);
    try {
      let fila = await carregarCuponsPendentes();
      while (fila.length > 0) {
        try {
          const resposta = await api.post('/nfce/processar', { url_origem: fila[0].url_origem }, { timeoutMs: 90000 });
          setResultado(resposta);
        } catch (e) {
          if (e.status !== 409) throw e;
        }
        fila = fila.slice(1);
        await salvarCuponsPendentes(fila);
      }
      setErro(null);
    } catch (_e) {
      setErro('Há cupons pendentes aguardando conexão para sincronizar.');
    } finally {
      setSincronizandoPendentes(false);
    }
  }

  async function processarUrl(url) {
    const urlLimpa = String(url || '').trim();
    iniciarProcessamento('QR encontrado. Buscando dados do cupom...');
    try {
      const r = await api.post('/nfce/processar', { url_origem: urlLimpa }, { timeoutMs: 90000 });
      setResultado(r);
    } catch (e) {
      if (erroDeConexao(e)) {
        await enfileirarCupom(urlLimpa);
        setErro('Sem internet. Guardei este cupom para sincronizar quando a conexão voltar.');
        return;
      }
      tratarFalhaProcessamento(e, 'Não foi possível processar este cupom.');
    } finally {
      setProcessando(false);
    }
  }

  // Testar com uma foto salva: envia a imagem ao backend, que decodifica o
  // QR (jimp + qrcode-reader), busca a SEFAZ e analisa.
  async function processarImagem(imagemBase64) {
    iniciarProcessamento('Lendo imagem e procurando QR Code...');
    try {
      const r = await api.post('/nfce/processar', { imagem_base64: imagemBase64 }, { timeoutMs: 90000 });
      setResultado(r);
    } catch (e) {
      tratarFalhaProcessamento(e, 'Não foi possível processar esta imagem.');
    } finally {
      setProcessando(false);
    }
  }

  async function escolherDaGaleria() {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setErro('Autorize o acesso às fotos para testar pela galeria.');
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({ base64: true, quality: 0.8 });
      if (res.canceled) return;
      const asset = res.assets && res.assets[0];
      if (!asset || !asset.base64) {
        setErro('Não consegui ler a imagem escolhida.');
        return;
      }

      setLido(true);
      setEtapa('Lendo QR Code da imagem...');

      try {
        const codigos = await scanFromURLAsync(asset.uri, ['qr']);
        const qr = codigos.find((codigo) => /^https?:\/\//i.test(String(codigo.data || '').trim()));
        if (qr) {
          processarUrl(qr.data);
          return;
        }
      } catch (_e) {
        // Se a leitura local falhar, o backend ainda tenta decodificar a imagem.
      }

      processarImagem(`data:image/jpeg;base64,${asset.base64}`);
    } catch (_e) {
      setErro('Erro ao abrir a galeria.');
    }
  }

  function aoLer({ data }) {
    if (lido || processando) return;
    const texto = String(data || '').trim();
    setLido(true);
    setEtapa('QR encontrado. Validando cupom...');
    if (!/^https?:\/\//i.test(texto)) {
      setErro('Este QR Code não é de um cupom fiscal (NFC-e).');
      return;
    }
    processarUrl(texto);
  }

  function reiniciar() {
    setLido(false);
    setResultado(null);
    setErro(null);
    setDuplicado(null);
    setEtapa('');
    setSegundos(0);
  }

  // Permissão ainda não resolvida
  if (!permissao) return <View style={styles.preto} />;

  // Permissão negada
  if (!permissao.granted) {
    return (
      <SafeAreaView style={styles.estadoCentro}>
        <Ionicons name="camera-outline" size={44} color={colors.inkMuted} />
        <Text style={styles.estadoTitulo}>Precisamos da câmera</Text>
        <Text style={styles.estadoTexto}>Para ler o QR Code do cupom fiscal, autorize o acesso à câmera.</Text>
        <Pressable style={styles.botao} onPress={pedirPermissao}>
          <Text style={styles.botaoTexto}>Permitir câmera</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.voltar}>Voltar</Text></Pressable>
      </SafeAreaView>
    );
  }

  // Resultado (tela de recompensa — reforça o hábito de colaborar)
  if (resultado) {
    return (
      <SafeAreaView style={styles.estadoCentro}>
        <View style={styles.selo}><Ionicons name="checkmark" size={40} color={colors.white} /></View>
        <Text style={styles.estadoTitulo}>Cupom registrado!</Text>
        <Text style={styles.colab}><Ionicons name="people" size={15} color={colors.brand} /> +1 colaboração para a comunidade</Text>

        <View style={styles.resumo}>
          <Linha rotulo="Estabelecimento" valor={resultado.estabelecimento} />
          <Linha rotulo="Total da nota" valor={formatBRL(resultado.valor_total)} mono />
          <Linha rotulo="Itens lidos" valor={String(resultado.itens_processados)} />
          <Linha rotulo="Produtos novos" valor={String(resultado.itens_novos)} />
        </View>

        <Pressable style={styles.botao} onPress={reiniciar}>
          <Ionicons name="qr-code" size={18} color={colors.white} />
          <Text style={styles.botaoTexto}>  Escanear outro</Text>
        </Pressable>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.voltar}>Concluir</Text></Pressable>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.preto}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={flash}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={processando ? undefined : aoLer}
      />

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        <View style={styles.barraTopo}>
          <Pressable style={styles.iconeCircular} onPress={() => navigation.goBack()} accessibilityLabel="Fechar">
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.tituloTopo}>Escanear cupom</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.centro}>
          <View style={styles.moldura}>
            <View style={[styles.canto, styles.cantoTL]} />
            <View style={[styles.canto, styles.cantoTR]} />
            <View style={[styles.canto, styles.cantoBL]} />
            <View style={[styles.canto, styles.cantoBR]} />
          </View>
          <Text style={styles.dica}>
            {mensagemProcessamento()}
          </Text>
          {processando && <ActivityIndicator color={colors.white} style={{ marginTop: 12 }} />}
          {cuponsPendentes > 0 && !processando && (
            <View style={styles.pendentesBox}>
              <Text style={styles.pendentesTexto}>
                {cuponsPendentes} {cuponsPendentes === 1 ? 'cupom pendente' : 'cupons pendentes'}
              </Text>
              <Pressable style={styles.pendentesBotao} onPress={sincronizarCuponsPendentes} disabled={sincronizandoPendentes}>
                {sincronizandoPendentes ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <Text style={styles.pendentesBotaoTexto}>Sincronizar</Text>
                )}
              </Pressable>
            </View>
          )}
          {erro && !processando && (
            <View style={styles.erroBox}>
              <Text style={styles.erroTexto}>{erro}</Text>
              {duplicado?.compra_id && (
                <Pressable
                  style={styles.abrirNota}
                  onPress={() => navigation.navigate('Receipt', { id: duplicado.compra_id })}
                >
                  <Ionicons name="receipt-outline" size={15} color={colors.white} />
                  <Text style={styles.abrirNotaTexto}>Abrir notinha salva</Text>
                </Pressable>
              )}
              <Pressable onPress={reiniciar}><Text style={styles.tentarNovo}>Tentar de novo</Text></Pressable>
            </View>
          )}
        </View>

        <View style={styles.barraBaixo}>
          <Controle icone={flash ? 'flash' : 'flash-off'} rotulo="Flash" onPress={() => setFlash((f) => !f)} ativo={flash} />
          <Controle icone="images-outline" rotulo="Galeria" onPress={escolherDaGaleria} />
          <Controle icone="help-circle-outline" rotulo="Dúvidas" onPress={() => setErro('Aponte para o QR Code do cupom, ou use a Galeria para testar com uma foto salva.')} />
        </View>
      </SafeAreaView>
    </View>
  );
}

function Linha({ rotulo, valor, mono }) {
  return (
    <View style={styles.linha}>
      <Text style={styles.linhaRotulo}>{rotulo}</Text>
      <Text style={[styles.linhaValor, mono && { fontFamily: fonts.monoMedium, color: colors.brand }]}>{valor || '—'}</Text>
    </View>
  );
}

function Controle({ icone, rotulo, onPress, ativo }) {
  return (
    <Pressable style={styles.controle} onPress={onPress}>
      <View style={[styles.controleIcone, ativo && { backgroundColor: colors.brand }]}>
        <Ionicons name={icone} size={22} color={colors.white} />
      </View>
      <Text style={styles.controleRotulo}>{rotulo}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  preto: { flex: 1, backgroundColor: '#000' },
  overlay: { flex: 1, justifyContent: 'space-between' },
  barraTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 8 },
  iconeCircular: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  tituloTopo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  centro: { alignItems: 'center', paddingHorizontal: 32 },
  moldura: { width: 230, height: 230, position: 'relative' },
  canto: { position: 'absolute', width: 34, height: 34, borderColor: colors.brand },
  cantoTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  cantoTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  cantoBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  cantoBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  dica: { fontFamily: fonts.medium, fontSize: 14, color: colors.white, textAlign: 'center', marginTop: 24 },
  erroBox: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md, padding: 14, marginTop: 16, alignItems: 'center' },
  erroTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.white, textAlign: 'center', lineHeight: 19 },
  pendentesBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radius.md, padding: 10, marginTop: 14 },
  pendentesTexto: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.white },
  pendentesBotao: { minWidth: 92, height: 34, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  pendentesBotaoTexto: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.white },
  abrirNota: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 34, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', paddingHorizontal: 12, marginTop: 10 },
  abrirNotaTexto: { fontFamily: fonts.semibold, fontSize: 12.5, color: colors.white },
  tentarNovo: { fontFamily: fonts.semibold, fontSize: 14, color: '#5FD698', marginTop: 8 },
  barraBaixo: { flexDirection: 'row', justifyContent: 'center', gap: 48, paddingBottom: 12 },
  controle: { alignItems: 'center', gap: 6 },
  controleIcone: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  controleRotulo: { fontFamily: fonts.medium, fontSize: 12, color: colors.white },
  estadoCentro: { flex: 1, backgroundColor: colors.canvas, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 6 },
  estadoTitulo: { fontFamily: fonts.display, fontSize: 20, color: colors.ink, marginTop: 8 },
  estadoTexto: { fontFamily: fonts.body, fontSize: 14, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
  selo: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  colab: { fontFamily: fonts.medium, fontSize: 13, color: colors.brand, marginTop: 4 },
  resumo: { alignSelf: 'stretch', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 16, marginVertical: 18, gap: 10 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  linhaRotulo: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft },
  linhaValor: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, borderRadius: radius.md, height: 52, paddingHorizontal: 24, marginTop: 8, alignSelf: 'stretch' },
  botaoTexto: { fontFamily: fonts.semibold, fontSize: 16, color: colors.white },
  voltar: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft, marginTop: 16 },
});
