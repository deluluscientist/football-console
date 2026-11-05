# Football Console — MVP

A browser football game prototype: laptop as the match display, phones as wireless controllers.

## Included

- Three selectable modes: 1v1, 2v2, 1 Player vs AI
- 11 players per team (22 total)
- Three.js 3D pitch with an angled broadcast-style camera
- Laptop host lobby with QR code and room code
- Mobile browser controller with virtual joystick and action buttons
- Socket.IO real-time server
- Basic rule-based movement/AI, ball movement, scoring and match timer
- Keyboard fallback for local testing

## Requirements

- Node.js 20 or newer
- npm 10 or newer

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173` on the laptop.

For phones on the same Wi-Fi:
1. Find the laptop's local IPv4 address (macOS: `ipconfig getifaddr en0`).
2. Open `http://YOUR-LAPTOP-IP:5173` on the phone, or scan the QR code from the laptop page when the laptop is accessed through that LAN address.
3. Create a room and join using the phone camera.
4. Select a mode and start.

If the QR code points to `localhost`, phones cannot use it. Open the laptop app using its LAN IP before creating the room.

## Controls

### Laptop keyboard
- WASD or arrow keys: move the red team's active player
- E: pass
- Space: shoot
- Q: switch player
- F: tackle

### Mobile
- Virtual joystick: move
- SHOOT, PASS, THROUGH, SWITCH, SPRINT, TACKLE: actions

## Important MVP limitations

This is a playable foundation, not a finished commercial football simulator:
- Player movement and ball handling are deliberately simplified.
- The AI uses simple positioning and ball-chasing heuristics, not trained machine learning.
- The match currently uses a simplified 5-minute timer and basic goal detection.
- 1v1 and 2v2 controller assignment is a first-pass implementation; team AI fills unassigned roles.
- A public internet deployment needs HTTPS, secure room tokens, authentication/rate limits, server-authoritative input validation, reconnection handling, and load testing.
- Rapier is part of the planned physics upgrade, but the initial MVP uses a lightweight custom ball update so the prototype can run with fewer dependencies.

## Architecture

- `apps/web`: React, Three.js, QR lobby, mobile controller
- `apps/server`: Express and Socket.IO room/match server
- `packages` can be introduced later for shared simulation types and rules

## Health check

With the server running, visit `http://localhost:3001/api/health`.
