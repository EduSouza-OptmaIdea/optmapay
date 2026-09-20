import { execSync } from 'node:child_process';

const PROJECT_REF = 'wertmoquxdrucdbobuie';

function run(cmd, desc) {
  console.log(`\n==================================================`);
  console.log(`[EXECUTANDO] ${desc}...`);
  console.log(`> ${cmd}`);
  console.log(`==================================================`);
  try {
    const output = execSync(cmd, { stdio: 'inherit', encoding: 'utf-8' });
    return output;
  } catch (err) {
    console.error(`\n❌ Falha na etapa: ${desc}`);
    throw err;
  }
}

async function main() {
  console.log(`\n🚀 Iniciando Implantação Oficial no Supabase OptmaPay (${PROJECT_REF})`);

  // 2. Vinculação e Aplicação das Migrations
  run(
    `npx supabase link --project-ref ${PROJECT_REF}`,
    'Garantindo vinculação ao projeto oficial'
  );

  run(
    `npx supabase db push --yes`,
    'Aplicando as 20 Migrations (forward-only) no Banco Oficial'
  );

  // 3. Publicação das 5 Edge Functions
  const functions = [
    { name: 'pix-transfer', verifyJwt: true },
    { name: 'webhook-dispatcher', verifyJwt: false },
    { name: 'webhook-config-manager', verifyJwt: true },
    { name: 'webhook-retry-worker', verifyJwt: false },
    { name: 'retention-worker', verifyJwt: true },
  ];

  for (const fn of functions) {
    const jwtFlag = fn.verifyJwt ? '' : ' --no-verify-jwt';
    run(
      `npx supabase functions deploy ${fn.name} --project-ref ${PROJECT_REF}${jwtFlag}`,
      `Publicando Edge Function: ${fn.name}`
    );
  }

  // 4. Verificação de Integridade e Prova do Projeto
  console.log('\n📋 Verificando Funções Publicadas no Projeto Oficial...');
  run(`npx supabase functions list --project-ref ${PROJECT_REF}`, 'Consultando Lista de Funções Oficiais');

  console.log('\n✅ Implantação no projeto oficial concluída com sucesso!');
}

main().catch(err => {
  console.error('\nErro fatal no script de implantação:', err.message);
  process.exit(1);
});
