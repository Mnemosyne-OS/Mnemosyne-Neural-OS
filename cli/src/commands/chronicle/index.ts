// ─────────────────────────────────────────────────────────────────────────────
// MnemoChronicle — Command assembler
// Registers all sub-commands onto the `chronicle` parent command
// ─────────────────────────────────────────────────────────────────────────────
import { Command } from 'commander';
import { vaultCmd } from './vault.js';
import { writerCmd } from './writer.js';
import { readerCmd } from './reader.js';

export const chronicleCommand = new Command('chronicle')
  .description('MnemoChronicle — multi-agent memory archiving system');

// Mount all sub-commands
for (const cmd of [...vaultCmd.commands, ...writerCmd.commands, ...readerCmd.commands]) {
  chronicleCommand.addCommand(cmd);
}
