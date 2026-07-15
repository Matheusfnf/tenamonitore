# TenaMonitore — Guia do beta fechado na Play Store

Passo a passo do zero até os testers instalando pelo link da Play Store.

## 0. Pré-requisitos (uma vez só)

1. **Conta Google Play Console** — https://play.google.com/console (taxa única
   de US$ 25).
2. **Conta Expo** — https://expo.dev (grátis) e o CLI:
   ```
   npm i -g eas-cli
   eas login
   ```
3. **Backend pronto**: todas as migrações aplicadas no Supabase (0001–0007) e
   o seed. Confira no SQL Editor: `select * from storage.buckets;` deve
   listar `observation-photos` e `map-assets`.
4. **Mapa licenciado (recomendado p/ produção)**: crie uma chave grátis em
   https://cloud.maptiler.com e adicione ao `.env`:
   `EXPO_PUBLIC_MAPTILER_KEY=...`. Sem a chave o app usa o satélite do Esri
   (ok para desenvolvimento).

## 1. Variáveis de ambiente na EAS

O build na nuvem não lê seu `.env` local. Cadastre as variáveis do projeto em
https://expo.dev → seu projeto → **Environment variables** (ou via CLI):

```
eas env:create --name EXPO_PUBLIC_SUPABASE_URL --value https://SEU-PROJETO.supabase.co --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value SUA-ANON-KEY --environment production --visibility plaintext
eas env:create --name EXPO_PUBLIC_MAPTILER_KEY --value SUA-CHAVE --environment production --visibility plaintext
```

(`EXPO_PUBLIC_*` são embutidas no app — a anon key do Supabase é pública por
design; a segurança vem do RLS.)

## 2. Gerar o AAB de produção

```
eas build --platform android --profile production
```

- Na primeira vez a EAS **cria e guarda a keystore** automaticamente (diga
  sim). Nunca perca essa conta — é a assinatura do app.
- O `versionCode` é auto-incrementado pela EAS a cada build de produção
  (`appVersionSource: remote`). O `version` (1.0.0) você controla no
  `app.json`.
- Ao final, baixe o `.aab` pelo link que o terminal mostra.

> Quer um APK pra passar direto pros testers antes da Play Store?
> `eas build -p android --profile preview` gera um APK instalável.

## 3. Criar o app no Play Console

**Criar app** → nome "TenaMonitore", app, gratuito, idioma pt-BR.

Preencha as seções obrigatórias (menu "Painel"):

1. **Política de privacidade** — hospede `docs/privacy-policy.md` (preencha
   os campos [EMPRESA]/[E-MAIL]) numa URL pública. Sugestão rápida: GitHub
   Pages do próprio repositório, ou Google Sites. Cole a URL.
2. **Acesso ao app** — "Todo o conteúdo requer login". Forneça credenciais de
   teste (crie um usuário demo no Supabase Auth com role/organization no
   user_metadata) para a revisão do Google.
3. **Classificação de conteúdo** — questionário; app utilitário, sem
   conteúdo sensível → classificação livre.
4. **Público-alvo** — 18+ (ferramenta profissional).
5. **Segurança dos dados (Data safety)** — declare:
   - Coleta **Localização precisa** — finalidade: funcionalidade do app; não
     compartilhada; opcional? Não (essencial pros pins).
   - Coleta **Fotos** — funcionalidade do app; não compartilhada.
   - Coleta **Nome e E-mail** — gerenciamento de conta.
   - Dados criptografados em trânsito: **sim**. Usuário pode solicitar
     exclusão: **sim** (e-mail da política de privacidade).
6. **Ficha da loja** — textos prontos abaixo + assets:
   - Ícone 512×512 (use `assets/images/icon.png` redimensionado)
   - Gráfico de destaque 1024×500
   - Mínimo 2 screenshots de celular (tire do app: home, mapa com pins,
     observação, relatório PDF)

### Textos sugeridos da ficha

- **Nome**: TenaMonitore — Monitoramento Agrícola
- **Descrição curta** (80): Monitoramento de talhões: visitas, pragas e
  relatórios técnicos — 100% offline.
- **Descrição longa**: O TenaMonitore é a ferramenta do consultor agrícola em
  campo. Inicie a visita no mapa de satélite, marque pontos georreferenciados
  com pragas, doenças, severidade e fotos — tudo funciona sem internet e
  sincroniza sozinho quando a conexão volta. Desenhe ou importe os talhões da
  fazenda (KML/KMZ/GeoJSON), baixe o mapa da região para uso offline e, ao
  final, gere relatórios técnicos profissionais em PDF com recomendações,
  prontos para enviar ao produtor.

## 4. Faixa de teste fechado

1. Play Console → **Testes → Teste fechado** → criar faixa (ex.: "Beta").
2. **Testers**: crie uma lista de e-mails (contas Google dos consultores).
3. **Criar versão** → envie o `.aab` do passo 2 → notas da versão (pt-BR) →
   revisar e iniciar lançamento.
4. Primeira publicação passa por revisão do Google (horas a poucos dias).
5. Aprovado: copie o **link de opt-in** da faixa e mande pros testers — eles
   aceitam o convite e instalam pela Play Store.

Não esqueça de criar os usuários dos testers no Supabase Auth (convite com
`user_metadata`: `role` = consultant/admin, `organization_id`, `full_name`) e
atribuir as fazendas (tabela `assignments`) pros consultores.

## 5. Atualizações durante o beta

Só JavaScript mudou (o caso comum): novo build →
`eas build -p android --profile production` → nova versão na mesma faixa.
Revisões de update são bem mais rápidas que a primeira.

Checklist antes de cada build:
```
npx tsc --noEmit
npx expo export --platform android
npx expo-doctor
```

## Limitações conhecidas do beta (avise os testers)

- Imagens adicionadas manualmente a relatórios ficam só no aparelho (entram
  no PDF, mas não sincronizam entre dispositivos).
- O mapa satélite precisa de internet na primeira visualização de uma região
  (use "Baixar mapa offline" no detalhe da fazenda antes de ir a campo).
- Cadastro de culturas/pragas e atribuição de consultores ainda são feitos
  pelo painel do Supabase (telas de admin no roadmap).
