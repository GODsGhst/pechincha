# Como gerar a versão iPhone

Este projeto Expo já está preparado para iOS no `app.json` e no `eas.json`.

## O que dá para fazer neste PC

No Windows dá para validar o projeto, configurar EAS e enviar build para a nuvem. Não dá para gerar um `.ipa` local sem macOS/Xcode.

## Build interna para testar no iPhone

1. Entre na conta Expo:

```powershell
npx eas-cli login
```

2. Configure o projeto no EAS, se ainda não estiver configurado:

```powershell
npx eas-cli init
```

3. Gere a build iOS de teste:

```powershell
npx eas-cli build --platform ios --profile preview
```

O EAS vai pedir credenciais Apple e vai gerar um link de instalação. Para iPhone físico, normalmente precisa conta Apple Developer e dispositivo incluído no provisioning/ad hoc.

## Build de produção

```powershell
npx eas-cli build --platform ios --profile production
```

Depois, para enviar à App Store/TestFlight:

```powershell
npx eas-cli submit --platform ios --profile production
```

## Configuração atual

- Bundle iOS: `com.consultprice.app`
- Perfil `preview`: distribuição interna
- Perfil `production`: App Store/TestFlight
- Permissões iOS: câmera, fotos e localização
