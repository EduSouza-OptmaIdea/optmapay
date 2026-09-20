import { execSync } from 'node:child_process';
import fs from 'node:fs';

console.log('🔍 Executando Secret Scanner no repositório OptmaPay...');

let trackedFiles = [];
try {
  const output = execSync('git ls-files', { encoding: 'utf-8' });
  trackedFiles = output.split('\n').map(f => f.trim()).filter(Boolean);
} catch (err) {
  console.error('Erro ao listar arquivos rastreados pelo git:', err.message);
  process.exit(1);
}

const FORBIDDEN_PATTERNS = [
  {
    name: 'Exposed Master Key Literal',
    regex: /OPTMAPAY_WEBHOOK_MASTER_KEY\s*[:=]\s*['"][0-9a-fA-F]{32,}['"]/g,
  },
  {
    name: 'Exposed Dispatch Token Literal',
    regex: /OPTMAPAY_INTERNAL_DISPATCH_TOKEN\s*[:=]\s*['"][0-9a-fA-F]{32,}['"]/g,
  },
  {
    name: 'Private Key PEM',
    regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    name: 'Hardcoded Brevo SMTP Key',
    regex: /xsmtpsib-[a-zA-Z0-9-]{30,}/g,
  },
];

let violations = 0;

for (const file of trackedFiles) {
  // Ignora arquivos binários ou de teste com mocks sintéticos conhecidos
  if (file.endsWith('.png') || file.endsWith('.ico') || file.endsWith('.lock')) continue;

  let content = '';
  try {
    content = fs.readFileSync(file, 'utf-8');
  } catch {
    continue;
  }

  for (const pattern of FORBIDDEN_PATTERNS) {
    const matches = content.match(pattern.regex);
    if (matches) {
      // Ignora placeholders sintéticos ci-test-only
      const realMatches = matches.filter(m => !m.includes('ci-test-only'));
      if (realMatches.length > 0) {
        console.error(`❌ [LEAK DETECTADO] Arquivo: ${file}`);
        console.error(`   Regra violada: ${pattern.name} (${realMatches.length} ocorrência(s))`);
        violations += realMatches.length;
      }
    }
  }

  // Verifica se há JWT de service_role versionado
  const jwtMatches = content.match(/eyJ[a-zA-Z0-9_-]{20,}\.eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}/g);
  if (jwtMatches) {
    for (const jwt of jwtMatches) {
      try {
        const parts = jwt.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf-8'));
        if (payload.role === 'service_role') {
          console.error(`❌ [LEAK DETECTADO] Arquivo: ${file}`);
          console.error(`   Regra violada: Chave JWT com papel service_role encontrada versionada!`);
          violations++;
        }
      } catch {
        // Ignora se não for JWT decodificável
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n🚨 Falha no Secret Scanner: ${violations} segredo(s) detectado(s) em arquivos rastreados!`);
  process.exit(1);
}

console.log(`✅ Secret Scanner concluído com sucesso: 0 segredos detectados em ${trackedFiles.length} arquivos rastreados.`);
