/**
 * UpdateNotice.tsx — the version badge, and one line when the host says a
 * newer version is out (doc 142 §4.3). Copy it with updateStrings.ts.
 *
 *   unknown or absent → the badge only (never « up to date »: the check may
 *                        not have happened)
 *   current           → the badge, « Up to date » on hover
 *   newer             → a coloured badge and a line with « Open the Hub »
 *
 * « Open the Hub » installs nothing: it opens the Hub on this cartridge's own
 * page. When no Hub heard it (the cartridge in its own window), the line says
 * to open the Hub by hand.
 */
import { useEffect, useState } from 'react';
import { onHostConfig, type MnemoCartridgeSDK } from './sdk/mnemo-sdk';
import { foldHostConfig, UPDATE_STRINGS, updateLang, type NoticeState } from './updateStrings';

export function UpdateNotice({ sdk, bundledVersion, initialLang }: {
  sdk: MnemoCartridgeSDK;
  /** The version your bundle was built with: shown when the host sends none. */
  bundledVersion: string;
  initialLang?: string;
}): JSX.Element {
  const [notice, setNotice] = useState<NoticeState>(initialLang ? { lang: initialLang } : {});
  const [unheard, setUnheard] = useState(false);
  // apply: false — main.tsx already applies the host's look.
  useEffect(() => onHostConfig((cfg) => setNotice((prev) => foldHostConfig(prev, cfg)), { apply: false }), []);

  const s = UPDATE_STRINGS[updateLang(notice.lang)];
  const version = notice.version ?? bundledVersion;
  const update = notice.update;
  const open = (): void => {
    sdk.showUpdateInHub()
      .then((r) => setUnheard(!r?.opened))
      .catch((err: unknown) => {
        console.warn('[UpdateNotice] the Hub could not be opened:', err);
        setUnheard(true);
      });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {update?.state === 'newer' ? (
        <button onClick={open} style={styles.badgeNew}>{s.badgeNew(version, update.latestVersion)}</button>
      ) : (
        <span style={styles.badge} title={update?.state === 'current' ? s.current : undefined}>{s.badge(version)}</span>
      )}
      {update?.state === 'newer' && (
        <p role="status" style={styles.line}>
          {update.critical ? s.critical(update.latestVersion) : s.available(update.latestVersion)}{' '}
          {unheard ? s.openYourself : <button onClick={open} style={styles.link}>{s.open}</button>}
        </p>
      )}
    </div>
  );
}

const styles = {
  badge: {
    alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999,
    color: 'var(--text-muted, #9490a6)', border: '1px solid var(--border-subtle, #2a2735)',
  },
  badgeNew: {
    alignSelf: 'flex-start', fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 999, cursor: 'pointer',
    color: 'var(--text-on-accent, #fff)', background: 'var(--accent, #7c6bf5)', border: '1px solid transparent',
  },
  line: { margin: 0, fontSize: 13, color: 'var(--text-primary, #ece9f5)' },
  link: {
    font: 'inherit', padding: 0, border: 'none', background: 'none', cursor: 'pointer',
    color: 'var(--accent, #7c6bf5)', textDecoration: 'underline',
  },
} as const;
