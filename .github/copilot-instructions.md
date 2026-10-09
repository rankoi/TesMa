# TesMa Android workspace instructions

- Treat this project as a local-first Android task manager built with Vite, TypeScript, and Capacitor.
- Keep `forWeb(変更禁止)` unchanged; the legacy web/GAS implementation is reference material only.
- Persist Android task data in the on-device SQLite database. Browser development may use localStorage as a fallback.
- Use Capacitor Local Notifications for reminders; do not reintroduce Discord notifications.
- Do not add Google Sheets integration; use portable JSON backups shared to a user-selected destination.
- Build and test web assets with `npm run build`. Run `npm run android:sync` before building the Android APK.
