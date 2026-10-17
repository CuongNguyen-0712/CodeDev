# Wallet race lab

Reproduce a double-spend in a payment API, then fix it with a Redis distributed lock.

## Run

```bash
docker compose up -d        # Redis on localhost:6379
npm install
npm start                   # API on http://localhost:3000, lock OFF
npm run attack              # 2 concurrent payments of 80,000 on a 100,000 wallet
```

You should see both payments approved: the race from the lesson.

## Fix

1. Implement `createLock` in `src/lock.js` (SET NX PX + Lua compare-and-delete).
2. Restart with the lock: `npm run start:locked` (on Windows PowerShell: `$env:USE_LOCK=1; npm start`).
3. `npm run attack -- 10` - exactly one payment of 80,000 is approved; the rest get 409.
