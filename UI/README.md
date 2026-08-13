# Hearth

A private watch-party app for two. One person hosts a movie from a file already on their device, the other joins with a code, and they watch it together — in sync, by nature — with text chat running alongside the whole time.

Standalone project. Separate native builds for Windows and Android. This document is the single source of truth for the concept, architecture, and decisions made so far.

---

## 1. Core concept

Only the host has the movie file. Instead of uploading it anywhere or asking both people to own a copy, the host **streams their own local playback live** to the other person:

1. Host opens the file in a hidden video element inside the app.
2. The app grabs that element's live output using `HTMLMediaElement.captureStream()`.
3. That captured stream is sent directly to the viewer over a WebRTC peer connection.
4. The viewer just receives and renders a live audio/video feed — like a private, one-person broadcast meant for one other person.

**Why this instead of screen-share (`getDisplayMedia()`):**
- No OS-level "share your screen" permission flow, which behaves inconsistently across Windows and Android.
- Captures only the video element's output — no taskbar, cursor, or other windows leaking through.
- `captureStream()` is supported consistently across Chromium — which covers both target platforms since Electron/Tauri (Windows) and Capacitor's WebView (Android) are both Chromium-based.

**Why sync is basically free:**
Because the viewer is watching a live stream of the host's playback (not their own local copy), there's no separate "keep both players' positions in sync" protocol to build. If the host pauses, rewinds, or seeks, the viewer sees it happen live. This removes an entire class of bugs that most watch-party apps have to solve by broadcasting playback-position updates back and forth.

---

## 2. Architecture

| Piece | Role |
|---|---|
| **Accounts service** | Stores each person's chosen username, their friend list, and who's currently online/hosting. This is new — the original design was fully accountless. |
| **Signaling server** | Small Node.js + WebSocket server. Used to exchange WebRTC offer/answer/ICE candidates when a session starts — not involved once the connection is live. Also relays chat messages and lightweight status events. |
| **STUN server** | Free/public STUN (e.g. Google's) resolves most direct peer-to-peer connections through home NAT/routers. |
| **TURN server** | Fallback relay (self-hosted via coturn, or a hosted TURN provider) for the connections STUN can't get through directly. Without this, some connections will just silently fail. |
| **Host app** | Local file picker → hidden `<video>` → `captureStream()` → `RTCPeerConnection` → transport controls (play/pause/seek) that drive the local player, which the viewer sees live. |
| **Viewer app** | Receives the media stream, renders it, shows connection status, sends/receives chat over the same peer connection's data channel. |
| **Chat (data channel)** | Text chat rides the same `RTCPeerConnection` as the video/audio, using a WebRTC data channel. Once the connection is established, messages travel peer-to-peer with no extra server hop, encrypted at the transport level (DTLS) by default. |

### Known tradeoffs
- **Upload-bound quality.** Stream quality is capped by the *host's* upload bandwidth, which is usually the weaker side of most home internet connections — worth surfacing a quality/bandwidth setting rather than assuming it'll always be smooth.
- **Host-dependent.** If the host's device sleeps, the app crashes, or they close the laptop lid, the stream drops for both. A reconnect flow matters more here than in most apps.
- **Not built to scale past two or three people.** This is a deliberate peer-to-peer design for a couple, not a broadcast platform. Adding more viewers reliably would mean introducing an SFU (e.g. mediasoup) later — out of scope for now.
- **A real backend now exists.** Accounts and friends need somewhere to live persistently (a small database, not just an in-memory signaling server), and that data needs to survive both people being offline — this is new infrastructure the original code-only design didn't need.

---

## 2.1 Accounts & friends

Joining a screening no longer has to mean typing a code every time. Each person picks a **custom username** (not an auto-generated tag) when they first open the app. From there:

- **Friends list** replaces the old bare "Host / Join" landing screen as the main hub. Each friend shows a live status: offline, online, or **hosting now**.
- When a friend is hosting, their card gets a direct **Join** button — no code, no typing, just tap in.
- **Adding a friend** works two ways, both supported: search/enter their exact username and send a request, or share your personal invite link (they tap it, request sent automatically).
- **The code option never goes away.** Anyone who doesn't want an account, or isn't a friend yet, still gets the ticket-stub code flow exactly as before. This is additive, not a replacement.



## 3. Tech stack

Both platforms share the same core HTML/CSS/JS logic (UI, WebRTC handling, chat), wrapped separately so each still ships as a genuine native app:

- **Windows** — Electron or Tauri. Both wrap a Chromium-based webview, so `captureStream()` and WebRTC behave exactly like they would in a browser.
  - Electron: heavier binary, more mature WebRTC tooling and community examples.
  - Tauri: much smaller binary, Rust-based shell, WebView2 (Chromium-based on Windows) under the hood.
- **Android** — Capacitor, wrapping the same web code into a real `.apk`. Android's system WebView is Chromium-based, so `captureStream()` support carries over from the desktop build.
  - Full-native (Kotlin + ExoPlayer) is the alternative if the Android app ever needs a more custom media pipeline — but it means re-implementing the streaming/chat layer a second time in a different language.

---

## 4. Features

### MVP (what makes it work at all)
- Host picks a local file and starts a session
- Session code to join (host ↔ viewer pairing)
- Live streamed playback via `captureStream()` + WebRTC
- Host-side transport controls (play / pause / seek / rewind / forward)
- Text chat over the WebRTC data channel

### Add-ons (agreed on, not yet built)
- **Reactions** — quick-tap icons (heart, laugh, gasp, shush) that appear briefly without needing to type
- **Connection quality indicator** + automatic low-bandwidth mode if the stream starts stuttering
- **Lobby / ready check** before the movie actually starts, so both people are settled in first
- **Chat timestamps tied to the movie's timeline** (e.g. "1:04:12") rather than clock time, so scrolling back later shows what was said at what point in the film
- **Snapshot button** to save a still of a moment
- **Push notification** when the host starts a session, or when any friend goes live
- **Reconnect flow** if the connection drops mid-movie, instead of restarting from scratch — surfaced in the UI as a "Reconnecting…" overlay rather than a frozen frame
- **Watch history / log** of movies watched together — a lightweight version now shows on each friend's card as a "nights together" count
- **Captions/subtitles toggle** — a CC control next to the other playback controls
- **Independent viewer volume** — the viewer controls their own received audio, separate from the host's local playback
- **Deep-link joining** — a shareable link for a specific screening that auto-fills the code, so joining doesn't always require typing one in
- **A curtain-opening transition** into fullscreen — a brief "lights down" moment rather than an abrupt cut, in keeping with the hearth/ticket-stub visual language

### Friends system additions (this round)
- **Friend requests inbox** — incoming requests now have somewhere to be accepted or declined, not just sent
- **Settings screen** — edit profile, and two privacy/notification controls: appearing offline, and choosing who sees your "hosting now" status
- **Unfriend / block** — a small menu on each friend's card
- **Per-friend "notify me when they go live"** toggle, independent of the global notification setting
- **"Nights together" stat** on each friend's card — a small warm touch showing shared history, not just present status
- **Username-taken error state** on the very first screen, with quick alternate-name suggestions

### Explicitly deferred
- **Voice chat** — text-only for now. The architecture already supports adding a live audio track later without a rework, since it would just be another track on the same peer connection.
- **Webcam bubbles** (seeing each other's face while watching) — same story, deferred but not architecturally blocked.

---

## 5. Chat design decisions

- **Persistence:** messages are expected to be saved as a running log per session, not wiped when the call ends — treated more like a log of movie nights than throwaway chat.
- **Notification style:** while the chat panel is collapsed/backgrounded, use a subtle badge rather than an intrusive notification that pulls attention off the movie.
- **Layout differs by platform on purpose:**
  - **Android** — chat lives in a collapsible bottom drawer with an unread badge normally, and as a floating pill → bottom sheet in fullscreen, since screen space is tight and the video should stay the focus by default.
  - **Windows** — chat is a persistent sidebar next to the video in the windowed view, and a slide-in panel from the right edge in fullscreen, since desktop has the room for it.
- **The chat trigger fades with the rest of the overlay in fullscreen** — it doesn't float permanently on top of the video; it only appears when the other playback controls are visible, and disappears with them after a few seconds of inactivity.

---

## 6. UI mockups (this delivery)

Two static, clickable HTML prototypes — visual design only, no real networking/file/streaming/account logic wired up yet:

- `android-ui.html` — **username (with taken-name error demo) → home (friends list + host action + requests/add-friend/settings icons) → friend requests inbox → add friend → join by code (with deep-link auto-fill badge) → settings → host lobby → watching (captions, volume, reconnect-demo) → expanded chat → fullscreen (curtain transition in, overlay controls, floating chat trigger)**
- `windows-ui.html` — same flow, desktop-shaped: **username → home → requests / add friend / join by code / settings (as modals) → host lobby → watching (persistent sidebar chat, captions, volume) → fullscreen (curtain transition, slide-in chat panel)**

A small red button in the bottom nav bar of both files toggles a "Reconnecting…" overlay on demand, for reviewing that state without needing a real dropped connection.

**Design language (shared across both):**
- Palette: warm, dark brown-black base (`#130F0C`), vibrant burnt orange accent (`#E8793E`), muted terracotta (`#C2410C`), muted curtain red (`#8B3A42`) for sparing emphasis
- Type: Fraunces (display/headings), Manrope (body/UI), JetBrains Mono (session codes, timestamps, connection stats)
- Signature motif: a film-strip sprocket border on the video frame, and session codes presented like a ticket stub — reinforcing the "private screening" concept without leaning on emoji or stock icons
- No emoji in UI chrome — all icons are inline SVG, consistent with prior projects

Both files include a small floating prototype nav (bottom of screen) purely for reviewing the different screens — not part of the actual app's UI.

---

## 7. Status & next steps

**Current stage:** UI design only. Nothing here is functionally wired up yet.

**Suggested build order from here:**
1. Signaling server (Node.js + WebSocket) — offer/answer/ICE exchange, chat relay
2. Host-side capture pipeline — file picker → hidden `<video>` → `captureStream()` → `RTCPeerConnection`
3. Viewer-side receive + render
4. Data channel chat, wired to the UI already designed here
5. Wrap as Electron/Tauri (Windows) and Capacitor (Android) native builds
6. Add-ons, roughly in the order listed in Section 4
