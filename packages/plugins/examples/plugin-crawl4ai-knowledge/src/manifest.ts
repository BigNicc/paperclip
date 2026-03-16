import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";
import {
  DEFAULT_CONFIG,
  EXPORT_NAMES,
  JOB_KEYS,
  PAGE_ROUTE,
  PLUGIN_ID,
  PLUGIN_VERSION,
  SLOT_IDS,
  TOOL_NAMES,
} from "./constants.js";

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Crawl4AI Knowledge",
  description: "Persistent website crawling and knowledge capture for Paperclip companies via Crawl4AI.",
  author: "Paperclip / MIGA",
  categories: ["ui", "automation", "connector", "workspace"],
  capabilities: [
    "companies.read",
    "activity.log.write",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "secrets.read-ref",
    "agent.tools.register",
    "jobs.schedule",
    "ui.page.register",
    "ui.dashboardWidget.register",
    "ui.sidebar.register",
    "instance.settings.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
    ui: "./dist/ui",
  },
  instanceConfigSchema: {
    type: "object",
    properties: {
      crawl4aiBaseUrl: {
        type: "string",
        title: "Crawl4AI Base URL",
        default: DEFAULT_CONFIG.crawl4aiBaseUrl,
      },
      crawlEndpointPath: {
        type: "string",
        title: "Crawl endpoint path",
        default: DEFAULT_CONFIG.crawlEndpointPath,
      },
      taskEndpointPrefix: {
        type: "string",
        title: "Task endpoint prefix",
        default: DEFAULT_CONFIG.taskEndpointPrefix,
      },
      healthPath: {
        type: "string",
        title: "Health endpoint path",
        default: DEFAULT_CONFIG.healthPath,
      },
      requestTimeoutMs: {
        type: "number",
        title: "Request timeout (ms)",
        default: DEFAULT_CONFIG.requestTimeoutMs,
      },
      taskPollIntervalMs: {
        type: "number",
        title: "Task poll interval (ms)",
        default: DEFAULT_CONFIG.taskPollIntervalMs,
      },
      taskPollTimeoutMs: {
        type: "number",
        title: "Task poll timeout (ms)",
        default: DEFAULT_CONFIG.taskPollTimeoutMs,
      },
      apiTokenSecretRef: {
        type: "string",
        title: "API token secret ref",
        default: "",
      },
      knowledgeRootPath: {
        type: "string",
        title: "Knowledge root path",
        default: DEFAULT_CONFIG.knowledgeRootPath,
      },
      writeMarkdownFiles: {
        type: "boolean",
        title: "Write markdown snapshots to disk",
        default: DEFAULT_CONFIG.writeMarkdownFiles,
      },
    },
  },
  jobs: [
    {
      jobKey: JOB_KEYS.refreshSources,
      displayName: "Refresh Crawl4AI sources",
      description: "Refreshes due knowledge sources on a fixed schedule.",
      schedule: "0 * * * *",
    },
  ],
  tools: [
    {
      name: TOOL_NAMES.registerSource,
      displayName: "Register crawl source",
      description: "Registers or updates a website as a persistent Crawl4AI knowledge source.",
      parametersSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          title: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          notes: { type: "string" },
          refreshIntervalHours: { type: "number" },
        },
        required: ["url"],
      },
    },
    {
      name: TOOL_NAMES.crawlUrl,
      displayName: "Crawl URL to knowledge base",
      description: "Crawls a source via Crawl4AI and persists the markdown snapshot into the company knowledge base.",
      parametersSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          sourceId: { type: "string" },
          title: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string" },
          },
          notes: { type: "string" },
        },
      },
    },
    {
      name: TOOL_NAMES.searchKnowledge,
      displayName: "Search Crawl4AI knowledge",
      description: "Searches previously crawled markdown snapshots in the local knowledge base.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
  ],
  ui: {
    slots: [
      {
        type: "page",
        id: SLOT_IDS.page,
        displayName: "Crawl4AI",
        exportName: EXPORT_NAMES.page,
        routePath: PAGE_ROUTE,
      },
      {
        type: "dashboardWidget",
        id: SLOT_IDS.dashboardWidget,
        displayName: "Crawl4AI Knowledge",
        exportName: EXPORT_NAMES.dashboardWidget,
      },
      {
        type: "sidebar",
        id: SLOT_IDS.sidebar,
        displayName: "Crawl4AI",
        exportName: EXPORT_NAMES.sidebar,
      },
    ],
  },
};

export default manifest;
