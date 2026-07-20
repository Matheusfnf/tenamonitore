/**
 * Guarda de build: aborta se as variáveis EXPO_PUBLIC_* essenciais estiverem
 * ausentes. Roda no hook `eas-build-pre-install` (EAS já injeta o `env` do
 * perfil antes deste passo), então um build sem configuração FALHA aqui em
 * vez de gerar um app que aponta pro localhost e quebra no usuário.
 *
 * Também pode ser rodado localmente: `node scripts/check-env.js`.
 */
const required = ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'];
const missing = required.filter((key) => !process.env[key]);

if (missing.length > 0) {
  console.error(
    '\n❌ Build abortado — variáveis de ambiente ausentes:\n' +
      missing.map((k) => `   - ${k}`).join('\n') +
      '\n\nDefina em eas.json → build.<perfil>.env (ou no .env local).\n',
  );
  process.exit(1);
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!/^https:\/\//.test(url)) {
  console.error(
    `\n❌ Build abortado — EXPO_PUBLIC_SUPABASE_URL deve começar com https:// (recebido: "${url}").\n`,
  );
  process.exit(1);
}

console.log('✅ Variáveis de ambiente do Supabase presentes e válidas.');
