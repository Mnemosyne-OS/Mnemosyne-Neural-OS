# Privacy and telemetry

**Last checked:** 2026-03

## Telemetry

- **No telemetry SDK:** no Sentry, Mixpanel, PostHog, Google Analytics or other analytics tool in the application.
- **No automatic sending** of usage data to third-party servers (except explicit calls to APIs configured by the user: OpenAI, OpenRouter, Ollama, etc.).
- **electron-updater:** update checks only against the configured release server (no additional tracking on Mnemosyne side).

## Sensitive data

- **API keys** are stored preferably in the OS secure storage (Electron `safeStorage`: Keychain / DPAPI / libsecret) when available; otherwise in the local config file.
- Handled by the secure-storage and config services in the main process (`safeStorage`-backed).

## If things change

If optional telemetry is ever added (e.g. anonymous crash reports), it must be:

- **disabled by default**;
- **clearly documented** in settings and docs;
- **GDPR compliant** (consent, information, right to erasure).
