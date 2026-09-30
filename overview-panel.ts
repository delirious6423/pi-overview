import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { UsageComponent } from "./history/index.ts";
import type { UsageData, TokenStats } from "./history/data.ts";
import type { UsageSnapshot } from "./src/types.ts";
import { buildUsageWidget } from "./src/render.ts";

export function cacheSummary(tokens: TokenStats): string {
 const prompt = tokens.input + tokens.cacheRead + tokens.cacheWrite;
 const hit = prompt > 0 ? `${(100 * tokens.cacheRead / prompt).toFixed(1)}%` : "n/a";
 return `Cache read ${tokens.cacheRead.toLocaleString()} · write ${tokens.cacheWrite.toLocaleString()} · read share of prompt ${hit}`;
}

export interface PanelOptions {
 theme: Theme;
 data: UsageData;
 snapshot: () => UsageSnapshot;
 loading: () => boolean;
 rows: () => number;
 requestRender: () => void;
 done: () => void;
 refresh: () => Promise<UsageData | null>;
 subscribe: (listener: () => void) => () => void;
}

/** Compose the two upstream views with one bounded, scrollable terminal viewport. */
export class OverviewPanel {
 private history: UsageComponent;
 private offset = 0;
 private refreshing = false;
 private disposed = false;
 private error = "";
 private unsubscribe: () => void;
 private tick: ReturnType<typeof setInterval>;
 private loadedAt = new Date();
 

 constructor(private options: PanelOptions) {
  this.history = new UsageComponent(options.theme, options.data, options.requestRender, options.done);
  this.unsubscribe = options.subscribe(() => {
   options.requestRender();
  });
  this.tick = setInterval(() => options.requestRender(), 60_000);
  this.tick.unref();
 }

 render(width: number): string[] {
  width = Math.max(1, width);
  const { theme, snapshot, loading } = this.options;
  const totals = this.options.data[this.history.period].totals;
  const current = snapshot();
  const quotas = buildUsageWidget(current, theme, loading());
  if (!current.codex && !current.anthropic && !current.copilot && !current.go && !current.openrouter && current.subscriptions.length === 0) {
   quotas.push(theme.fg("dim", loading() ? "Checking configured accounts…" : "No account quota data. Sign in with /login or configure a supported provider."));
  }
  const content = [
   ...this.history.render(width),
   "",
   theme.bold("CACHE"),
   ...this.wrap(cacheSummary(totals.tokens), width),
   theme.fg("dim", "Read share = cacheRead / (input + cacheRead + cacheWrite)."),
   "",
   theme.bold("ACCOUNT QUOTAS / OPENROUTER ACCOUNTING"),
   theme.fg("dim", "Account windows are independent of the selected history period."),
   ...quotas,
   theme.fg("dim", `History loaded ${this.loadedAt.toLocaleTimeString()} · quotas ${loading() ? "checking…" : "cached; refresh with r"}`),
   theme.fg("dim", "Recorded token costs are model-price estimates, separate from subscription fees."),
   ...(this.error ? [theme.fg("error", this.error)] : []),
  ];
  const height = Math.max(1, this.options.rows() - 7);
  this.offset = Math.min(this.offset, Math.max(0, content.length - height));
  const shown = content.slice(this.offset, this.offset + height);
  const footer = `[PgUp/PgDn] scroll ${this.offset + 1}–${this.offset + shown.length}/${content.length}  [r] refresh${this.refreshing ? " (loading)" : ""}  [k] quotas  [h] history  [q] close`;
  return [theme.bold("PI OVERVIEW · Usage / Cache / Quotas"), "", ...shown, "", footer].map(line => truncateToWidth(line, width));
 }

 private wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
   if (line && line.length + word.length + 1 > width) { lines.push(line); line = ""; }
   line += `${line ? " " : ""}${word}`;
  }
  if (line) lines.push(line);
  return lines;
 }

 handleInput(input: string): void {
  if (matchesKey(input, "pageDown")) this.offset += Math.max(1, this.options.rows() - 10);
  else if (matchesKey(input, "pageUp")) this.offset = Math.max(0, this.offset - Math.max(1, this.options.rows() - 10));
  else if (input === "k") this.offset = this.history.render(100).length + 2;
  else if (input === "h") this.offset = 0;
  else if (input === "r") { void this.refresh(); return; }
  else { this.history.handleInput(input); this.offset = 0; }
  this.options.requestRender();
 }

 private async refresh(): Promise<void> {
  if (this.refreshing) return;
  this.refreshing = true;
  this.error = "";
  this.options.requestRender();
  try {
   const data = await this.options.refresh();
   if (this.disposed) return;
   if (data) {
    this.options.data = data;
    this.history.setData(data);
    this.loadedAt = new Date();
   }
  } catch (error) {
   if (!this.disposed) this.error = `Refresh failed: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
   this.refreshing = false;
   if (!this.disposed) this.options.requestRender();
  }
 }

 invalidate(): void { this.history.invalidate(); }
 dispose(): void {
  this.disposed = true;
  clearInterval(this.tick);
  this.unsubscribe();
  this.history.dispose();
 }
}
