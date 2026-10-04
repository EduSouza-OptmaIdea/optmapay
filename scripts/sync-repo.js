import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const LOG_FILE = path.join(REPO_ROOT, 'sync-repo.log');

function log(message, isError = false) {
  const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const formatted = `[${timestamp}] ${message}`;
  if (isError) {
    console.error(formatted);
  } else {
    console.log(formatted);
  }
  try {
    fs.appendFileSync(LOG_FILE, `${formatted}\n`, 'utf-8');
  } catch {
    // Ignore logging errors if file write fails
  }
}

function runGit(cmd) {
  return execSync(`git ${cmd}`, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export async function syncRepo() {
  log('====================================================');
  log('🔄 Iniciando sincronização do repositório local OptmaPay');

  try {
    // 1. Verificar se o Git está acessível
    const gitVersion = runGit('--version');
    log(`Git detectado: ${gitVersion}`);

    // 2. Verificar se o diretório de trabalho tem alterações pendentes rastreadas
    const statusPorcelain = runGit('status --porcelain');
    const statusLines = statusPorcelain.split('\n').map(l => l.trimEnd()).filter(Boolean);
    const trackedChanges = statusLines.filter(line => !line.startsWith('??'));
    const isDirty = trackedChanges.length > 0;

    // 3. Obter branch atual
    const currentBranch = runGit('branch --show-current') || 'HEAD';
    log(`Branch atual: ${currentBranch}`);

    if (currentBranch === 'main') {
      if (isDirty) {
        log(`⚠️ Existem alterações locais pendentes em arquivos rastreados (${trackedChanges.length} arquivo(s)). Sincronização ignorada para preservar seu trabalho.`, true);
        return { success: false, reason: 'dirty_working_tree' };
      }

      log('Buscando atualizações de origin (https://github.com/OptmaIdea/optmapay.git)...');
      runGit('fetch origin main');

      const localHead = runGit('rev-parse HEAD');
      const remoteHead = runGit('rev-parse origin/main');

      if (localHead === remoteHead) {
        log('✅ Repositório local já está 100% sincronizado com origin/main.');
        return { success: true, updated: false };
      }

      const mergeBase = runGit('merge-base HEAD origin/main');

      if (mergeBase === remoteHead) {
        log(`ℹ️ Repositório local contém commits à frente de origin/main (${localHead.slice(0, 7)}). Nada a puxar do upstream.`);
        return { success: true, updated: false, ahead: true };
      }

      if (mergeBase === localHead) {
        log(`Novos commits detectados no upstream! Atualizando de ${localHead.slice(0, 7)} para ${remoteHead.slice(0, 7)}...`);
        const mergeOutput = runGit('merge origin/main --ff-only');
        log(`Resultado: ${mergeOutput}`);

        const recentCommits = runGit(`log --oneline -n 5 ${localHead}..${remoteHead}`);
        log(`Commits integrados com sucesso:\n${recentCommits}`);

        return { success: true, updated: true, newHead: remoteHead };
      }

      log(`⚠️ A branch local e origin/main divergiram (ambos possuem commits diferentes). Requer resolução manual.`, true);
      return { success: false, reason: 'diverged' };
    } else {
      // Se estiver em outra branch, atualiza a ref local de main sem afetar a branch em desenvolvimento
      log(`Você está na branch '${currentBranch}'. Atualizando referência local da 'main' em background...`);
      try {
        runGit('fetch origin main:main');
        log('✅ Branch local \'main\' foi atualizada com sucesso em background via fast-forward.');
        return { success: true, updated: true, backgroundBranch: true };
      } catch (err) {
        log(`ℹ️ Não foi possível atualizar 'main' diretamente (pode requerer merge manual): ${err.message}`);
        return { success: false, error: err.message };
      }
    }
  } catch (error) {
    const errorMsg = error.stderr ? error.stderr.toString().trim() : error.message;
    log(`❌ Erro ao sincronizar repositório: ${errorMsg}`, true);
    return { success: false, error: errorMsg };
  }
}

// Execução direta via CLI (node scripts/sync-repo.js)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  syncRepo().then((result) => {
    if (!result.success && result.reason !== 'dirty_working_tree') {
      process.exit(1);
    }
  });
}
