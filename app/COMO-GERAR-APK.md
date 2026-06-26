# Como gerar o APK (app instalável)

O app já é um projeto **nativo** (a pasta `android/` foi gerada com
`npx expo prebuild`). Falta só **compilar** o APK. Dois caminhos:

> ⚠️ Pré-requisito: **liberar espaço em disco**. O build local precisa de
> vários GB livres (o C: estava 100% cheio). Esvazie a Lixeira, rode a
> Limpeza de Disco do Windows e os caches de `Downloads`.

---

## Caminho A — EAS Build (nuvem, recomendado)

Compila o APK nos servidores da Expo. **Não usa seu disco** nem o Android
Studio, e te dá um link pra baixar o `.apk`.

```bash
cd app
npx eas-cli login           # entre com sua conta Expo (grátis: expo.dev)
npx eas-cli build:configure  # cria o projeto (gera extra.eas.projectId no app.json)
npx eas-cli build -p android --profile preview
```

Ao terminar (alguns minutos), ele mostra um link pra **baixar o APK** e instalar
no celular. O `eas.json` (perfis development/preview/production) já está pronto.

---

## Caminho B — Android Studio / Gradle local

1. Libere ~10 GB de disco.
2. Abra o **Android Studio** → *Open* → selecione a pasta `app/android`.
3. Deixe ele sincronizar (baixa o SDK que faltar e usa o JDK próprio).
4. Para teste rápido, use **Build → Build App Bundle(s) / APK(s) → Build APK(s)**.
5. Para gerar o APK release pelo terminal:

```bash
cd app/android
./gradlew assembleRelease
```

O APK release sai em `app/android/app/build/outputs/apk/release/app-release.apk`.
Neste projeto também mantemos uma cópia prática em `app/Pechincha-release.apk`.

> Se a pasta `android/` foi apagada pra liberar espaço, recrie com:
> `cd app && npx expo prebuild -p android`

### Assinatura do release

O APK `app/Pechincha-release.apk` gerado nesta máquina está assinado com uma
keystore release privada, não com a chave debug do Android. A chave local fica em
`app/android/pechincha-upload-key.jks` e a configuração em
`app/android/keystore.properties`; a pasta `app/android/` está ignorada pelo Git,
então esses arquivos **não devem ser enviados para o repositório**.

Guarde essa keystore com cuidado. Sem a mesma chave, o Android não aceita
atualizar o app instalado. Para build em outra máquina, configure uma
`keystore.properties` equivalente dentro de `app/android/` ou use variáveis de
ambiente:

```bash
PECHINCHA_UPLOAD_STORE_FILE=pechincha-upload-key.jks
PECHINCHA_UPLOAD_STORE_PASSWORD=...
PECHINCHA_UPLOAD_KEY_ALIAS=...
PECHINCHA_UPLOAD_KEY_PASSWORD=...
```

---

## Importante: o backend precisa estar acessível

Um APK **standalone** (sem Expo Go) não fala com `localhost`. Para o app
instalado conversar com a API, uma destas:

- **Demonstração na mesma Wi-Fi:** rode o backend no PC e configure a URL da
  API no app para o **IP da máquina** (ex.: `http://192.168.0.10:3001/api`),
  via `app.json` em `expo.extra.apiUrl`.
- **Produção:** publique o backend (Render, Railway, Fly.io, etc.) e use a URL
  pública (HTTPS) em `expo.extra.apiUrl`.

No **Expo Go** isso não é necessário — o app detecta o IP do Metro
automaticamente (é por isso que o Expo Go já funciona hoje).
