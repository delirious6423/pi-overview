# Upstream provenance

This is a combined derivative under MIT. Original notices are preserved in LICENSE and history/LICENSE.

- Quota monitor: https://github.com/mtrojnar/pi-usage, commit `bab49aed024f76b60877bc08f6854a8ffcb6d4b1` (v0.2.0). Copyright 2026 timm-u and Michał Trojnara.
- History UI, parser, cache, graphs, exports: https://github.com/tmustier/pi-extensions/tree/main/usage-extension, commit `4a63a2ebd3683d86597e226c7ff778ea4837dd73` (v0.9.5). Copyright 2026 Thomas Mustier.
- Your history upstream fork: https://github.com/delirious6423/pi-extensions.

Integration changes: exported a quota snapshot/refresh/subscription controller; made its command name and notifications configurable; exported the history component and its period/data updates; defaulted history to tables; added one combined panel with scrolling, cache read/write statistics, refresh and cleanup; updated test mocks for Pi 0.99.1 event unsubscription.

GitHub associates a fork with one parent. pi-overview uses the quota repository as that parent and vendors only the history extension from the second repository. Updating either source is an explicit reviewed import, not an automatic dependency update.
