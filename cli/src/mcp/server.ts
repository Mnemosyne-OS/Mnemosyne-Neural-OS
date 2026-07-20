// ─────────────────────────────────────────────────────────────────────────────
// MnemoForge — MCP Server
// Exposes chronicle memory as native agent tools (stdio transport)
// Compatible with: Claude Desktop, Cursor, VS Code MCP extension, Antigravity
//
// Tools:
//   write_chronicle(title, content, style?, tags?)  → creates a chronicle file
//   list_chronicles(limit?)                          → recent chronicle metadata
//   get_vault_info()                                 → vault config + active profile
// ─────────────────────────────────────────────────────────────────────────────
import { Server }              from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

import fs   from 'fs';
import path from 'path';
import { loadVaultConfig, listChronicles, resolveChronicleDir, ChronicleStyle } from '../lib/vault.js';
import { writeChronicle } from '../lib/chronicle.js';

// ── Tool definitions ──────────────────────────────────────────────────────────
const TOOLS: Tool[] = [
  {
    name: 'write_chronicle',
    description:
      'Write a new chronicle entry into the MnemoForge vault. ' +
      'Use this to record key decisions, session summaries, architectural choices. ' +
      'The chronicle is stored as a versioned Markdown file.',
    inputSchema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Short descriptive title (max 80 chars)',
        },
        content: {
          type: 'string',
          description: 'Full chronicle content in Markdown. Be detailed — this is the memory.',
        },
        style: {
          type: 'string',
          enum: ['session', 'decision', 'reflection', 'sweep', 'narcissus'],
          description: 'Chronicle style. Default: session',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags for filtering (e.g. ["mcp", "architecture"])',
        },
      },
      required: ['title', 'content'],
    },
  },

  {
    name: 'list_chronicles',
    description:
      'List recent chronicles in the active vault. Returns filename, date, and preview.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Max chronicles to return (default: 10)',
        },
        filter: {
          type: 'string',
          description: 'Filter by style keyword (e.g. "decision")',
        },
      },
    },
  },

  {
    name: 'get_vault_info',
    description:
      'Returns the active vault configuration: IDE, provider, vault path, chronicle count, local AI model.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// ── Handlers ──────────────────────────────────────────────────────────────────
function handleWriteChronicle(args: any) {
  const config = loadVaultConfig();
  if (!config) {
    return {
      content: [{ type: 'text', text: '❌ No vault configured. Run: mnemoforge chronicle init' }],
      isError: true,
    };
  }

  const title   = String(args.title ?? '').slice(0, 80);
  const content = String(args.content ?? '');
  const style   = (args.style ?? config.defaultChronicleStyle ?? 'session') as ChronicleStyle;
  const tags    = Array.isArray(args.tags) ? args.tags.map(String) : [];

  if (!title || !content) {
    return {
      content: [{ type: 'text', text: '❌ title and content are required.' }],
      isError: true,
    };
  }

  const { filePath, filename } = writeChronicle({ title, type: style as any, content, tags, config });

  return {
    content: [{
      type: 'text',
      text: `✅ Chronicle written:\n  File: ${filename}\n  Path: ${filePath}\n  Style: ${style}\n  Tags: ${tags.join(', ') || '—'}`,
    }],
  };
}

function handleListChronicles(args: any) {
  const config = loadVaultConfig();
  if (!config) {
    return {
      content: [{ type: 'text', text: '❌ No vault configured.' }],
      isError: true,
    };
  }

  const limit  = Number(args.limit ?? 10);
  const filter = String(args.filter ?? '').toLowerCase();
  const dir    = resolveChronicleDir(config);

  let chronicles = listChronicles(config);
  if (filter) chronicles = chronicles.filter(f => f.toLowerCase().includes(filter));
  chronicles = chronicles.slice(0, limit);

  if (chronicles.length === 0) {
    return { content: [{ type: 'text', text: 'No chronicles found.' }] };
  }

  const lines = chronicles.map((filename) => {
    const fullPath = path.join(dir, filename);
    let preview = '';
    try {
      const raw = fs.readFileSync(fullPath, 'utf8');
      // Extract first non-frontmatter line of content
      const bodyStart = raw.indexOf('---', 4);
      const body = bodyStart > -1 ? raw.slice(bodyStart + 3).trim() : raw;
      preview = body.split('\n').find(l => l.trim() && !l.startsWith('#'))?.slice(0, 100) ?? '';
    } catch { /* file read error */ }
    return `• ${filename}\n  ${preview}`;
  });

  return {
    content: [{
      type: 'text',
      text: `Chronicles (${chronicles.length}):\n\n${lines.join('\n\n')}`,
    }],
  };
}

function handleGetVaultInfo() {
  const config = loadVaultConfig();
  if (!config) {
    return {
      content: [{ type: 'text', text: '❌ No vault configured. Run: mnemoforge chronicle init' }],
      isError: true,
    };
  }

  const count = listChronicles(config).length;
  const dir   = resolveChronicleDir(config);

  const info = {
    active_profile: `${config.ide} / ${config.provider}`,
    workspace:  config.workspace         ?? '—',
    project:    config.resonanceProject   ?? '—',
    style:      config.defaultChronicleStyle ?? 'session',
    vault_path: dir,
    chronicle_count: count,
    local_ai: config.localAI?.model ?? null,
    ollama_endpoint: config.localAI?.endpoint ?? null,
  };

  return {
    content: [{
      type: 'text',
      text: `MnemoForge Vault Info:\n${JSON.stringify(info, null, 2)}`,
    }],
  };
}

// ── Server bootstrap ──────────────────────────────────────────────────────────
export async function startMcpServer(): Promise<void> {
  const server = new Server(
    { name: 'mnemoforge', version: '1.3.10' },
    { capabilities: { tools: {} } }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;

    switch (name) {
      case 'write_chronicle':  return handleWriteChronicle(args ?? {});
      case 'list_chronicles':  return handleListChronicles(args ?? {});
      case 'get_vault_info':   return handleGetVaultInfo();
      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so stdout stays clean for MCP protocol
  process.stderr.write('MnemoForge MCP server ready (stdio)\n');
}
