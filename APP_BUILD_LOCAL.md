# Bloomie Build Guide

## What Is Saved Locally
- PWA assets and service worker
- Capacitor config for Android and iOS
- Electron desktop shell for macOS and Windows
- helper script: `scripts/prepare-app-shell.js`

## Target Coverage
- Android: Capacitor wrapper
- iOS: Capacitor wrapper
- macOS: Electron shell
- Windows: Electron shell

## First Run
1. `npm install`
2. `node scripts/prepare-app-shell.js`
3. `npm run app:desktop`

## Mobile Setup
1. `npm run app:android:sync`
2. `npm run app:android:open`
3. `npm run app:ios:sync`
4. `npm run app:ios:open`

## Notes
- By default mobile wrappers point to the live Bloomie demo URL in `capacitor.config.json`.
- Desktop defaults to `http://127.0.0.1:4181` unless `BLOOMIE_APP_URL` is set.
- For production apps, replace the demo URL and set real production secrets before packaging.
