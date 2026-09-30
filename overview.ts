import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { CancellableLoader } from "@earendil-works/pi-tui";
import quotaExtension from "./index.ts";
import historyExtension from "./history/index.ts";
import { collectUsageData } from "./history/data.ts";
import type { UsageData } from "./history/data.ts";
import { OverviewPanel } from "./overview-panel.ts";

export default function (pi: ExtensionAPI): void {
 const quota = quotaExtension(pi, { commandName: "quota", silent: true });
 historyExtension(pi);

 const handler = async (_args: string, ctx: ExtensionCommandContext): Promise<void> => {
  if (!ctx.hasUI) { ctx.ui.notify("Pi Overview requires an interactive terminal.", "info"); return; }
  const data = await ctx.ui.custom<UsageData | null>((tui, theme, _kb, done) => {
   const loader = new CancellableLoader(tui, s => theme.fg("accent", s), s => theme.fg("muted", s), "Loading usage history…");
   let finished = false;
   const finish = (value: UsageData | null): void => {
    if (finished) return;
    finished = true;
    loader.dispose();
    done(value);
   };
   loader.onAbort = () => finish(null);
   collectUsageData({ signal: loader.signal, onProgress: p => {
    if (!finished) loader.setMessage(`Loading history: ${p.filesParsed}/${p.filesToParse} changed files`);
   } }).then(finish).catch(error => {
    if (!finished) ctx.ui.notify(`History load failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    finish(null);
   });
   return loader;
  });
  if (!data) return;
  const controller = new AbortController();
  // The panel opens immediately. Quota checks run independently of the history scan.
  void quota.refresh(ctx).catch(error => ctx.ui.notify(`Quota check failed: ${String(error)}`, "warning"));
  try {
   await ctx.ui.custom<void>((tui, theme, _kb, done) => {
    const panel = new OverviewPanel({
     theme, data,
     snapshot: quota.snapshot,
     loading: quota.isRefreshing,
     rows: () => tui.terminal.rows,
     requestRender: () => tui.requestRender(),
     done: () => done(),
     subscribe: quota.subscribe,
     refresh: async () => {
      const [updated] = await Promise.all([
       collectUsageData({ signal: controller.signal }),
       quota.refresh(ctx),
      ]);
      return updated;
     },
    });
    return panel;
   });
  } finally { controller.abort(); }
 };

 pi.registerCommand("overview", { description: "Combined usage history, cache statistics, and account quotas", handler });
 pi.registerCommand("usage", { description: "Open Pi Overview", handler });
}
