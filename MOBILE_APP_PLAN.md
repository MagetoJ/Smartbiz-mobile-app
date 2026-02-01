# Mobile App Development Plan for StatBricks

## Requirements Summary
- ✅ Offline functionality (essential - POS must work offline)
- ✅ Native features (camera, push notifications, biometrics)
- ✅ Best user experience (native feel and performance)
- ✅ Both app stores (Google Play + Apple App Store)

---

## Recommended Approach: React Native with Expo

### Why React Native + Expo?

| Factor | Benefit |
|--------|---------|
| **Existing Skills** | Team already knows React + TypeScript |
| **Code Sharing** | Share API types, validation logic, and business rules with web |
| **Native UX** | True native components (not webview) = smooth, responsive UI |
| **Offline Support** | Mature solutions: WatermelonDB, SQLite, MMKV |
| **Native Features** | Camera, push notifications, biometrics all well-supported |
| **App Stores** | Expo EAS Build handles both stores seamlessly |
| **Development Speed** | Expo Go for instant testing, hot reload |

### Alternative: Flutter

Consider Flutter if you want:
- Slightly better performance for complex animations
- Single language (Dart) for all mobile development
- Built-in offline-first with Drift/Isar databases

Trade-off: Complete rewrite, team must learn Dart

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                 React Native App                     │
├─────────────────────────────────────────────────────┤
│  UI Layer (Native Components)                        │
│  - Bottom Tab Navigation (like current MobileNav)    │
│  - Native buttons, inputs, lists                     │
│  - Platform-specific styling (iOS/Android)           │
├─────────────────────────────────────────────────────┤
│  State Management                                    │
│  - Zustand or Redux Toolkit                          │
│  - React Query for server state + caching            │
├─────────────────────────────────────────────────────┤
│  Offline Layer                                       │
│  - WatermelonDB (SQLite-based, sync-ready)           │
│  - Queue for pending operations                      │
│  - Conflict resolution logic                         │
├─────────────────────────────────────────────────────┤
│  API Client (shared types with web)                  │
│  - Same endpoints as web                             │
│  - Automatic retry with exponential backoff          │
│  - Background sync when online                       │
├─────────────────────────────────────────────────────┤
│  Native Modules (via Expo)                           │
│  - expo-camera (product photos)                      │
│  - expo-notifications (push)                         │
│  - expo-local-authentication (biometrics)            │
│  - expo-secure-store (token storage)                 │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Project Setup
1. Initialize Expo project with TypeScript template
   ```bash
   npx create-expo-app statbricks-mobile --template expo-template-blank-typescript
   ```
2. Set up navigation (React Navigation with bottom tabs)
3. Configure Expo EAS for builds
4. Set up shared types from web codebase

### Phase 2: Core Screens
1. **Login Screen** - Subdomain + credentials, biometric option
2. **POS Screen** - Product grid, cart, checkout (priority for offline)
3. **Inventory Screen** - Product list with search/filter
4. **Dashboard Screen** - Stats and charts (Victory Native)
5. **Settings Screen** - Profile, tenant switching

### Phase 3: Offline Infrastructure
1. Set up WatermelonDB with schemas matching backend models
2. Implement sync engine:
   - Pull: Fetch changed records from server
   - Push: Send local changes to server
   - Conflict resolution: Last-write-wins or merge strategy
3. Queue system for offline operations
4. Sync status indicators in UI

### Phase 4: Native Features
1. **Camera** - Product photo capture with compression
2. **Push Notifications** - Low stock alerts, sale notifications
3. **Biometric Auth** - Face ID / fingerprint for quick login
4. **Secure Storage** - JWT token storage (not AsyncStorage)

### Phase 5: Polish & Testing
1. Platform-specific adjustments (iOS vs Android)
2. Performance optimization (list virtualization, image caching)
3. Offline testing scenarios
4. Beta testing via TestFlight / Play Store internal testing

### Phase 6: App Store Submission
1. Generate app icons and splash screens
2. Write store listings (screenshots, descriptions)
3. Submit to Apple App Store (review takes ~1-2 weeks)
4. Submit to Google Play (review takes ~1-3 days)

---

## Key Technical Decisions

### Offline-First Data Strategy

```
User Action → Save to Local DB → Update UI → Queue Sync
                                              ↓
                              (When online) → Push to Server
                                              ↓
                              (Success) → Mark synced
                              (Conflict) → Resolve & retry
```

**Critical for POS:** Sales must be recorded locally first, then synced. Receipt generation works offline with local sale ID.

### Shared Code with Web

**What to share:**
- TypeScript interfaces/types (Product, Sale, User, etc.)
- Validation schemas (Zod)
- Business logic (price calculations, stock computations)
- API endpoint definitions

**What stays separate:**
- UI components (React Native ≠ React DOM)
- Navigation structure
- Storage layer (WatermelonDB vs localStorage)

### Recommended Libraries

| Purpose | Library |
|---------|---------|
| Navigation | @react-navigation/native + bottom-tabs |
| State | Zustand + React Query |
| Offline DB | WatermelonDB |
| HTTP Client | Axios with retry |
| Forms | React Hook Form |
| Camera | expo-camera |
| Push | expo-notifications |
| Biometrics | expo-local-authentication |
| Secure Storage | expo-secure-store |
| Charts | Victory Native |

---

## Backend Changes Required

Minimal backend changes needed:

### 1. Sync Endpoints
Add endpoints for incremental sync:
```python
# GET /sync/products?since=<timestamp>
# Returns products modified after timestamp

# GET /sync/sales?since=<timestamp>
# Returns sales modified after timestamp

# POST /sync/push
# Batch upload offline changes
```

### 2. Push Notifications
Add device token registration:
```python
# POST /devices/register
# Body: {token, platform: "ios" | "android"}

# DELETE /devices/{token}
# Unregister device
```

### 3. Conflict Resolution
Add `updated_at` checks for optimistic locking on updates.

---

## Directory Structure

```
/apps
├── Chef/                    # Existing web app
│   ├── backend/
│   └── frontend/
└── statbricks-mobile/       # New mobile app
    ├── app/                  # Screens (Expo Router)
    │   ├── (tabs)/
    │   │   ├── index.tsx     # POS (default tab)
    │   │   ├── inventory.tsx
    │   │   ├── dashboard.tsx
    │   │   └── settings.tsx
    │   ├── login.tsx
    │   └── _layout.tsx
    ├── components/           # Reusable UI components
    │   ├── ProductCard.tsx
    │   ├── CartItem.tsx
    │   └── SyncIndicator.tsx
    ├── lib/
    │   ├── api/              # API client
    │   │   ├── client.ts
    │   │   └── endpoints.ts
    │   ├── db/               # WatermelonDB models & sync
    │   │   ├── schema.ts
    │   │   ├── models/
    │   │   └── sync.ts
    │   └── stores/           # Zustand stores
    │       ├── auth.ts
    │       └── cart.ts
    ├── hooks/                # Custom hooks
    │   ├── useOfflineSync.ts
    │   └── useNetworkStatus.ts
    ├── types/                # Shared TypeScript types
    │   └── index.ts
    ├── app.json              # Expo config
    └── eas.json              # EAS Build config
```

---

## Verification Plan

### 1. Offline Sales Test
- [ ] Enable airplane mode on device
- [ ] Complete a sale on mobile
- [ ] Verify receipt displays correctly
- [ ] Restore connectivity
- [ ] Confirm sale syncs to server
- [ ] Verify sale appears on web dashboard

### 2. Multi-Device Sync Test
- [ ] Create product on web
- [ ] Open mobile app
- [ ] Verify product appears after sync
- [ ] Modify product on mobile while offline
- [ ] Reconnect
- [ ] Verify change appears on web

### 3. Native Features Test
- [ ] Camera: Take product photo, verify upload
- [ ] Push: Trigger low-stock alert, verify notification received
- [ ] Biometrics: Enable fingerprint/Face ID login

### 4. App Store Submission Test
- [ ] Build production APK/IPA via EAS
- [ ] Test on physical iOS and Android devices
- [ ] Verify all native features work in production build
- [ ] Test deep links and universal links

---

## Cost Considerations

### Development
- **Expo EAS Build**: Free tier includes 30 builds/month (sufficient for development)
- **Apple Developer Account**: $99/year (required for App Store)
- **Google Play Developer Account**: $25 one-time fee

### Ongoing
- **Push Notifications**:
  - Expo Push free for basic usage
  - FCM (Android) and APNs (iOS) are free
- **EAS Updates**: Free tier covers most needs

---

## Timeline Estimate

| Phase | Description |
|-------|-------------|
| Phase 1 | Project setup, navigation, auth |
| Phase 2 | Core screens (POS, Inventory, Dashboard) |
| Phase 3 | Offline infrastructure |
| Phase 4 | Native features |
| Phase 5 | Testing and polish |
| Phase 6 | App store submission |

---

## Summary

**Recommended: React Native + Expo** for the best balance of:
- Development speed (familiar React stack)
- User experience (true native components)
- Offline capability (WatermelonDB)
- Native features (Expo SDK)
- App store deployment (EAS Build)

The existing web app's clean API architecture and mobile-responsive design patterns provide a solid foundation. The mobile app will share types and business logic while having its own native UI layer optimized for touch interactions and offline-first operation.
