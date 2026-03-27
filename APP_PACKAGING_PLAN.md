# Bloomie App Packaging Plan

## Objective
Run Bloomie cleanly across web, mobile, and desktop operating systems while sharing the same product core.

## 1. Web

### Recommendation
- primary product should be a web app
- responsive admin and employee experience
- PWA support for installability

### Requirements
- manifest
- service worker
- offline shell for basic UX
- HTTPS
- caching strategy

## 2. Mobile

### Short-term
- PWA install on Android
- PWA-capable browser usage on iOS

### Mid-term
- Capacitor wrapper or React Native shell

### Mobile requirements
- push notifications
- safe-area handling
- upload support
- deep links
- auth token/session refresh

## 3. Desktop

### Short-term
- browser-based app on Windows/macOS/Linux

### Mid-term
- Tauri or Electron desktop shell for admin-heavy usage

### Desktop requirements
- secure update mechanism
- file upload/download support
- local caching
- notification support

## Recommended Packaging Order
1. secure web app
2. PWA
3. Android wrapper
4. iOS mobile shell strategy
5. desktop shell if demand justifies it

## OS Compatibility Notes
- Windows/macOS/Linux: web first
- Android: PWA and wrapper friendly
- iOS: web app mode possible, but service worker/push behavior must be tested carefully

## Deployment Channels
- web domain per tenant or shared domain with subdomain mapping
- Android APK/AAB later
- iOS App Store later if native wrapper is built
- desktop installers later if Tauri/Electron is adopted
