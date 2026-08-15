import { DISCOVERY_MODE, runDiscovery } from "./discovery.js";
import { runLiveDiscovery } from "./ledger.js";
import {
  PUBLIC_SOURCE_MANIFEST,
  SOURCE_MANIFEST_VERSION,
} from "./source-manifest.js";

function configuredMode(value) {
  if (value === DISCOVERY_MODE.LIVE) return DISCOVERY_MODE.LIVE;
  if (value === DISCOVERY_MODE.DRY_RUN) return DISCOVERY_MODE.DRY_RUN;
  return DISCOVERY_MODE.DISABLED;
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function logRun(report) {
  console.log(
    JSON.stringify({
      event: "rosen_source_discovery",
      mode: report.mode,
      manifestVersion: report.manifestVersion,
      runId: report.runId,
      startedAt: report.startedAt,
      finishedAt: report.finishedAt,
      sourceCount: report.sourceCount,
      sources: report.sources.map(({ sourceId, status, candidateCount = 0 }) => ({
        sourceId,
        status,
        candidateCount,
      })),
    }),
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({
        status: "ok",
        mode: configuredMode(env.DISCOVERY_MODE),
        manifestVersion: SOURCE_MANIFEST_VERSION,
        sources: PUBLIC_SOURCE_MANIFEST,
      });
    }
    return json({ error: "not_found" }, 404);
  },

  async scheduled(_controller, env) {
    try {
      const mode = configuredMode(env.DISCOVERY_MODE);
      const report = mode === DISCOVERY_MODE.LIVE
        ? await runLiveDiscovery({ database: env.DISCOVERY_LEDGER })
        : await runDiscovery({ mode });
      logRun(report);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "rosen_source_discovery_error",
          error: error instanceof Error ? error.name : "unknown_error",
          message:
            error instanceof Error && error.message !== ""
              ? error.message.slice(0, 256)
              : "unknown_error",
        }),
      );
    }
  },
};
