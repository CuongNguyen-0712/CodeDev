// Source of the Sanity lesson document. Build: node content/tools/build-lesson.mjs <this folder>
// Narrative only - quiz answers live in challenges.json (-> Postgres).
// Template: core-first (content/PROMPT_CONTEXT.md O2).
export default ({ h2, p, bullets, code, callout, challenge }) => ({
    _id: "lesson-rno-3-2",
    title: "Background tasks and battery budgets",
    slug: { _type: "slug", current: "react-native-background-tasks-battery" },
    description:
        "Couriers said the app ate a fifth of their battery per hour and still showed stale deliveries after a dead zone. Learn what the operating system lets an app do in the background, how background tasks are scheduled, how to ask for location without keeping the GPS awake, and where the outbox should really be flushed.",
    estimatedTime: 14,

    scenario: {
        role: "Mobile developer on Rice Rocket's courier app (React Native, Expo)",
        problem:
            "Dispatch needs each courier's position and the app needs its outbox delivered, even when the phone is in a pocket. The first version asked for GPS every second and tried to retry uploads with a JavaScript timer in the background. Batteries died before the evening shift; uploads still waited until the courier opened the app.",
    },

    content: [
        h2("Situation"),
        code("text", `
Battery usage (Android settings, 6-hour lunch shift, Galaxy A03)
  Rice Rocket Courier   41%   (GPS active 5 h 52 min, kept awake 3 h 10 min)
  Screen                22%
Support tickets this week: 37 "battery", 12 "delivery still shows after it was cancelled"`, "evidence"),
        bullets([
            "Location: best-for-navigation accuracy, an update every second, even while the courier waits at a restaurant.",
            "Outbox: an `AppState` listener started `setInterval` on background; the retries stopped as soon as the OS suspended the app.",
            "A background fetch registered with a 1-minute interval ran a few times an hour, and the team thought it was broken.",
        ]),

        h2("The core you need"),
        bullets([
            "**The OS owns the background.** Shortly after an app leaves the screen, iOS and Android suspend it: JavaScript stops, timers stop, sockets may close. Work continues only through mechanisms the OS schedules.",
            "**Background tasks are best-effort and periodic.** `expo-background-task` (the successor of expo-background-fetch in recent Expo SDKs) registers work with WorkManager on Android and BGTaskScheduler on iOS. `minimumInterval` is a lower bound; Android's periodic work runs at most every 15 minutes, and both systems defer it for battery saving and usage patterns. Keep each run short and idempotent.",
            "**Location has its own budget.** Background location on Android runs as a foreground service with a visible notification and needs the background location permission. Accuracy and frequency decide the cost: `Accuracy.Balanced` with a `distanceInterval` sends updates only when the courier moves.",
            "**Flush the outbox when you can, not on a timer.** The reliable moments are: the app returns to the foreground, the network comes back while the app runs, and a background task run. Each flush sends what is queued and stops early when the OS time budget is close.",
            "**Push for urgency.** If dispatch must reach a courier within seconds (a reassignment), send a push notification from the server; do not poll from the phone.",
        ]),

        h2("Apply it in the project"),
        code("ts", `
import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import * as Location from "expo-location";

TaskManager.defineTask("sync-outbox", async () => {
  try {
    await outbox.flush({ deadlineMs: 20_000 });   // stop early, the OS gives a short window
    await syncDeliveries(api);                   // lesson 6, resumes from its cursor
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function startBackgroundWork() {
  await BackgroundTask.registerTaskAsync("sync-outbox", { minimumInterval: 15 }); // minutes, a lower bound
  await Location.startLocationUpdatesAsync("courier-location", {
    accuracy: Location.Accuracy.Balanced,
    distanceInterval: 50,                        // meters: no updates while standing still
    deferredUpdatesInterval: 30_000,             // batch updates where the platform supports it
    foregroundService: {
      notificationTitle: "Rice Rocket is sharing your location",
      notificationBody: "Only while you are on shift.",
    },
  });
}

// Foreground: flush as soon as the courier comes back or the network returns
AppState.addEventListener("change", (s) => { if (s === "active") outbox.flush({ deadlineMs: 10_000 }); });
NetInfo.addEventListener((n) => { if (n.isConnected) outbox.flush({ deadlineMs: 10_000 }); });`, "src/background/tasks.ts"),
        callout("warning", "Check the API of your SDK",
            "Background task and location option names have changed across Expo SDK versions (expo-background-fetch was replaced by expo-background-task). Read the documentation for the SDK you build with, and test on a release build: Expo Go cannot run all background features."),

        h2("Verify"),
        code("bash", `
# Android: list scheduled work and force a run of the background task
adb shell dumpsys jobscheduler | grep -A3 app.ricerocket.courier
adb shell cmd jobscheduler run -f app.ricerocket.courier <job-id>
# Battery over a 2-hour test route, before and after:
adb shell dumpsys batterystats --reset    # before the route
adb shell dumpsys batterystats app.ricerocket.courier | grep -i -E "gps|wake"
#   before: GPS 1h 58m active     after: GPS 34m active (updates only while moving)`, "terminal"),

        h2("Pitfalls"),
        bullets([
            "**Promising intervals the OS does not keep.** A product requirement of \"sync every minute in the background\" cannot be met by background tasks. Detect it in the job scheduler dump; move the urgent part to push notifications.",
            "**Long background runs.** A task that keeps working past its window is stopped and, on iOS, scheduled less often afterwards. Log run durations and keep them well under the limit.",
            "**Forgetting the permission story.** Background location needs extra permissions and, on Android, a visible notification. Couriers who deny it must still be able to work in the foreground; test that path.",
        ]),

        challenge("chal_quiz_rno_181"),
    ],
});
