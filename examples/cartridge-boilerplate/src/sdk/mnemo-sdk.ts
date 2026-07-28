/**
 * One-line re-export of the shared npm package — DO NOT add methods here.
 * The postMessage transport lives in @mnemosyne_os/cartridge-sdk; hand-rolled
 * reimplementations drift from the host and break silently.
 * App-specific wrappers: extend MnemoCartridgeSDK in a separate file, or
 * call sdk.invoke('<action>', payload) directly (actions: AGENTS.md §3).
 */
export * from '@mnemosyne_os/cartridge-sdk';
