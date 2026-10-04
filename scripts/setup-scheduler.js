import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CMD_PATH = path.join(REPO_ROOT, 'scripts', 'sync-repo.cmd');
const TASK_NAME = 'OptmaPay-Daily-Sync';

const action = process.argv[2] || '--enable';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf-8', stdio: 'inherit' });
}

try {
  if (action === '--enable') {
    console.log(`\n==================================================`);
    console.log(`⏱️ Configurando Agendador de Tarefas do Windows para sincronização diária (a cada 24 horas)...`);
    console.log(`Tarefa: ${TASK_NAME}`);
    console.log(`Alvo: ${CMD_PATH}`);
    console.log(`==================================================\n`);

    // Agenda para rodar diariamente às 03:00 da madrugada (quando a máquina estiver ligada ou no próximo boot)
    const schtasksCmd = `schtasks /Create /TN "${TASK_NAME}" /TR "\"${CMD_PATH}\"" /SC DAILY /ST 03:00 /F`;
    run(schtasksCmd);

    console.log('\n✅ Agendador configurado com sucesso para rodar a cada 24 horas!');
    console.log(`📌 Para verificar o status: npm run schedule:status`);
    console.log(`📌 Para desativar: npm run schedule:disable`);
  } else if (action === '--disable') {
    console.log(`\nRemovendo tarefa agendada '${TASK_NAME}'...`);
    run(`schtasks /Delete /TN "${TASK_NAME}" /F`);
    console.log('✅ Agendador removido com sucesso!');
  } else if (action === '--status') {
    console.log(`\nConsultando status da tarefa agendada '${TASK_NAME}'...`);
    run(`schtasks /Query /TN "${TASK_NAME}" /FO LIST`);
  } else if (action === '--run') {
    console.log(`\nDisparando execução imediata da tarefa '${TASK_NAME}'...`);
    run(`schtasks /Run /TN "${TASK_NAME}"`);
    console.log('✅ Disparo enviado com sucesso.');
  } else {
    console.log(`Ação não reconhecida: ${action}`);
    console.log('Uso: node scripts/setup-scheduler.js [--enable|--disable|--status|--run]');
  }
} catch (err) {
  console.error('\n❌ Erro ao gerenciar tarefa agendada:', err.message);
  process.exit(1);
}
