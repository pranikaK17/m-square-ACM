# Little Team Quest — two-player co-op platform puzzle

A small browser platform game inspired by cooperative puzzle-platformers. It has four original levels, room creation, invite links, and real-time two-player play.

## No database / no app server

This project intentionally uses **no database and no custom backend server**. It uses PeerJS for WebRTC peer discovery/signaling and a direct peer-to-peer data connection for game inputs and state snapshots. The room host's browser is authoritative for physics and level progression.

That means:
- Host clicks **Create room** and shares the generated URL.
- Friend opens the URL and clicks **Join room**.
- Only two players are supported per room.
- The host must keep the game tab open. Closing or refreshing the host tab ends that room.
- There is no persistent room directory, account system, saved progress, or database.
- PeerJS's public signaling service is used by default; it is an external service and needs internet access. Actual game data travels peer-to-peer when the browsers can establish WebRTC.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL in a browser. For testing two players, use two browser profiles/devices. Localhost is only for your own machine; for a friend to join over the internet, deploy the site first.

## Deploy to Vercel

1. Create a GitHub repository and upload the contents of this project (the `package.json`, `index.html`, `src/`, etc. should be at the repository root).
2. In Vercel, choose **Add New → Project** and import that repository.
3. Vercel should detect Vite. Use these settings if asked:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. Deploy. No environment variables or database setup are required.
5. Open the deployed URL, create a room, and send the invite link to your friend.

`vercel.json` is included with these build settings.

## Controls

- Host / Player 1: **A / D** to move, **W** or **Space** to jump.
- Guest / Player 2: **Left / Right arrows** to move, **Up arrow** or **Space** to jump.
- Both players need to reach the exit. Find keys or stand on both switches when a level asks for it.

## Game structure

- Level 1: Find the key and reach the exit.
- Level 2: Stand on two switches together to open the gate.
- Level 3: Climb the stepping stones and collect the key.
- Level 4: Work together to activate both switches and reach the exit.

## Notes

This is a 2D prototype, not a recreation of Pico Park assets or levels. A host's tab is the temporary game host. For persistent rooms, reconnect after host disconnects, room-code discovery without an invite URL, or server-authoritative anti-cheat, add a hosted room/signaling service or a persistent backend later.
