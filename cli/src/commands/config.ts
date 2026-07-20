// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — config command
// Settings dashboard: vault, resonance profile, Ollama local AI
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import chalk from 'chalk';
import { getInquirer } from '../lib/lazy.js';
import { loadVaultConfig, saveVaultConfig } from '../lib/vault.js';

const V  = chalk.hex('#8B5CF6');
const V2 = chalk.hex('#A78BFA');
const DIM = chalk.gray;
const OK  = chalk.hex('#4ADE80');
const ERR = chalk.hex('#F87171');

export const configCommand = new Command('config')
  .description('MnemoForge settings — vault, Resonance profile, Local AI (Ollama)');

// ── config (dashboard) ────────────────────────────────────────────────────────
configCommand
  .action(async () => {
    const config = loadVaultConfig();
    const ollamaStatus = await detectOllama();
    const w = '─'.repeat(54);

    console.log();
    console.log(V('  ╔' + '═'.repeat(54) + '╗'));
    console.log(V('  ║') + chalk.hex('#F5F3FF').bold('    M N E M O F O R G E   —   S E T T I N G S         ') + V('║'));
    console.log(V('  ╠' + '═'.repeat(54) + '╣'));

    // ── Vault & Resonance ──────────────────────────────────────────────────
    console.log(V('  ║') + DIM('  VAULT & RESONANCE PROFILE                          ') + V('║'));
    if (config) {
      row('Vault', config.vaultPath ?? '~/.mnemoforge/vault');
      row('IDE', config.ide ?? '—');
      row('Provider', config.provider ?? '—');
      row('Style', config.defaultChronicleStyle ?? 'session');
      if (config.workspace) row('Workspace', config.workspace);
    } else {
      console.log(V('  ║') + chalk.yellow('    ⚠  No vault configured. Run: mnemoforge chronicle init') + V(' ║'));
    }

    console.log(V('  ╠' + '═'.repeat(54) + '╣'));

    // ── Local AI ───────────────────────────────────────────────────────────
    console.log(V('  ║') + DIM('  LOCAL AI (Ollama)                                  ') + V('║'));
    if (ollamaStatus.running) {
      const modelLabel = config?.localAI?.model ?? chalk.yellow('not configured');
      console.log(V('  ║') + '    ' + OK('✔  Ollama detected') + DIM('  ·  ') + DIM(ollamaStatus.endpoint) + '          ' + V('║'));
      row('Active model', typeof modelLabel === 'string' ? modelLabel : 'not configured');
      row('Models found', String(ollamaStatus.models.length));
      row('Role', 'memory filter (context compression)');
    } else {
      console.log(V('  ║') + '    ' + ERR('✖  Ollama not detected') + DIM(' (optional)                   ') + V('║'));
      console.log(V('  ║') + DIM('    Install: https://ollama.com  then: ollama pull mistral') + V('║'));
    }

    console.log(V('  ╠' + '═'.repeat(54) + '╣'));

    // ── MCP ────────────────────────────────────────────────────────────────
    console.log(V('  ║') + DIM('  MCP SERVER                                         ') + V('║'));
    const ide = config?.ide?.toLowerCase() ?? '';
    const mcpPath = getMcpConfigPath(ide);
    const mcpConfigured = mcpPath ? checkMcpConfigured(mcpPath) : false;
    if (mcpConfigured) {
      console.log(V('  ║') + '    ' + OK('✔  MCP configured') + DIM(`  (${mcpPath})`) + '                ' + V('║'));
    } else {
      console.log(V('  ║') + '    ' + chalk.yellow('⚡ MCP not configured') + DIM('  →  run: mnemoforge config mcp   ') + V('║'));
    }
    console.log(V('  ╚' + '═'.repeat(54) + '╝'));
    console.log();
    console.log(DIM('  Commands: ') + V2('mnemoforge config ollama') + DIM('  ·  ') + V2('mnemoforge config mcp') + DIM('  ·  ') + V2('mnemoforge config edit') + '\n');
  });

// ── config ollama ─────────────────────────────────────────────────────────────
configCommand
  .command('ollama')
  .description('Detect Ollama and configure the local AI model')
  .action(async () => {
    const inquirer = await getInquirer();
    console.log(V.bold('\n  ⬡  Local AI — Ollama Configuration\n'));

    // Detect
    process.stdout.write(DIM('  Pinging Ollama at http://localhost:11434...'));
    const status = await detectOllama();

    if (!status.running) {
      console.log('\n\n  ' + ERR('✖  Ollama not found.'));
      console.log(DIM('\n  To install Ollama:'));
      console.log('    ' + chalk.white('https://ollama.com/download'));
      console.log(DIM('\n  Then pull a model:'));
      console.log('    ' + chalk.white('ollama pull mistral'));
      console.log('    ' + chalk.white('ollama pull llama3.2'));
      console.log('    ' + chalk.white('ollama pull phi3:mini\n'));
      return;
    }

    console.log('  ' + OK('✔  Ollama running') + DIM(`  (${status.models.length} model(s) available)\n`));

    if (status.models.length === 0) {
      console.log(ERR('  No models installed. Pull one first:'));
      console.log(chalk.white('    ollama pull mistral\n'));
      return;
    }

    // Recommend models
    const RECOMMENDED = ['mistral', 'llama3', 'phi3', 'nomic', 'deepseek'];
    const sorted = [...status.models].sort((a, b) => {
      const aRec = RECOMMENDED.some(r => a.name.includes(r)) ? 0 : 1;
      const bRec = RECOMMENDED.some(r => b.name.includes(r)) ? 0 : 1;
      return aRec - bRec;
    });

    const choices = sorted.map(m => {
      const isRec = RECOMMENDED.some(r => m.name.includes(r));
      const sizeGB = m.size ? ` — ${(m.size / 1e9).toFixed(1)}GB` : '';
      const tag = isRec ? OK(' ★ recommended') : '';
      return {
        name: `  ${chalk.white(m.name.padEnd(32))}${DIM(sizeGB)}${tag}`,
        value: m.name,
        short: m.name,
      };
    });
    choices.push({ name: DIM('  ✕  Disable local AI filter'), value: '__none__', short: 'disabled' });

    const { model } = await (inquirer as any).prompt([{
      type: 'list',
      name: 'model',
      message: V2('Select the model to use as memory filter:'),
      choices,
      pageSize: 10,
    }]);

    // Save to config
    const config = loadVaultConfig() ?? {} as any;
    if (model === '__none__') {
      delete config.localAI;
      saveVaultConfig(config);
      console.log(DIM('\n  Local AI filter disabled.\n'));
    } else {
      config.localAI = { provider: 'ollama', model, endpoint: status.endpoint };
      saveVaultConfig(config);
      console.log(OK(`\n  ✔  Local AI set to: ${model}`));
      console.log(DIM(`\n  Context compression active — filter will be used when reading chronicles via MCP.\n`));

      // Quick test
      const { test } = await (inquirer as any).prompt([{
        type: 'confirm', name: 'test',
        message: V2('Run a quick test (asks the model to say hello)?'),
        default: true,
      }]);
      if (test) await testOllama(model, status.endpoint);
    }
  });

// ── config edit ───────────────────────────────────────────────────────────────
configCommand
  .command('edit')
  .description('Edit vault and Resonance profile settings')
  .action(async () => {
    const inquirer = await getInquirer();
    const config = loadVaultConfig();
    if (!config) {
      console.log(chalk.yellow('\n  ⚠  No vault configured.') + DIM(' Run: mnemoforge chronicle init\n'));
      return;
    }

    console.log(V.bold('\n  ⬡  Edit Settings\n'));

    const answers = await (inquirer as any).prompt([
      {
        type: 'input', name: 'vaultPath',
        message: V2('Vault path:'),
        default: config.vaultPath,
      },
      {
        type: 'input', name: 'ide',
        message: V2('IDE / Agent name:'),
        default: config.ide,
      },
      {
        type: 'input', name: 'provider',
        message: V2('LLM Provider:'),
        default: config.provider,
      },
      {
        type: 'list', name: 'defaultChronicleStyle',
        message: V2('Default chronicle style:'),
        choices: ['session', 'reflection', 'decision', 'sweep', 'narcissus'],
        default: config.defaultChronicleStyle ?? 'session',
      },
    ]);

    const updated = { ...config, ...answers };
    saveVaultConfig(updated);
    console.log(OK('\n  ✔  Settings saved.\n'));
  });

// ── Helpers ───────────────────────────────────────────────────────────────────

interface OllamaStatus {
  running: boolean;
  endpoint: string;
  models: Array<{ name: string; size?: number }>;
}

async function detectOllama(endpoint = 'http://localhost:11434'): Promise<OllamaStatus> {
  try {
    const res = await fetch(`${endpoint}/api/tags`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return { running: false, endpoint, models: [] };
    const data = await res.json() as any;
    const models = (data.models ?? []).map((m: any) => ({ name: m.name, size: m.size }));
    return { running: true, endpoint, models };
  } catch {
    return { running: false, endpoint, models: [] };
  }
}

async function testOllama(model: string, endpoint: string): Promise<void> {
  const isHeavy = ['deepseek-r1', 'deepseek-v', 'llama3:70', 'mixtral', 'qwen'].some(k => model.includes(k));
  const timeoutMs = isHeavy ? 90000 : 20000;

  if (isHeavy) {
    console.log(chalk.yellow(`\n  ⚠  ${model} is a large model — test may take up to 90s on first run.\n`));
  }

  process.stdout.write(DIM(`\n  Testing ${model}...`));
  try {
    const res = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: 'Say: "MnemoForge filter ready." in one sentence only.', stream: false }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await res.json() as any;
    const reply = (data.response ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    console.log('\n  ' + OK('✔  Response: ') + chalk.white(reply || '(empty — model responded OK)') + '\n');
  } catch (e: any) {
    const isTimeout = e.name === 'TimeoutError' || e.message?.includes('timeout') || e.message?.includes('aborted');
    if (isTimeout) {
      console.log('\n  ' + chalk.yellow(`⚠  Timed out after ${timeoutMs / 1000}s.`));
      console.log(DIM('     The model was saved. It may just be slow to warm up on first use.\n'));
    } else {
      console.log('\n  ' + ERR(`✖  Test failed: ${e.message}\n`));
    }
  }
}

function row(label: string, value: string): void {
  const V = chalk.hex('#8B5CF6');
  console.log(V('  ║') + '    ' + chalk.gray(label.padEnd(12)) + chalk.white(value.slice(0, 36).padEnd(38)) + V('║'));
}

// ── MCP Helpers ───────────────────────────────────────────────────────────────

const MCP_ENTRY = {
  mnemoforge: {
    command: 'mnemoforge',
    args: ['serve'],
  },
};

// Returns the IDE-specific MCP config file path (or null if unsupported)
function getMcpConfigPath(ide: string): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const appData = process.env.APPDATA ?? '';

  const map: Record<string, string> = {
    cursor:        `${home}/.cursor/mcp.json`,
    claudedesktop: `${appData}/Claude/claude_desktop_config.json`,
    claudecode:    `${home}/.claude.json`,
    vscode:        '.vscode/mcp.json',
    windsurf:      `${home}/.codeium/windsurf/mcp_config.json`,
  };

  // Normalize IDE name
  const key = ide.replace(/[\s_\-]/g, '').toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (key.includes(k)) return v;
  }
  return null;
}

// Check if mnemoforge is already in the MCP config file
function checkMcpConfigured(filePath: string): boolean {
  try {
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(filePath)) return false;
    const raw = fs.readFileSync(filePath, 'utf8');
    return raw.includes('mnemoforge');
  } catch { return false; }
}

// ── config mcp ────────────────────────────────────────────────────────────────
configCommand
  .command('mcp')
  .description('Auto-configure MCP for your IDE (Cursor, Claude Desktop, ClaudeCode…)')
  .option('--ide <name>', 'Override IDE detection (e.g. cursor, claudedesktop)')
  .action(async (opts: any) => {
    const fs    = await import('fs');
    const path  = await import('path');
    const inquirer = await getInquirer();
    const config   = loadVaultConfig();

    const ideName = opts.ide ?? config?.ide ?? '';
    console.log(V.bold('\n  ⬡  MnemoForge — MCP Setup\n'));
    console.log(DIM(`  Active IDE: `) + chalk.white(ideName || '(not set)'));

    const targetPath = getMcpConfigPath(ideName.toLowerCase());

    if (!targetPath) {
      console.log(chalk.yellow('\n  ⚠  No automatic MCP path known for this IDE.'));
      console.log(DIM('  Supported: Cursor, ClaudeDesktop, ClaudeCode, VS Code, Windsurf'));
      console.log(DIM('\n  Manual config to add:\n'));
      console.log(chalk.white(JSON.stringify({ mcpServers: MCP_ENTRY }, null, 2)));
      console.log();
      return;
    }

    const alreadyConfigured = checkMcpConfigured(targetPath);
    if (alreadyConfigured) {
      console.log(OK(`\n  ✔  MCP already configured for ${ideName}`));
      console.log(DIM(`     File: ${targetPath}\n`));
      return;
    }

    console.log(DIM(`\n  Config file: ${targetPath}`));

    const { confirm } = await (inquirer as any).prompt([{
      type: 'confirm', name: 'confirm',
      message: V2(`Inject MnemoForge MCP into ${path.basename(targetPath)}?`),
      default: true,
    }]);
    if (!confirm) { console.log(DIM('\n  Aborted.\n')); return; }

    // Read existing config or start fresh
    let existing: any = {};
    try {
      if (fs.existsSync(targetPath)) {
        existing = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
      }
    } catch {
      console.log(chalk.yellow(`\n  ⚠  Could not parse existing config — will create new.`));
    }

    // Merge: add mnemoforge to mcpServers
    existing.mcpServers = { ...(existing.mcpServers ?? {}), ...MCP_ENTRY };

    // Ensure directory exists
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    fs.writeFileSync(targetPath, JSON.stringify(existing, null, 2), 'utf8');

    console.log(OK(`\n  ✔  MCP configured for ${ideName}!`));
    console.log(DIM(`     File: ${targetPath}`));
    console.log(DIM(`\n  Restart ${ideName} to activate MnemoForge tools.\n`));
    console.log(DIM('  Available tools: ') + chalk.white('write_chronicle') + DIM(' · ') + chalk.white('list_chronicles') + DIM(' · ') + chalk.white('get_vault_info') + '\n');
  });
