import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type PluginEntityRecord,
  type PluginJobContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import {
  ACTION_KEYS,
  DATA_KEYS,
  DEFAULT_CONFIG,
  ENTITY_TYPES,
  JOB_KEYS,
  PLUGIN_ID,
  TOOL_NAMES,
} from "./constants.js";

type PluginConfig = {
  crawl4aiBaseUrl?: string;
  crawlEndpointPath?: string;
  taskEndpointPrefix?: string;
  healthPath?: string;
  requestTimeoutMs?: number;
  taskPollIntervalMs?: number;
  taskPollTimeoutMs?: number;
  apiTokenSecretRef?: string;
  knowledgeRootPath?: string;
  writeMarkdownFiles?: boolean;
};

type CrawlSourceData = {
  url: string;
  title?: string | null;
  tags?: string[];
  notes?: string | null;
  refreshIntervalHours?: number | null;
  lastCrawledAt?: string | null;
  lastSnapshotId?: string | null;
  lastOutputPath?: string | null;
};

type CrawlSnapshotData = {
  sourceId: string;
  url: string;
  title?: string | null;
  markdownPath?: string | null;
  metadataPath?: string | null;
  excerpt: string;
  capturedAt: string;
  contentHash: string;
};

type CrawlResultPayload = {
  sourceId: string;
  snapshotId: string;
  url: string;
  markdown: string;
  markdownPath: string | null;
  metadataPath: string | null;
  excerpt: string;
  capturedAt: string;
};

function mergeConfig(config: Record<string, unknown>): Required<PluginConfig> {
  const next = { ...DEFAULT_CONFIG, ...(config as PluginConfig) };
  return {
    crawl4aiBaseUrl: String(next.crawl4aiBaseUrl),
    crawlEndpointPath: String(next.crawlEndpointPath),
    taskEndpointPrefix: String(next.taskEndpointPrefix),
    healthPath: String(next.healthPath),
    requestTimeoutMs: Number(next.requestTimeoutMs),
    taskPollIntervalMs: Number(next.taskPollIntervalMs),
    taskPollTimeoutMs: Number(next.taskPollTimeoutMs),
    apiTokenSecretRef: String(next.apiTokenSecretRef ?? ""),
    knowledgeRootPath: String(next.knowledgeRootPath),
    writeMarkdownFiles: Boolean(next.writeMarkdownFiles),
  };
}

async function getConfig(ctx: PluginContext): Promise<Required<PluginConfig>> {
  return mergeConfig(await ctx.config.get());
}

function ensureCompanyId(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("companyId is required");
  }
  return value;
}

function ensureUrl(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("url is required");
  }
  return value.trim();
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
}

function asPositiveNumber(value: unknown): number | null {
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "source";
}

function snapshotExcerpt(markdown: string): string {
  return markdown.replace(/\s+/g, " ").trim().slice(0, 280);
}

function jsonHeaders(token: string | null): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function resolveApiToken(ctx: PluginContext, config: Required<PluginConfig>): Promise<string | null> {
  if (!config.apiTokenSecretRef) return null;
  return await ctx.secrets.resolve(config.apiTokenSecretRef);
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHealth(ctx: PluginContext): Promise<{ ok: boolean; message: string }> {
  const config = await getConfig(ctx);
  try {
    const url = new URL(config.healthPath, config.crawl4aiBaseUrl).toString();
    await fetchJson(url, { method: "GET" }, Math.min(config.requestTimeoutMs, 5000));
    return { ok: true, message: "reachable" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}

async function listSourceRecords(ctx: PluginContext, companyId: string): Promise<PluginEntityRecord[]> {
  return await ctx.entities.list({
    entityType: ENTITY_TYPES.source,
    scopeKind: "company",
    scopeId: companyId,
    limit: 500,
    offset: 0,
  });
}

async function listSnapshotRecords(ctx: PluginContext, companyId: string): Promise<PluginEntityRecord[]> {
  return await ctx.entities.list({
    entityType: ENTITY_TYPES.snapshot,
    scopeKind: "company",
    scopeId: companyId,
    limit: 500,
    offset: 0,
  });
}

async function upsertSource(
  ctx: PluginContext,
  companyId: string,
  input: {
    url: string;
    title?: string | null;
    tags?: string[];
    notes?: string | null;
    refreshIntervalHours?: number | null;
  },
): Promise<PluginEntityRecord> {
  const existing = (await listSourceRecords(ctx, companyId)).find((record) => record.externalId === input.url) ?? null;
  const previous = (existing?.data ?? {}) as CrawlSourceData;
  const data: CrawlSourceData = {
    url: input.url,
    title: input.title ?? previous.title ?? null,
    tags: input.tags && input.tags.length > 0 ? input.tags : previous.tags ?? [],
    notes: input.notes ?? previous.notes ?? null,
    refreshIntervalHours: input.refreshIntervalHours ?? previous.refreshIntervalHours ?? null,
    lastCrawledAt: previous.lastCrawledAt ?? null,
    lastSnapshotId: previous.lastSnapshotId ?? null,
    lastOutputPath: previous.lastOutputPath ?? null,
  };

  const record = await ctx.entities.upsert({
    entityType: ENTITY_TYPES.source,
    scopeKind: "company",
    scopeId: companyId,
    externalId: input.url,
    title: data.title ?? input.url,
    status: "active",
    data: data as Record<string, unknown>,
  });

  await ctx.activity.log({
    companyId,
    message: `Registered Crawl4AI source: ${input.url}`,
    entityType: "plugin_entity",
    entityId: record.id,
    metadata: { pluginId: PLUGIN_ID, url: input.url },
  });

  return record;
}

async function pollTaskResult(
  ctx: PluginContext,
  config: Required<PluginConfig>,
  taskId: string,
  token: string | null,
): Promise<unknown> {
  const startedAt = Date.now();
  const taskUrl = new URL(`${config.taskEndpointPrefix}${encodeURIComponent(taskId)}`, config.crawl4aiBaseUrl).toString();

  while (Date.now() - startedAt < config.taskPollTimeoutMs) {
    const payload = await fetchJson(
      taskUrl,
      { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : undefined },
      config.requestTimeoutMs,
    );

    if (payload && typeof payload === "object") {
      const map = payload as Record<string, unknown>;
      if (Array.isArray(map.results) && map.results.length > 0) {
        return map;
      }
      const status = typeof map.status === "string" ? map.status.toLowerCase() : "";
      if (status === "completed" || status === "done" || status === "success") {
        return map;
      }
      if (status === "failed" || status === "error") {
        throw new Error(`Crawl4AI task ${taskId} failed`);
      }
    }

    await new Promise((resolve) => setTimeout(resolve, config.taskPollIntervalMs));
  }

  throw new Error(`Timed out while waiting for Crawl4AI task ${taskId}`);
}

function extractMarkdown(result: unknown): string {
  if (!result || typeof result !== "object") {
    throw new Error("Crawl4AI returned no crawl payload");
  }

  const map = result as Record<string, unknown>;
  const results = Array.isArray(map.results) ? map.results : null;
  const first = results && results.length > 0 && typeof results[0] === "object"
    ? results[0] as Record<string, unknown>
    : map;

  const markdownValue = first.markdown;
  if (typeof markdownValue === "string" && markdownValue.trim().length > 0) {
    return markdownValue;
  }
  if (markdownValue && typeof markdownValue === "object") {
    const md = markdownValue as Record<string, unknown>;
    const candidates = [
      md.fit_markdown,
      md.markdown_with_citations,
      md.raw_markdown,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        return candidate;
      }
    }
  }
  throw new Error("Crawl4AI result does not contain markdown output");
}

async function crawlUrl(
  ctx: PluginContext,
  companyId: string,
  input: {
    sourceId?: string | null;
    url?: string | null;
    title?: string | null;
    tags?: string[];
    notes?: string | null;
  },
): Promise<CrawlResultPayload> {
  const config = await getConfig(ctx);
  const token = await resolveApiToken(ctx, config);

  let source: PluginEntityRecord | null = null;
  if (input.sourceId) {
    source = (await listSourceRecords(ctx, companyId)).find((record) => record.id === input.sourceId) ?? null;
  }

  if (!source) {
    const url = ensureUrl(input.url);
    source = await upsertSource(ctx, companyId, {
      url,
      title: input.title ?? null,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      refreshIntervalHours: null,
    });
  }

  const sourceData = (source.data ?? {}) as CrawlSourceData;
  const url = sourceData.url;
  const crawlEndpoint = new URL(config.crawlEndpointPath, config.crawl4aiBaseUrl).toString();
  const crawlPayload = {
    urls: [url],
    priority: 10,
  };

  const crawlResponse = await fetchJson(
    crawlEndpoint,
    {
      method: "POST",
      headers: jsonHeaders(token),
      body: JSON.stringify(crawlPayload),
    },
    config.requestTimeoutMs,
  );

  let finalPayload = crawlResponse;
  if (
    crawlResponse &&
    typeof crawlResponse === "object" &&
    !Array.isArray(crawlResponse) &&
    "task_id" in (crawlResponse as Record<string, unknown>) &&
    !("results" in (crawlResponse as Record<string, unknown>))
  ) {
    finalPayload = await pollTaskResult(
      ctx,
      config,
      String((crawlResponse as Record<string, unknown>).task_id),
      token,
    );
  }

  const markdown = extractMarkdown(finalPayload);
  const capturedAt = new Date().toISOString();
  const contentHash = createHash("sha256").update(markdown).digest("hex");
  const sourceSlug = slugify(sourceData.title || sourceData.url);
  const snapshotSlug = capturedAt.replace(/[:.]/g, "-");

  let markdownPath: string | null = null;
  let metadataPath: string | null = null;

  if (config.writeMarkdownFiles) {
    const targetDir = path.join(config.knowledgeRootPath, companyId, sourceSlug);
    await fs.mkdir(targetDir, { recursive: true });
    markdownPath = path.join(targetDir, `${snapshotSlug}.md`);
    metadataPath = path.join(targetDir, `${snapshotSlug}.json`);
    await fs.writeFile(markdownPath, markdown, "utf8");
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        sourceId: source.id,
        url: sourceData.url,
        title: sourceData.title ?? null,
        tags: sourceData.tags ?? [],
        capturedAt,
        contentHash,
      }, null, 2),
      "utf8",
    );
    await fs.writeFile(path.join(targetDir, "latest.md"), markdown, "utf8");
  }

  const snapshotId = randomUUID();
  await ctx.entities.upsert({
    entityType: ENTITY_TYPES.snapshot,
    scopeKind: "company",
    scopeId: companyId,
    externalId: `${source.id}:${capturedAt}`,
    title: sourceData.title ?? sourceData.url,
    status: "ready",
    data: {
      sourceId: source.id,
      url: sourceData.url,
      title: sourceData.title ?? null,
      markdownPath,
      metadataPath,
      excerpt: snapshotExcerpt(markdown),
      capturedAt,
      contentHash,
    } satisfies CrawlSnapshotData as Record<string, unknown>,
  });

  await ctx.entities.upsert({
    entityType: ENTITY_TYPES.source,
    scopeKind: "company",
    scopeId: companyId,
    externalId: sourceData.url,
    title: sourceData.title ?? sourceData.url,
    status: "active",
    data: {
      ...sourceData,
      lastCrawledAt: capturedAt,
      lastSnapshotId: snapshotId,
      lastOutputPath: markdownPath,
    } satisfies CrawlSourceData as Record<string, unknown>,
  });

  await ctx.state.set({ scopeKind: "company", scopeId: companyId, stateKey: "last-crawl" }, {
    url: sourceData.url,
    capturedAt,
    markdownPath,
  });

  await ctx.activity.log({
    companyId,
    message: `Crawled knowledge source ${sourceData.url}`,
    entityType: "plugin_entity",
    entityId: source.id,
    metadata: { pluginId: PLUGIN_ID, markdownPath, capturedAt },
  });

  return {
    sourceId: source.id,
    snapshotId,
    url: sourceData.url,
    markdown,
    markdownPath,
    metadataPath,
    excerpt: snapshotExcerpt(markdown),
    capturedAt,
  };
}

async function searchKnowledge(
  ctx: PluginContext,
  companyId: string,
  query: string,
  limit: number,
): Promise<Array<{ path: string; excerpt: string; sourceTitle: string }>> {
  const config = await getConfig(ctx);
  const root = path.join(config.knowledgeRootPath, companyId);

  const results: Array<{ path: string; excerpt: string; sourceTitle: string }> = [];

  async function walk(dir: string): Promise<void> {
    if (results.length >= limit) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (results.length >= limit) return;
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }
      if (!entry.name.endsWith(".md") || entry.name === "latest.md") continue;
      const content = await fs.readFile(entryPath, "utf8");
      const lower = content.toLowerCase();
      const needle = query.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;
      const snippetStart = Math.max(0, idx - 120);
      const snippetEnd = Math.min(content.length, idx + needle.length + 220);
      results.push({
        path: entryPath,
        excerpt: content.slice(snippetStart, snippetEnd).replace(/\s+/g, " ").trim(),
        sourceTitle: path.basename(path.dirname(entryPath)),
      });
    }
  }

  try {
    await walk(root);
  } catch {
    return [];
  }

  await ctx.activity.log({
    companyId,
    message: `Searched Crawl4AI knowledge for "${query}"`,
    metadata: { pluginId: PLUGIN_ID, resultCount: results.length },
  });

  return results;
}

async function registerDataHandlers(ctx: PluginContext): Promise<void> {
  ctx.data.register(DATA_KEYS.overview, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    const sources = await listSourceRecords(ctx, companyId);
    const snapshots = await listSnapshotRecords(ctx, companyId);
    const lastCrawl = await ctx.state.get({ scopeKind: "company", scopeId: companyId, stateKey: "last-crawl" });
    const health = await fetchHealth(ctx);
    return {
      health,
      sourceCount: sources.length,
      snapshotCount: snapshots.length,
      lastCrawl,
      recentSnapshots: snapshots
        .slice()
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        .slice(0, 5),
    };
  });

  ctx.data.register(DATA_KEYS.sources, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    return await listSourceRecords(ctx, companyId);
  });

  ctx.data.register(DATA_KEYS.snapshots, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    return await listSnapshotRecords(ctx, companyId);
  });
}

async function registerActionHandlers(ctx: PluginContext): Promise<void> {
  ctx.actions.register(ACTION_KEYS.upsertSource, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    const url = ensureUrl(params.url);
    return await upsertSource(ctx, companyId, {
      url,
      title: asString(params.title),
      tags: asStringArray(params.tags),
      notes: asString(params.notes),
      refreshIntervalHours: asPositiveNumber(params.refreshIntervalHours),
    });
  });

  ctx.actions.register(ACTION_KEYS.crawlSource, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    return await crawlUrl(ctx, companyId, {
      sourceId: asString(params.sourceId),
      url: asString(params.url),
      title: asString(params.title),
      tags: asStringArray(params.tags),
      notes: asString(params.notes),
    });
  });

  ctx.actions.register(ACTION_KEYS.searchKnowledge, async (params) => {
    const companyId = ensureCompanyId(params.companyId);
    const query = ensureUrl(params.query);
    const limit = asPositiveNumber(params.limit) ?? 10;
    return await searchKnowledge(ctx, companyId, query, limit);
  });
}

async function registerToolHandlers(ctx: PluginContext): Promise<void> {
  ctx.tools.register(
    TOOL_NAMES.registerSource,
    {
      displayName: "Register crawl source",
      description: "Registers a URL as a persistent Crawl4AI source.",
      parametersSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
          refreshIntervalHours: { type: "number" },
        },
        required: ["url"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const input = params as Record<string, unknown>;
      const record = await upsertSource(ctx, runCtx.companyId, {
        url: ensureUrl(input.url),
        title: asString(input.title),
        tags: asStringArray(input.tags),
        notes: asString(input.notes),
        refreshIntervalHours: asPositiveNumber(input.refreshIntervalHours),
      });
      return {
        content: `Registered Crawl4AI source ${record.externalId}`,
        data: record,
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.crawlUrl,
    {
      displayName: "Crawl URL to knowledge base",
      description: "Runs Crawl4AI for a URL and stores the markdown in the local knowledge base.",
      parametersSchema: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          url: { type: "string" },
          title: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          notes: { type: "string" },
        },
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const input = params as Record<string, unknown>;
      const result = await crawlUrl(ctx, runCtx.companyId, {
        sourceId: asString(input.sourceId),
        url: asString(input.url),
        title: asString(input.title),
        tags: asStringArray(input.tags),
        notes: asString(input.notes),
      });
      return {
        content: `Crawled ${result.url} into knowledge base at ${result.markdownPath ?? "memory only"}`,
        data: {
          url: result.url,
          markdownPath: result.markdownPath,
          excerpt: result.excerpt,
          capturedAt: result.capturedAt,
        },
      };
    },
  );

  ctx.tools.register(
    TOOL_NAMES.searchKnowledge,
    {
      displayName: "Search Crawl4AI knowledge",
      description: "Searches local Crawl4AI markdown snapshots for a text query.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    async (params, runCtx): Promise<ToolResult> => {
      const input = params as Record<string, unknown>;
      const query = ensureUrl(input.query);
      const limit = asPositiveNumber(input.limit) ?? 10;
      const results = await searchKnowledge(ctx, runCtx.companyId, query, limit);
      return {
        content: results.length === 0
          ? `No Crawl4AI knowledge matches found for "${query}".`
          : `Found ${results.length} Crawl4AI knowledge matches for "${query}".`,
        data: results,
      };
    },
  );
}

async function registerJobs(ctx: PluginContext): Promise<void> {
  ctx.jobs.register(JOB_KEYS.refreshSources, async (_job: PluginJobContext) => {
    const companies = await ctx.companies.list({ limit: 200, offset: 0 });
    for (const company of companies) {
      const companyId = company.id;
      const sources = await listSourceRecords(ctx, companyId);
      for (const source of sources) {
        const data = (source.data ?? {}) as CrawlSourceData;
        const interval = data.refreshIntervalHours ?? null;
        if (!interval || !data.lastCrawledAt) continue;
        const last = Date.parse(data.lastCrawledAt);
        if (!Number.isFinite(last)) continue;
        const dueAt = last + interval * 60 * 60 * 1000;
        if (Date.now() < dueAt) continue;
        await crawlUrl(ctx, companyId, { sourceId: source.id });
      }
    }
  });
}

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    await registerDataHandlers(ctx);
    await registerActionHandlers(ctx);
    await registerToolHandlers(ctx);
    await registerJobs(ctx);
    ctx.logger.info("crawl4ai knowledge plugin ready");
  },

  async onHealth() {
    return { status: "ok", message: "Crawl4AI knowledge plugin ready" };
  },

  async onValidateConfig(config) {
    const next = mergeConfig(config);
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      new URL(next.crawl4aiBaseUrl);
    } catch {
      errors.push("crawl4aiBaseUrl must be a valid URL");
    }

    if (!path.isAbsolute(next.knowledgeRootPath)) {
      errors.push("knowledgeRootPath must be an absolute path");
    }

    if (next.requestTimeoutMs < 1000) {
      warnings.push("requestTimeoutMs is very low and may cause false crawl failures");
    }

    return {
      ok: errors.length === 0,
      warnings,
      errors,
    };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
