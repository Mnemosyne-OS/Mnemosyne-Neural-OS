/**
 * GestureCube — the hand-gesture example (Mnemosyne OS doc 106 §32).
 *
 * A cube you turn with a pinch drag (`orbit`), come closer to by moving the
 * hand toward the camera (`depth`), and frame again with open hands held
 * still (`recenter`). Its faces fly apart on its own action, `explode`,
 * whose pose the person teaches in « My gestures ». Aim a face with the
 * index (`point`) to light it, pinch and hold on it (`select`) to pick it,
 * swipe an open hand (`next` / `prev`) to turn a quarter. Plain CSS 3D.
 *
 * To receive gestures, a cartridge needs three things:
 *  1. `"gesture:receive"` in `permissions` of mnemo-plugin.json;
 *  2. `"gestures": { "takes": [...] }` listing the gestures it takes;
 *  3. `sdk.onGestures({...})` here, with one handler per gesture.
 *
 * Gestures arrive only while the cartridge window is in full screen. The
 * cartridge never sees the camera nor the hand: it receives intentions.
 */
import { useEffect, useState } from 'react';
import type { MnemoCartridgeSDK } from './sdk/mnemo-sdk';

/** Degrees turned per px of hand drag. */
const DEG_PER_PX = 0.4;
/** The cube's distance range, in px of perspective translation. */
const DEPTH_MIN = -600;
const DEPTH_MAX = 300;
/** px gained per unit of log(factor): « come closer by 3 % » ≈ 9 px. */
const DEPTH_PX = 300;

type State = 'asking' | 'ready' | 'refused';

const FACES: Array<{ label: string; transform: string; color: string }> = [
  { label: 'front', transform: 'translateZ(60px)', color: '#3b82f6' },
  { label: 'back', transform: 'rotateY(180deg) translateZ(60px)', color: '#8b5cf6' },
  { label: 'right', transform: 'rotateY(90deg) translateZ(60px)', color: '#10b981' },
  { label: 'left', transform: 'rotateY(-90deg) translateZ(60px)', color: '#f59e0b' },
  { label: 'top', transform: 'rotateX(90deg) translateZ(60px)', color: '#ef4444' },
  { label: 'bottom', transform: 'rotateX(-90deg) translateZ(60px)', color: '#06b6d4' },
];

/** The cube face under a point of this page, or null. */
function faceAt(x: number, y: number): string | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el instanceof HTMLElement ? el.closest<HTMLElement>('[data-face]')?.dataset.face ?? null : null;
}

export default function GestureCube({ sdk }: { sdk: MnemoCartridgeSDK }) {
  const [rot, setRot] = useState({ x: -20, y: 30 });
  const [z, setZ] = useState(0);
  const [state, setState] = useState<State>('asking');
  /** The exploded view: faces pushed out from the centre. */
  const [exploded, setExploded] = useState(false);
  /** The face the index aims at, and the one picked by a select. */
  const [aimed, setAimed] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    const sub = sdk.onGestures({
      orbit: ({ dx, dy }) => setRot(r => ({ x: r.x - dy * DEG_PER_PX, y: r.y + dx * DEG_PER_PX })),
      depth: ({ factor }) => setZ(v => Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, v + Math.log(factor) * DEPTH_PX))),
      recenter: () => { setRot({ x: -20, y: 30 }); setZ(0); setExploded(false); },
      // The app's own action: declared in mnemo-plugin.json, pose taught by the person.
      action: ({ id }) => { if (id === 'explode') setExploded(v => !v); },
      // point and select come in this page's own px: the DOM finds the face.
      point: ({ x, y }) => setAimed(x === null || y === null ? null : faceAt(x, y)),
      select: ({ x, y }) => setPicked(faceAt(x, y)),
      next: () => setRot(r => ({ ...r, y: r.y + 90 })),
      prev: () => setRot(r => ({ ...r, y: r.y - 90 })),
    });
    sub.ready
      .then(() => setState('ready'))
      .catch((err: Error) => { setState('refused'); setReason(err.message); });
    return () => sub.off();
  }, [sdk]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div data-testid="gesture-cube-stage" style={{ height: 220, perspective: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <div
          data-testid="gesture-cube"
          style={{
            width: 120, height: 120, position: 'relative', transformStyle: 'preserve-3d',
            transform: `translateZ(${z}px) rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
          }}
        >
          {FACES.map(f => (
            <div key={f.label} data-face={f.label} style={{
              position: 'absolute', inset: 0, transform: exploded ? f.transform.replace('60px', '110px') : f.transform,
              transition: 'transform 300ms ease', background: `${f.color}33`,
              border: `${aimed === f.label || picked === f.label ? 4 : 2}px solid ${picked === f.label ? '#ffffff' : f.color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#e5e7eb', fontSize: 12, backfaceVisibility: 'visible',
            }}>{f.label}</div>
          ))}
        </div>
      </div>
      <p data-testid="gesture-cube-state" style={{ fontSize: 12, color: state === 'refused' ? '#fca5a5' : '#9ca3af', margin: 0 }}>
        {state === 'asking' && 'Asking the host for hand gestures…'}
        {state === 'ready' && 'Put this window in full screen, then pinch and move to turn the cube. Move your hand toward the camera to come closer. Open hands held still frame it again. Teach a pose for « Exploded view » in Settings › Gestures › My gestures to open it up.'}
        {state === 'refused' && `No gestures: ${reason}`}
        {picked && ` Picked: ${picked}.`}
      </p>
    </div>
  );
}
