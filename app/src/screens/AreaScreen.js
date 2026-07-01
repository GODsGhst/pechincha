// Área de pesquisa: localização do usuário + distância máxima.
// Usa GPS no Expo Go e cruza com as coordenadas dos estabelecimentos que o
// backend já mantém em /estabelecimentos/mapa.

import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Platform, RefreshControl, ScrollView, View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { colors, fonts, radius } from '../theme';
import { tempoRelativo } from '../utils/format';

const DISTANCIAS = [5, 10, 20, 50];
const GPS_TIMEOUT_MS = 12000;
const MAPA_HOSTS_PERMITIDOS = new Set([
  'unpkg.com',
  'tile.openstreetmap.org',
  'a.tile.openstreetmap.org',
  'b.tile.openstreetmap.org',
  'c.tile.openstreetmap.org'
]);

function distanciaKm(origem, destino) {
  if (!origem || !destino) return null;
  const R = 6371;
  const toRad = (n) => (n * Math.PI) / 180;
  const dLat = toRad(destino.lat - origem.lat);
  const dLng = toRad(destino.lng - origem.lng);
  const lat1 = toRad(origem.lat);
  const lat2 = toRad(destino.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(km) {
  if (km === null || km === undefined) return 'sem distância';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

function centroDoMapa(localizacao, lojas) {
  const centro = localizacao || lojas.find((loja) => loja.localizacao)?.localizacao;
  if (!centro) return null;
  return centro;
}

function zoomPorDistancia(distancia) {
  if (distancia <= 5) return 12;
  if (distancia <= 10) return 11;
  if (distancia <= 20) return 10;
  return 9;
}

function permitirNavegacaoMapa(request) {
  const urlTexto = request?.url || '';
  if (!urlTexto || urlTexto === 'about:blank') return true;

  try {
    const url = new URL(urlTexto);
    return url.protocol === 'https:' && MAPA_HOSTS_PERMITIDOS.has(url.hostname);
  } catch (_e) {
    return false;
  }
}

function htmlMapa({ localizacao, lojas, distancia }) {
  const centro = centroDoMapa(localizacao, lojas);
  if (!centro) return null;

  const lojasJson = lojas
    .filter((loja) => loja.localizacao)
    .map((loja) => ({
      id: loja.id,
      nome: loja.nome,
      endereco: loja.endereco || '',
      lat: loja.localizacao.lat,
      lng: loja.localizacao.lng,
      distancia: formatarDistancia(loja.distancia_km),
    }));

  return `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self' 'unsafe-inline' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; img-src https://*.tile.openstreetmap.org data:; connect-src https://*.tile.openstreetmap.org; font-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="anonymous">
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; background: #eef1ec; }
    .leaflet-container { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .popup-title { font-weight: 700; color: #14211c; margin-bottom: 2px; }
    .popup-sub { color: #5a635c; font-size: 12px; max-width: 180px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin="anonymous"></script>
  <script>
    const centro = ${JSON.stringify(centro)};
    const usuario = ${JSON.stringify(localizacao || null)};
    const lojas = ${JSON.stringify(lojasJson)};
    const map = L.map('map', { zoomControl: false, attributionControl: false })
      .setView([centro.lat, centro.lng], ${zoomPorDistancia(distancia)});

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true
    }).addTo(map);

    function esc(valor) {
      return String(valor || '').replace(/[&<>"']/g, function(ch) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
      });
    }

    const bounds = [];
    if (usuario) {
      L.circle([usuario.lat, usuario.lng], {
        radius: ${distancia * 1000},
        color: '#16A35A',
        weight: 1.5,
        fillColor: '#16A35A',
        fillOpacity: 0.12
      }).addTo(map);
      L.circleMarker([usuario.lat, usuario.lng], {
        radius: 8,
        color: '#ffffff',
        weight: 3,
        fillColor: '#16A35A',
        fillOpacity: 1
      }).addTo(map).bindPopup('<div class="popup-title">Você</div>');
      bounds.push([usuario.lat, usuario.lng]);
    }

    lojas.forEach(function(loja) {
      const marker = L.circleMarker([loja.lat, loja.lng], {
        radius: 7,
        color: '#ffffff',
        weight: 2,
        fillColor: '#E06A3B',
        fillOpacity: 1
      }).addTo(map);
      marker.bindPopup(
        '<div class="popup-title">' + esc(loja.nome) + '</div>' +
        '<div class="popup-sub">' + esc(loja.endereco || loja.distancia) + '</div>'
      );
      marker.on('click', function() {
        if (window.ReactNativeWebView) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'store', id: loja.id }));
        }
      });
      bounds.push([loja.lat, loja.lng]);
    });

    if (!usuario && bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 14 });
    }
  </script>
</body>
</html>`;
}

export default function AreaScreen({ navigation }) {
  const [distancia, setDistancia] = useState(10);
  const [localizacao, setLocalizacao] = useState(null);
  const [precisao, setPrecisao] = useState(null);
  const [origemGps, setOrigemGps] = useState(null);
  const [endereco, setEndereco] = useState(null);
  const [estabelecimentos, setEstabelecimentos] = useState([]);
  const [carregandoGps, setCarregandoGps] = useState(false);
  const [carregandoBuscaLocal, setCarregandoBuscaLocal] = useState(false);
  const [carregandoLojas, setCarregandoLojas] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState(null);
  const [buscaLocal, setBuscaLocal] = useState('');

  const lojasComCoordenadas = useMemo(
    () => estabelecimentos.filter((loja) => loja.localizacao),
    [estabelecimentos]
  );
  const lojasSemCoordenadas = Math.max(0, estabelecimentos.length - lojasComCoordenadas.length);

  const lojasComDistancia = useMemo(() => {
    return lojasComCoordenadas
      .map((loja) => ({
        ...loja,
        distancia_km: distanciaKm(localizacao, loja.localizacao),
      }))
      .filter((loja) => !localizacao || loja.distancia_km <= distancia)
      .sort((a, b) => {
        if (a.distancia_km === null) return 1;
        if (b.distancia_km === null) return -1;
        return a.distancia_km - b.distancia_km;
      });
  }, [distancia, lojasComCoordenadas, localizacao]);

  const lojasNoMapa = localizacao ? lojasComDistancia : lojasComCoordenadas;
  const mapaHtml = useMemo(
    () => htmlMapa({ localizacao, lojas: lojasNoMapa, distancia }),
    [localizacao, lojasNoMapa, distancia]
  );

  async function buscarLojas(manual = false) {
    setCarregandoLojas(true);
    if (manual) setAtualizando(true);
    try {
      const query = localizacao
        ? `?lat=${encodeURIComponent(localizacao.lat)}&lng=${encodeURIComponent(localizacao.lng)}&raio=${encodeURIComponent(distancia)}`
        : '';
      const res = await api.get(`/estabelecimentos/mapa${query}`, {
        cacheMs: 2 * 60 * 1000,
        forceRefresh: manual,
        timeoutMs: 20000,
        preferStale: !manual,
        maxStaleMs: 6 * 60 * 60 * 1000
      });
      setEstabelecimentos(res.estabelecimentos || []);
      if (!manual && res._meta?.stale) {
        api.get(`/estabelecimentos/mapa${query}`, {
          cacheMs: 2 * 60 * 1000,
          forceRefresh: true,
          timeoutMs: 20000
        })
          .then((atualizado) => setEstabelecimentos(atualizado.estabelecimentos || []))
          .catch(() => {});
      }
    } catch (_e) {
      setErro('Não foi possível carregar as lojas próximas.');
    } finally {
      setCarregandoLojas(false);
      if (manual) setAtualizando(false);
    }
  }

  async function usarLocalizacaoAtual() {
    setCarregandoGps(true);
    setErro(null);
    let usouUltimaLocalizacao = false;
    try {
      const servicosAtivos = await Location.hasServicesEnabledAsync();
      if (!servicosAtivos) {
        setErro('Ative o GPS/localização do celular para buscar lojas perto de você.');
        return;
      }

      if (Platform.OS === 'android' && Location.enableNetworkProviderAsync) {
        await Location.enableNetworkProviderAsync().catch(() => {});
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setErro(perm.canAskAgain === false
          ? 'A localização foi bloqueada. Libere a permissão nas configurações do Android para calcular as lojas próximas.'
          : 'Autorize a localização para calcular as lojas próximas.');
        return;
      }

      const ultima = await Location.getLastKnownPositionAsync({
        maxAge: 10 * 60 * 1000,
        requiredAccuracy: 3000,
      }).catch(() => null);
      if (ultima) {
        aplicarPosicao(ultima, 'ultima');
        usouUltimaLocalizacao = true;
      }

      const pos = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('gps_timeout')), GPS_TIMEOUT_MS))
      ]);
      aplicarPosicao(pos, 'atual');
    } catch (e) {
      if (usouUltimaLocalizacao || localizacao) {
        setErro('Usei a última localização conhecida. Toque em usar atual de novo se o GPS terminar de localizar.');
      } else if (e?.message === 'gps_timeout') {
        setErro('O GPS demorou para responder. Ative localização precisa e tente novamente em uma área aberta.');
      } else {
        setErro('Não consegui pegar sua localização agora. Verifique GPS, permissão e internet.');
      }
    } finally {
      setCarregandoGps(false);
    }
  }

  function aplicarPosicao(pos, origem) {
    if (!pos?.coords) return;
    aplicarCoordenadas({
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      precisao: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
    }, origem);
  }

  function aplicarCoordenadas(origemCoords, origem) {
    if (!Number.isFinite(origemCoords?.lat) || !Number.isFinite(origemCoords?.lng)) return;
    const coords = {
      lat: Number(origemCoords.lat),
      lng: Number(origemCoords.lng),
    };
    setLocalizacao(coords);
    setPrecisao(Number.isFinite(origemCoords.precisao) ? origemCoords.precisao : null);
    setOrigemGps(origem);

    Location.reverseGeocodeAsync({
      latitude: coords.lat,
      longitude: coords.lng,
    })
      .then(([geo]) => setEndereco(geo || null))
      .catch(() => setEndereco(null));
  }

  async function buscarLocalDigitado() {
    const termo = buscaLocal.trim();
    if (termo.length < 3) {
      setErro('Digite cidade, bairro ou CEP para buscar.');
      return;
    }

    setCarregandoBuscaLocal(true);
    setErro(null);
    try {
      const resultados = await Location.geocodeAsync(termo);
      const primeiro = resultados && resultados[0];
      if (!primeiro) {
        setErro('Não encontrei esse local. Tente incluir cidade e estado.');
        return;
      }
      aplicarCoordenadas({ lat: primeiro.latitude, lng: primeiro.longitude, precisao: null }, 'manual');
    } catch (_e) {
      setErro('Não consegui buscar esse local agora.');
    } finally {
      setCarregandoBuscaLocal(false);
    }
  }

  async function abrirRota(loja) {
    if (!loja?.localizacao) return;
    const { lat, lng } = loja.localizacao;
    const nome = encodeURIComponent(loja.nome || 'Estabelecimento');
    const url = Platform.select({
      ios: `maps://?q=${nome}&ll=${lat},${lng}`,
      android: `geo:${lat},${lng}?q=${lat},${lng}(${nome})`,
      default: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
    });

    try {
      await Linking.openURL(url);
    } catch (_e) {
      setErro('Não consegui abrir o mapa externo neste aparelho.');
    }
  }

  function mensagemMapa(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type !== 'store') return;
      const loja = lojasNoMapa.find((item) => item.id === data.id);
      if (loja) abrirRota(loja);
    } catch (_e) {
      // Ignora mensagens não reconhecidas do mapa.
    }
  }

  useEffect(() => {
    buscarLojas();
    usarLocalizacaoAtual();
  }, []);

  useEffect(() => {
    if (localizacao) buscarLojas();
  }, [localizacao, distancia]);

  const nomeLocal = endereco
    ? [endereco.district || endereco.subregion, endereco.city, endereco.region].filter(Boolean).slice(0, 2).join(' · ')
    : localizacao
      ? `${localizacao.lat.toFixed(5)}, ${localizacao.lng.toFixed(5)}`
      : 'Localização não definida';

  const complementoLocal = localizacao
    ? [
        origemGps === 'ultima' ? 'Última localização conhecida' : origemGps === 'manual' ? 'Local digitado' : 'GPS ativo',
        precisao ? `precisão ~${Math.round(precisao)} m` : null
      ].filter(Boolean).join(' · ')
    : 'Toque em usar atual';

  return (
    <SafeAreaView style={styles.tela} edges={['top']}>
      <View style={styles.header}>
        <Pressable style={styles.iconeVoltar} onPress={() => navigation.goBack()} accessibilityLabel="Voltar">
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.headerTitulo}>Área de pesquisa</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={atualizando} onRefresh={() => buscarLojas(true)} tintColor={colors.brand} />}
      >
        <View style={styles.tituloLinha}>
          <Text style={styles.titulo}>Onde buscar</Text>
          <Ionicons name="location" size={20} color={colors.brand} />
        </View>

        <View style={styles.cardLocal}>
          <Text style={styles.cardLabel}>sua localização</Text>
          <Text style={styles.cardLocalNome}>{nomeLocal}</Text>
          <Text style={styles.cardLocalCep}>{complementoLocal}</Text>
        </View>

        <View style={styles.botoes}>
          <Pressable style={styles.botaoO} onPress={usarLocalizacaoAtual} disabled={carregandoGps}>
            {carregandoGps ? (
              <ActivityIndicator size="small" color={colors.brand} />
            ) : (
              <>
                <Ionicons name="locate-outline" size={17} color={colors.brand} />
                <Text style={styles.botaoOTexto}>Usar atual</Text>
              </>
            )}
          </Pressable>
          <Pressable style={styles.botaoG} onPress={() => buscarLojas(true)} disabled={carregandoLojas}>
            {carregandoLojas ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <>
                <Ionicons name="refresh" size={16} color={colors.white} />
                <Text style={styles.botaoGTexto}>Atualizar lojas</Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={styles.buscaManual}>
          <Ionicons name="search" size={17} color={colors.inkMuted} />
          <TextInput
            style={styles.buscaManualInput}
            value={buscaLocal}
            onChangeText={setBuscaLocal}
            placeholder="Cidade, bairro ou CEP"
            placeholderTextColor={colors.inkMuted}
            returnKeyType="search"
            onSubmitEditing={buscarLocalDigitado}
          />
          <Pressable style={styles.buscaManualBotao} onPress={buscarLocalDigitado} disabled={carregandoBuscaLocal}>
            {carregandoBuscaLocal ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="arrow-forward" size={17} color={colors.white} />
            )}
          </Pressable>
        </View>

        {erro && (
          <View style={styles.erroBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.location} />
            <Text style={styles.erroTexto}>{erro}</Text>
          </View>
        )}

        <Text style={[styles.cardLabel, { marginTop: 22 }]}>distância máxima</Text>
        <View style={styles.chips}>
          {DISTANCIAS.map((km) => {
            const ativo = km === distancia;
            return (
              <Pressable key={km} style={[styles.chip, ativo && styles.chipOn]} onPress={() => setDistancia(km)}>
                <Text style={[styles.chipTexto, ativo && styles.chipTextoOn]}>{km} km</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.cardLabel, { marginTop: 22 }]}>no mapa</Text>
        <View style={styles.mapa}>
          {mapaHtml ? (
            <WebView
              key={`${localizacao?.lat || 'lojas'}-${distancia}-${lojasNoMapa.length}`}
              originWhitelist={['about:blank', 'https://unpkg.com', 'https://*.tile.openstreetmap.org']}
              source={{ html: mapaHtml }}
              style={styles.mapaWeb}
              javaScriptEnabled
              domStorageEnabled={false}
              scrollEnabled={false}
              mixedContentMode="never"
              allowFileAccess={false}
              allowFileAccessFromFileURLs={false}
              allowUniversalAccessFromFileURLs={false}
              setSupportMultipleWindows={false}
              thirdPartyCookiesEnabled={false}
              onShouldStartLoadWithRequest={permitirNavegacaoMapa}
              onMessage={mensagemMapa}
            />
          ) : (
            <View style={styles.mapaVazio}>
              <Ionicons name="map-outline" size={30} color={colors.inkMuted} />
              <Text style={styles.mapaNota}>Sem coordenadas para exibir ainda</Text>
            </View>
          )}
          <View style={styles.mapaBadge}>
            <Text style={styles.mapaNota}>
              {localizacao
                ? `${lojasComDistancia.length} ${lojasComDistancia.length === 1 ? 'loja' : 'lojas'} em ${distancia} km`
                : `${lojasComCoordenadas.length} ${lojasComCoordenadas.length === 1 ? 'loja' : 'lojas'} com mapa`}
            </Text>
            {lojasSemCoordenadas > 0 && (
              <Text style={styles.mapaSubnota}>{lojasSemCoordenadas} sem coordenadas</Text>
            )}
          </View>
        </View>

        <View style={styles.listaTopo}>
          <Text style={styles.cardLabel}>lojas próximas</Text>
          <Text style={styles.listaContador}>{lojasComDistancia.length}/{estabelecimentos.length} no banco</Text>
        </View>

        {carregandoLojas ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 20 }} />
        ) : lojasComDistancia.length === 0 ? (
          <View style={styles.vazio}>
            <Ionicons name="storefront-outline" size={28} color={colors.inkMuted} />
            <Text style={styles.vazioTexto}>
              {localizacao
                ? 'Nenhuma loja com coordenadas apareceu nesse raio.'
                : 'Ative o GPS para calcular distância das lojas.'}
            </Text>
          </View>
        ) : (
          lojasComDistancia.map((loja) => (
            <View key={loja.id} style={styles.lojaCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.lojaNome} numberOfLines={1}>{loja.nome}</Text>
                <Text style={styles.lojaEndereco} numberOfLines={1}>{loja.endereco || 'Endereço não informado'}</Text>
                <Text style={styles.lojaStats}>
                  {loja.produtos_mais_baratos || 0} melhores preços · {loja.ultima_atividade ? tempoRelativo(loja.ultima_atividade) : 'sem atividade'}
                </Text>
              </View>
              <View style={styles.lojaDistancia}>
                <Ionicons name="navigate-outline" size={15} color={colors.brandDark} />
                <Text style={styles.lojaDistanciaTexto}>{formatarDistancia(loja.distancia_km)}</Text>
                <Pressable style={styles.rotaBotao} onPress={() => abrirRota(loja)}>
                  <Text style={styles.rotaTexto}>Rota</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.canvas },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8 },
  iconeVoltar: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitulo: { fontFamily: fonts.semibold, fontSize: 16, color: colors.brandDark },
  tituloLinha: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  titulo: { fontFamily: fonts.display, fontSize: 22, color: colors.brandDark },
  cardLabel: { fontFamily: fonts.body, fontSize: 11, color: colors.inkMuted },
  cardLocal: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 14, marginTop: 12 },
  cardLocalNome: { fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, marginTop: 4 },
  cardLocalCep: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted, marginTop: 2 },
  botoes: { flexDirection: 'row', gap: 10, marginTop: 10 },
  botaoO: { flex: 1, height: 46, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  botaoOTexto: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  botaoG: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  botaoGTexto: { fontFamily: fonts.semibold, fontSize: 13, color: colors.white },
  buscaManual: { height: 48, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 6, marginTop: 10 },
  buscaManualInput: { flex: 1, height: 46, fontFamily: fonts.body, fontSize: 13, color: colors.ink, paddingVertical: 0 },
  buscaManualBotao: { width: 36, height: 36, borderRadius: radius.sm, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  erroBox: { flexDirection: 'row', gap: 8, backgroundColor: '#FFF3EC', borderWidth: 1, borderColor: '#F0C6B4', borderRadius: radius.md, padding: 10, marginTop: 10 },
  erroTexto: { flex: 1, fontFamily: fonts.body, fontSize: 12.5, color: colors.inkSoft, lineHeight: 18 },
  chips: { flexDirection: 'row', gap: 10, marginTop: 10 },
  chip: { flex: 1, height: 44, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brandSoftLine },
  chipTexto: { fontFamily: fonts.monoMedium, fontSize: 14, color: colors.inkSoft },
  chipTextoOn: { color: colors.brandDark },
  mapa: { height: 240, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, backgroundColor: '#EEF1EC', marginTop: 10, overflow: 'hidden' },
  mapaWeb: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EEF1EC' },
  mapaVazio: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  mapaBadge: { position: 'absolute', left: 10, right: 10, bottom: 10, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.94)', borderWidth: 1, borderColor: colors.line, paddingHorizontal: 10, paddingVertical: 8 },
  mapaNota: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  mapaSubnota: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  listaTopo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 18, marginBottom: 10 },
  listaContador: { fontFamily: fonts.body, fontSize: 12, color: colors.inkMuted },
  vazio: { alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 18 },
  vazioTexto: { fontFamily: fonts.body, fontSize: 13, color: colors.inkSoft, textAlign: 'center', lineHeight: 18 },
  lojaCard: { flexDirection: 'row', gap: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.lg, padding: 12, marginBottom: 8 },
  lojaNome: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  lojaEndereco: { fontFamily: fonts.body, fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  lojaStats: { fontFamily: fonts.body, fontSize: 11.5, color: colors.inkMuted, marginTop: 5 },
  lojaDistancia: { minWidth: 66, alignItems: 'flex-end', gap: 3 },
  lojaDistanciaTexto: { fontFamily: fonts.monoMedium, fontSize: 12.5, color: colors.brandDark },
  rotaBotao: { marginTop: 5, minHeight: 28, borderRadius: radius.sm, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brandSoftLine, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  rotaTexto: { fontFamily: fonts.semibold, fontSize: 11.5, color: colors.brandDark },
});
