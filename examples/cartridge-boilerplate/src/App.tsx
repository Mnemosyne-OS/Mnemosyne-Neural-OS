import { useState, useEffect } from 'react';
import { MnemoCartridgeSDK } from './sdk/mnemo-sdk';

// Initialize the SDK with the unique cartridge ID defined in mnemo-plugin.json
const sdk = new MnemoCartridgeSDK('@mnemosyne-plugins/boilerplate');

export default function App() {
  const [modelConfig, setModelConfig] = useState<any>(null);
  const [prompt, setPrompt] = useState('Explain the beauty of prime number distributions.');
  const [inferResult, setInferResult] = useState('');
  const [inferring, setInferring] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Auto-fetch host model config on mount
  useEffect(() => {
    sdk.getModelConfig()
      .then((cfg) => setModelConfig(cfg))
      .catch((err) => {
        console.warn('Could not load host model config:', err);
        setErrorMsg(err.message);
      });
  }, []);

  const handleInference = async () => {
    if (!prompt.trim()) return;
    setInferring(true);
    setInferResult('');
    setErrorMsg('');
    try {
      const response = await sdk.inferModel({
        prompt: prompt.trim(),
        temperature: 0.7
      });
      setInferResult(response.text || JSON.stringify(response, null, 2));
    } catch (err: any) {
      setErrorMsg(err.message || 'Inference failed');
    } finally {
      setInferring(false);
    }
  };

  const handleSelectFolder = async () => {
    setErrorMsg('');
    try {
      const res = await sdk.selectFolder();
      if (res.success && res.path) {
        setSelectedFolder(res.path);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.logoBadge}>⚙️</div>
        <div>
          <h1 style={styles.title}>Cartridge Starter Template</h1>
          <p style={styles.subtitle}>Secured by Mnemosyne OS Zero-Trust Sandbox</p>
        </div>
      </header>

      <main style={styles.main}>
        {errorMsg && (
          <div style={styles.errorBox}>
            <span style={{ fontWeight: 600 }}>⚠️ Security/API Alert:</span> {errorMsg}
          </div>
        )}

        {/* Model Config Section */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>System Model Integrations</h2>
          {modelConfig ? (
            <div style={styles.statsRow}>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Active Provider</span>
                <span style={styles.statValue}>{(modelConfig.provider || 'Local').toUpperCase()}</span>
              </div>
              <div style={styles.stat}>
                <span style={styles.statLabel}>Default Model</span>
                <span style={styles.statValue}>{modelConfig.model || 'Nomic-Embed'}</span>
              </div>
            </div>
          ) : (
            <p style={styles.loadingText}>Fetching system configuration from host...</p>
          )}
        </section>

        {/* Native OS Dialog Integration */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>OS Native Dialog Integration</h2>
          <p style={styles.cardDesc}>Request access to local storage directories through host permission gates.</p>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button onClick={handleSelectFolder} style={styles.btnSecondary}>
              📁 Choose Local Folder
            </button>
            {selectedFolder && (
              <span style={styles.pathLabel}>{selectedFolder}</span>
            )}
          </div>
        </section>

        {/* AI Playground Section */}
        <section style={styles.card}>
          <h2 style={styles.cardTitle}>AI Playground Playground</h2>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={styles.textarea}
            placeholder="Type your prompt..."
            rows={3}
          />
          <button
            onClick={handleInference}
            disabled={inferring}
            style={inferring ? { ...styles.btnPrimary, opacity: 0.6 } : styles.btnPrimary}
          >
            {inferring ? 'Running Inference...' : '✨ Run AI Query'}
          </button>

          {inferResult && (
            <div style={styles.resultBox}>
              <h3 style={styles.resultHeader}>Response:</h3>
              <p style={styles.resultText}>{inferResult}</p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    backgroundColor: '#0a0a0c',
    color: '#f3f4f6',
    boxSizing: 'border-box' as const,
    padding: '24px',
    overflowY: 'auto' as const,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    paddingBottom: '16px',
  },
  logoBadge: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    border: '1px solid rgba(59, 130, 246, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '20px',
  },
  title: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    background: 'linear-gradient(90deg, #60a5fa, #3b82f6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  subtitle: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: '2px 0 0 0',
  },
  main: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  card: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid rgba(255, 255, 255, 0.06)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
  },
  cardTitle: {
    fontSize: '13px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    color: '#e5e7eb',
    margin: 0,
  },
  cardDesc: {
    fontSize: '12px',
    color: '#9ca3af',
    margin: 0,
    lineHeight: '1.5',
  },
  statsRow: {
    display: 'flex',
    gap: '24px',
  },
  stat: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  statLabel: {
    fontSize: '11px',
    color: '#6b7280',
    textTransform: 'uppercase' as const,
  },
  statValue: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#3b82f6',
  },
  loadingText: {
    fontSize: '12px',
    color: '#6b7280',
    fontStyle: 'italic',
    margin: 0,
  },
  pathLabel: {
    fontSize: '12px',
    color: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    padding: '6px 12px',
    borderRadius: '6px',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    wordBreak: 'break-all' as const,
  },
  textarea: {
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    color: '#f3f4f6',
    padding: '10px 12px',
    fontSize: '13px',
    fontFamily: 'inherit',
    outline: 'none',
    resize: 'vertical' as const,
  },
  btnPrimary: {
    backgroundColor: '#2563eb',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 16px',
    fontSize: '13px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  btnSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    color: '#e5e7eb',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '8px',
    padding: '8px 14px',
    fontSize: '12px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    border: '1px solid rgba(239, 68, 68, 0.2)',
    borderRadius: '8px',
    padding: '12px 16px',
    color: '#fca5a5',
    fontSize: '12px',
    lineHeight: '1.5',
  },
  resultBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    borderRadius: '8px',
    padding: '12px',
    marginTop: '8px',
  },
  resultHeader: {
    fontSize: '11px',
    color: '#9ca3af',
    textTransform: 'uppercase' as const,
    margin: '0 0 6px 0',
  },
  resultText: {
    fontSize: '12px',
    color: '#e5e7eb',
    margin: 0,
    lineHeight: '1.6',
    whiteSpace: 'pre-wrap' as const,
  },
};
