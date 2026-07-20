import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync, spawn } from 'node:child_process';

type ProjectStatus = 'offline' | 'online' | 'checking' | 'error' | 'panic_stopped';

interface MnemoSyncProject {
  id: string;
  name: string;
  workspacePath: string;
  status: ProjectStatus;
  category: 'main' | 'project' | 'prototype' | 'other' | 'archive';
  favorite: boolean;
  source: 'manual' | 'auto_scan' | 'imported';
  commands: {
    startCmd: string;
    stopCmd?: string;
    healthCmd?: string;
    buildCmd?: string;
    releaseCmd?: string;
    testCmd?: string;
  };
  buttons: Array<{
    id: string;
    label: string;
    command: string;
    iconKey: string;
    source: 'manual' | 'auto_scan' | 'preset';
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    confirmPolicy: 'auto' | 'approval_required' | 'blocked_until_approved';
    enabled?: boolean;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeMap {
  [projectId: string]: {
    pid: number;
    command: string;
    cwd: string;
    startedAt: string;
  };
}

function getRootDataDir() {
  const vault = process.env.MNEMOSYNC_VAULT_PATH ?? path.join(os.homedir(), 'Documents', 'MnemoVault');
  return path.join(vault, '.mnemosyne', 'mnemosync');
}

function getProjectsFilePath() {
  return path.join(getRootDataDir(), 'projects.registry.json');
}

function getRuntimeFilePath() {
  return path.join(getRootDataDir(), 'runtime.state.json');
}

function ensureDataDir() {
  fs.mkdirSync(getRootDataDir(), { recursive: true });
}

function readProjects(): MnemoSyncProject[] {
  ensureDataDir();
  const filePath = getProjectsFilePath();
  if (!fs.existsSync(filePath)) return [];
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [];
}

function writeProjects(projects: MnemoSyncProject[]) {
  ensureDataDir();
  fs.writeFileSync(getProjectsFilePath(), JSON.stringify(projects, null, 2), 'utf8');
}

function readRuntime(): RuntimeMap {
  ensureDataDir();
  const filePath = getRuntimeFilePath();
  if (!fs.existsSync(filePath)) return {};
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return parsed && typeof parsed === 'object' ? parsed : {};
}

function writeRuntime(runtime: RuntimeMap) {
  ensureDataDir();
  fs.writeFileSync(getRuntimeFilePath(), JSON.stringify(runtime, null, 2), 'utf8');
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killPid(pid: number) {
  if (process.platform === 'win32') {
    execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
  } else {
    process.kill(pid);
  }
}

export const mnemoSyncCommand = new Command('mnemosync')
  .description('MnemoSync V2 launcher bridge (shared registry with desktop dashboard)');

mnemoSyncCommand
  .command('list')
  .description('List configured launcher projects')
  .action(() => {
    const projects = readProjects();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoSync V2 Projects\n'));
    if (projects.length === 0) {
      console.log(chalk.gray('  No projects in registry.\n'));
      return;
    }
    projects.forEach((project, index) => {
      console.log(
        chalk.gray(`  ${String(index + 1).padStart(2, ' ')}. `) +
          chalk.white(project.id) +
          chalk.gray(' · ') +
          chalk.cyan(project.status) +
          chalk.gray(` · ${project.workspacePath}`)
      );
    });
    console.log();
  });

mnemoSyncCommand
  .command('create <id>')
  .description('Create or update a launcher project entry')
  .requiredOption('--path <path>', 'Workspace path')
  .requiredOption('--start <command>', 'Start command')
  .option('--stop <command>', 'Stop command')
  .option('--health <command>', 'Health command')
  .option('--category <category>', 'Category (main|project|prototype|other|archive)', 'project')
  .action((id: string, opts: { path: string; start: string; stop?: string; health?: string; category: MnemoSyncProject['category'] }) => {
    const projects = readProjects();
    const now = new Date().toISOString();
    const base: MnemoSyncProject = {
      id,
      name: id,
      workspacePath: path.resolve(opts.path),
      status: 'offline',
      category: opts.category,
      favorite: false,
      source: 'manual',
      commands: {
        startCmd: opts.start,
        stopCmd: opts.stop,
        healthCmd: opts.health,
      },
      buttons: [],
      createdAt: now,
      updatedAt: now,
    };
    const idx = projects.findIndex((project) => project.id === id);
    if (idx >= 0) {
      projects[idx] = { ...projects[idx], ...base, createdAt: projects[idx].createdAt, updatedAt: now };
    } else {
      projects.push(base);
    }
    writeProjects(projects);
    console.log(chalk.green(`\n  ✔  Project saved: ${id}\n`));
  });

mnemoSyncCommand
  .command('start <id>')
  .description('Start a configured project command and track PID')
  .action((id: string) => {
    const projects = readProjects();
    const project = projects.find((item) => item.id === id);
    if (!project) {
      console.log(chalk.red(`\n  ✖  Unknown project: ${id}\n`));
      process.exit(1);
    }
    const child = spawn(project.commands.startCmd, {
      shell: true,
      cwd: project.workspacePath,
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    const runtime = readRuntime();
    runtime[id] = {
      pid: child.pid ?? 0,
      command: project.commands.startCmd,
      cwd: project.workspacePath,
      startedAt: new Date().toISOString(),
    };
    writeRuntime(runtime);
    const next = projects.map((item) => (item.id === id ? { ...item, status: 'online' as const, updatedAt: new Date().toISOString() } : item));
    writeProjects(next);
    console.log(chalk.green(`\n  ✔  Started ${id} (PID ${child.pid ?? 0})\n`));
  });

mnemoSyncCommand
  .command('stop <id>')
  .description('Stop a tracked project process')
  .action((id: string) => {
    const runtime = readRuntime();
    const tracked = runtime[id];
    if (!tracked) {
      console.log(chalk.yellow(`\n  ⚠  No tracked process for ${id}\n`));
      return;
    }
    try {
      killPid(tracked.pid);
      delete runtime[id];
      writeRuntime(runtime);
      const projects = readProjects().map((item) => (item.id === id ? { ...item, status: 'offline' as const, updatedAt: new Date().toISOString() } : item));
      writeProjects(projects);
      console.log(chalk.green(`\n  ✔  Stopped ${id} (PID ${tracked.pid})\n`));
    } catch (error) {
      console.log(chalk.red(`\n  ✖  Stop failed: ${error instanceof Error ? error.message : String(error)}\n`));
      process.exit(1);
    }
  });

mnemoSyncCommand
  .command('status')
  .description('Show live status for tracked projects')
  .action(() => {
    const runtime = readRuntime();
    const projects = readProjects();
    console.log(chalk.hex('#8B5CF6').bold('\n⬡  MnemoSync Runtime Status\n'));
    projects.forEach((project) => {
      const tracked = runtime[project.id];
      const online = tracked ? isAlive(tracked.pid) : false;
      const badge = online ? chalk.green('online') : chalk.gray('offline');
      const suffix = tracked ? chalk.gray(` (pid=${tracked.pid})`) : '';
      console.log(chalk.white(`  • ${project.id}`) + chalk.gray(' -> ') + badge + suffix);
    });
    console.log();
  });

mnemoSyncCommand
  .command('panic')
  .description('Emergency stop all tracked processes')
  .action(() => {
    const runtime = readRuntime();
    let killed = 0;
    Object.values(runtime).forEach((entry) => {
      try {
        killPid(entry.pid);
        killed += 1;
      } catch {
        /* ignore */
      }
    });
    writeRuntime({});
    const projects = readProjects().map((project) => ({ ...project, status: 'panic_stopped' as const, updatedAt: new Date().toISOString() }));
    writeProjects(projects);
    console.log(chalk.yellow(`\n  ⚠  Panic executed, killed ${killed} process(es)\n`));
  });
