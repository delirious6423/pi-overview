# Pi Overview

One terminal panel for usage history, cache statistics, and account quota windows. A combined MIT derivative of [Michał Trojnara/timm-u’s quota monitor](https://github.com/mtrojnar/pi-usage) and [Thomas Mustier’s usage dashboard](https://github.com/tmustier/pi-extensions/tree/main/usage-extension). See [UPSTREAM.md](UPSTREAM.md) and the retained licenses.

## Install

Requires Pi 0.99.1 or newer (before 1.0) and Node 22.19+.

```sh
pi install git:github.com/delirious6423/pi-overview
```

Restart Pi or run `/reload`, then `/overview`.

Load this combined package by itself. If you already installed the originals, remove them first with `pi remove npm:@mtrojnar/pi-usage` and `pi remove npm:@tmustier/pi-usage-extension`. Both original packages register `/usage`.

## Controls

| Command/key | Action |
|---|---|
| `/overview` or `/usage` | Combined Usage / Cache / Quotas panel |
| `/history` | Full history dashboard with tables, graphs, insights, and exports |
| `/quota` | Refresh quota data and the compact footer |
| `Tab` / left / right | Change history period |
| Up / down / Enter | Select and expand providers into models |
| `v` | Switch table, insights, and graph views |
| `e` | Export the current history view using upstream export settings |
| `r` | Refresh history and quotas together |
| `PgUp` / `PgDn` | Scroll the combined panel |
| `k` / `h` | Jump to quota section / history |
| `q` / Esc | Close |

The panel preserves upstream graph and table filter controls. Their hints remain in the history section. Narrow terminals show fewer table columns; the separate Cache section still reports cache reads, writes, and read share of all prompt tokens. Resize or scroll to view more.

## Data and overhead

History reads local Pi session JSONL files on demand, deduplicates messages, and reuses the upstream incremental disk cache. No browser dashboard, HTTP server, database, or file watcher. A compact quota footer runs through one monitor instance. The open panel has one 60-second display timer; closing it clears the timer and subscription. Network checks retain the upstream startup/30-minute schedule and Codex activity refresh.

Account quotas apply to the authenticated account and have their own windows; changing the history period does not change them. The history cost column contains recorded model-price usage estimates, not subscription fees. Zero recorded cost does not prove free usage. The cache read share is `cacheRead / (input + cacheRead + cacheWrite)`, not a per-request hit rate.

Unavailable accounts do not get invented percentages. Expired quota windows use the upstream stale marker. Values shown at open can be cached while the independent quota refresh runs. Use `r` to refresh both sources. History scan errors are reported; closing an in-progress refresh aborts the history scan.

## Providers and configuration

Quota support comes from the upstream monitor: Codex (`openai-codex`), Anthropic, GitHub Copilot, OpenCode Go/Zen, Kimi, Z.AI, Xiaomi subscriptions, and OpenRouter accounting. Plain OpenAI API use is included in local history but does not produce a ChatGPT subscription quota. Multiple simultaneous accounts per provider and Antigravity quotas are not implemented.

The monitor reuses Pi’s effective credentials and retained origin-binding/redirect checks. Keys and session histories stay out of this repository. Some upstream provider checks and fallback paths issue minimal model probes and can consume usage; see [QUOTA-UPSTREAM.md](QUOTA-UPSTREAM.md) for details.

For manual network refresh plus passive headers:

```sh
PI_USAGE_PROACTIVE=false PI_USAGE_CODEX_RESPONSE_REFRESH=false pi
```

Opening `/overview` or pressing `r` still triggers an explicit quota check. Existing `PI_USAGE_*` environment variables and `~/.pi/agent/pi-usage.json` widget settings are retained. The compact footer is the default; the larger persistent quota widget is optional. History cache/export settings retain upstream names; see [history/README.md](history/README.md).

## Development

```sh
npm ci --ignore-scripts
npm run check
npm test
npm run pack:dry-run
```

Typechecking targets Pi 0.99.1. Tests cover the inherited provider behavior and the new registration, cache arithmetic, real JSONL parsing, warm cache, viewport bounds, and panel cleanup. Provider integration tests mock credentials/network, with loopback HTTP servers for redirect handling. Live account endpoints are not covered by those tests.
