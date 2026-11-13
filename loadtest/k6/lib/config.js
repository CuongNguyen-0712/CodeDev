// Init-context only: reads the env and the Task 3 inputs mounted at /data.
import { SharedArray } from "k6/data";

export const BASE_URL = __ENV.BASE_URL || "http://app:3000";
// What the app believes its own origin is (NEXTAUTH_URL); sessions were minted against it.
export const ORIGIN = __ENV.ORIGIN || "http://localhost:3000";
export const PROFILE = __ENV.PROFILE || "smoke";

export const sessions = new SharedArray("sessions", () => JSON.parse(open("/data/sessions.json")));
export const actions = JSON.parse(open("/data/actions.json"));
// How many of the minted sessions this run uses.
export const N = Math.min(Number(__ENV.N) || sessions.length, sessions.length);

// Each VU owns one session; the same VU always gets the same user.
export const sessionForVu = (vu) => sessions[(vu - 1) % N];
