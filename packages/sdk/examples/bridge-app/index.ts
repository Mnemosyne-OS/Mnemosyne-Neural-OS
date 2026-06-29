/**
 * bridge-app example — Mnemosyne SDK v2.0 Phase 58
 *
 * Minimal example showing how a third-party Layer 2 app can:
 * 1. Connect to Mnemosyne OS via WebSocket
 * 2. Read persistent cognitive bridge history
 * 3. Score content resonance before publishing
 *
 * Requirements:
 *   - Mnemosyne OS running (start pnpm dev in the monorepo)
 *   - Vertex AI configured (for vectors to be populated)
 *   - At least one Semantic Reflect scan completed
 *
 * Run: npx tsx index.ts
 */

import { MnemoClientBrowser } from '@mnemosyne_os/sdk';

async function main() {
  // 1. Connect to Mnemosyne OS WebSocket server (port 7799)
  console.log('[BridgeApp] Connecting to Mnemosyne OS...');
  const client = await MnemoClientBrowser.connect();

  // 2. Register with Phase 58 bridge:read scope
  const reg = await client.register({
    id: 'my-bridge-app',
    name: 'My Bridge App',
    version: '1.0.0',
    mnemosyne_sdk: '^2.0.0',
    scopes: ['vault:read:DEV', 'bridge:read'],
    vaults: ['DEV'],
    intents: ['QUERY', 'BRIDGE_READ'],
  });
  console.log(`[BridgeApp] ✓ Registered — token expires: ${new Date(reg.expiresAt).toISOString()}`);

  // 3. Fetch bridge history (Phase 58 SDK v2.0 API)
  const history = await client.getBridgeHistory({
    limit: 20,
    minCosine: 0.80,        // only high-confidence bridges
    vaultFilter: 'ALL',
    onlyNew: false,
  });

  if (!history.success) {
    console.error('[BridgeApp] getBridgeHistory failed:', history.error);
    return;
  }

  console.log(`\n[BridgeApp] 🧠 ${history.bridges.length} cognitive bridges (cosine ≥ 0.80):\n`);
  for (const b of history.bridges.slice(0, 5)) {
    console.log(
      `  [${b.cosine.toFixed(3)}] ${b.from_vault}/${b.from_spine}: "${b.from_label.slice(0, 50)}" ` +
      `↔ ${b.to_vault}/${b.to_spine}: "${b.to_label.slice(0, 50)}"`
    );
  }

  // 4. Score a post draft before publishing (Phase 58 resonance gate)
  const draft = `
    Building local RAG architectures with personal memory is key to AI-native apps.
    Mnemosyne OS proves this pattern with multi-vault cognitive bridges.
  `;

  console.log('\n[BridgeApp] ⚡ Computing resonance for draft post...');
  const score = await client.computeResonance(draft, 5);

  if (score.success) {
    console.log(`[BridgeApp] Score: ${(score.score * 100).toFixed(1)}% — Level: ${score.level}`);
    if (score.level === 'HIGH_RESONANCE') {
      console.log('[BridgeApp] ✨ This post aligns with your cognitive graph! Great time to publish.');
    } else if (score.level === 'MEDIUM') {
      console.log('[BridgeApp] 🟡 Decent resonance. Consider adding more personal context.');
    } else {
      console.log('[BridgeApp] 🔴 Low resonance. This post may not resonate with your audience.');
    }

    if (score.topMatches.length > 0) {
      console.log('\n[BridgeApp] Top matching bridges:');
      for (const m of score.topMatches) {
        console.log(`  [${(m.cosine * 100).toFixed(1)}%] "${m.fromLabel.slice(0, 40)}" ↔ "${m.toLabel.slice(0, 40)}" (${m.vault})`);
      }
    }
  }

  client.close();
  console.log('\n[BridgeApp] Done.');
}

main().catch(console.error);
