/**
 * The version badge and the update line (doc 142 §4.3). The host is played by
 * a message posted on `window`: in a test, window.parent === window, which is
 * the same shape the SDK's guard accepts from the real host.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { UpdateNotice } from './UpdateNotice';
import { foldHostConfig } from './updateStrings';
import type { MnemoCartridgeSDK } from './sdk/mnemo-sdk';

function host(data: Record<string, unknown>): void {
  act(() => { window.dispatchEvent(new MessageEvent('message', { data: { type: 'MNEMO_CONFIG_UPDATE', ...data }, source: window })); });
}

function mount(showUpdateInHub = vi.fn().mockResolvedValue({ opened: true })) {
  const sdk = { showUpdateInHub } as unknown as MnemoCartridgeSDK;
  render(<UpdateNotice sdk={sdk} bundledVersion="1.0.0" initialLang="fr" />);
  return showUpdateInHub;
}

afterEach(() => { cleanup(); });

describe('UpdateNotice', () => {
  it('before the host speaks, the bundle version and nothing else', () => {
    mount();
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('unknown draws no line and never says « up to date »', () => {
    mount();
    host({ version: '1.0.1', update: { state: 'unknown', reason: 'HTTP_404' } });
    expect(screen.getByText('v1.0.1')).not.toHaveAttribute('title');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('current says « up to date » on hover only', () => {
    mount();
    host({ version: '1.0.1', update: { state: 'current', checkedAt: 'x' } });
    expect(screen.getByText('v1.0.1')).toHaveAttribute('title', 'À jour');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('newer: a coloured badge and one line whose button opens the Hub', () => {
    const show = mount();
    host({ version: '1.0.1', update: { state: 'newer', latestVersion: '1.1.0', checkedAt: 'x' } });
    expect(screen.getByText('v1.0.1 · 1.1.0 disponible')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('La version 1.1.0 est disponible.');
    fireEvent.click(screen.getByText('Ouvrir le Hub'));
    expect(show).toHaveBeenCalledTimes(1);
  });

  it('a critical update says « security »', () => {
    mount();
    host({ version: '1.0.1', update: { state: 'newer', latestVersion: '1.1.0', checkedAt: 'x', critical: true } });
    expect(screen.getByRole('status')).toHaveTextContent('corrige un problème de sécurité');
  });

  it('when no Hub heard it, the line says to open the Hub by hand', async () => {
    mount(vi.fn().mockResolvedValue({ opened: false }));
    host({ version: '1.0.1', update: { state: 'newer', latestVersion: '1.1.0', checkedAt: 'x' } });
    fireEvent.click(screen.getByText('Ouvrir le Hub'));
    expect(await screen.findByText(/Ouvre le Hub de Mnemosyne pour la mettre à jour/)).toBeInTheDocument();
  });

  it('a message without the fields (the zoom alone) never erases what is known', () => {
    const known = foldHostConfig({}, { version: '1.0.1', update: { state: 'current', checkedAt: 'x' } });
    expect(foldHostConfig(known, { zoom: 0.5 })).toEqual(known);
  });
});
