/**
 * GestureCube.test.tsx — the example turns and comes closer on the host's
 * gestures, and says why when there are none.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import GestureCube from './GestureCube';
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';

afterEach(() => cleanup());

describe('without a host', () => {
  it('says there are no gestures, and why', async () => {
    render(<GestureCube sdk={new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate')} />);
    expect((await screen.findByText(/No gestures:/)).textContent).toContain('No Mnemosyne host');
  });
});

describe('inside the host', () => {
  let hostWin: Window;
  let parentDescriptor: PropertyDescriptor | undefined;
  let posted: Array<{ type: string; requestId: string }>;

  beforeEach(() => {
    const frame = document.createElement('iframe');
    document.body.appendChild(frame);
    hostWin = frame.contentWindow as Window;
    posted = [];
    vi.spyOn(hostWin, 'postMessage').mockImplementation((m: unknown) => { posted.push(m as never); });
    parentDescriptor = Object.getOwnPropertyDescriptor(window, 'parent');
    Object.defineProperty(window, 'parent', { configurable: true, get: () => hostWin });
  });
  afterEach(() => {
    if (parentDescriptor) Object.defineProperty(window, 'parent', parentDescriptor);
    vi.restoreAllMocks();
  });

  const fromHost = (data: unknown) => act(async () => {
    window.dispatchEvent(new MessageEvent('message', { data, source: hostWin }));
    await Promise.resolve();
  });

  it('turns on orbit, comes closer on depth, frames again on recenter', async () => {
    render(<GestureCube sdk={new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate')} />);
    const { requestId } = posted.find(m => m.type === 'MNEMO_GESTURE_SUBSCRIBE')!;
    await fromHost({ type: 'MNEMO_GESTURE_READY', requestId, takes: ['orbit', 'depth', 'recenter'] });
    expect(screen.getByTestId('gesture-cube-state').textContent).toContain('full screen');
    const cube = screen.getByTestId('gesture-cube');
    const before = cube.style.transform;
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'orbit', dx: 50, dy: 0 } });
    expect(cube.style.transform).toContain('rotateY(50deg)');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'depth', factor: 1.2 } });
    expect(cube.style.transform).not.toContain('translateZ(0px)');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'recenter' } });
    expect(cube.style.transform).toBe(before);
  });

  it('aims a face, picks it on select, and turns a quarter on next', async () => {
    render(<GestureCube sdk={new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate')} />);
    const { requestId } = posted.find(m => m.type === 'MNEMO_GESTURE_SUBSCRIBE')!;
    await fromHost({ type: 'MNEMO_GESTURE_READY', requestId, takes: ['point', 'select', 'next'], actions: [] });
    const front = screen.getByText('front');
    document.elementFromPoint = () => front;
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'point', x: 10, y: 10 } });
    expect(front.style.border).toContain('4px');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'select', x: 10, y: 10 } });
    expect(screen.getByTestId('gesture-cube-state').textContent).toContain('Picked: front.');
    const cube = screen.getByTestId('gesture-cube');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'next' } });
    expect(cube.style.transform).toContain('rotateY(120deg)');
  });

  it('its own action « explode » pushes the faces out, and again brings them back', async () => {
    render(<GestureCube sdk={new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate')} />);
    const { requestId } = posted.find(m => m.type === 'MNEMO_GESTURE_SUBSCRIBE')!;
    await fromHost({ type: 'MNEMO_GESTURE_READY', requestId, takes: ['orbit'], actions: ['explode'] });
    const face = screen.getByText('front');
    expect(face.style.transform).toBe('translateZ(60px)');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'action', id: 'explode' } });
    expect(face.style.transform).toBe('translateZ(110px)');
    await fromHost({ type: 'MNEMO_GESTURE', requestId, gesture: { kind: 'action', id: 'explode' } });
    expect(face.style.transform).toBe('translateZ(60px)');
  });
});
