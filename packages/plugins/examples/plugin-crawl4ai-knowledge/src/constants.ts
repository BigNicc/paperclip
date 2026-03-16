export const PLUGIN_ID = "paperclip-crawl4ai-knowledge";
export const PLUGIN_VERSION = "0.1.0";
export const PAGE_ROUTE = "crawl4ai";

export const SLOT_IDS = {
  page: "crawl4ai-page",
  dashboardWidget: "crawl4ai-dashboard-widget",
  sidebar: "crawl4ai-sidebar-link",
} as const;

export const EXPORT_NAMES = {
  page: "Crawl4aiKnowledgePage",
  dashboardWidget: "Crawl4aiKnowledgeDashboardWidget",
  sidebar: "Crawl4aiKnowledgeSidebarLink",
} as const;

export const ENTITY_TYPES = {
  source: "crawl_source",
  snapshot: "crawl_snapshot",
} as const;

export const ACTION_KEYS = {
  upsertSource: "upsert-source",
  crawlSource: "crawl-source",
  searchKnowledge: "search-knowledge",
} as const;

export const DATA_KEYS = {
  overview: "overview",
  sources: "sources",
  snapshots: "snapshots",
} as const;

export const TOOL_NAMES = {
  registerSource: "register-source",
  crawlUrl: "crawl-url",
  searchKnowledge: "search-knowledge",
} as const;

export const JOB_KEYS = {
  refreshSources: "refresh-sources",
} as const;

export const DEFAULT_CONFIG = {
  crawl4aiBaseUrl: "http://127.0.0.1:11235",
  crawlEndpointPath: "/crawl",
  taskEndpointPrefix: "/task/",
  healthPath: "/health",
  requestTimeoutMs: 30000,
  taskPollIntervalMs: 2500,
  taskPollTimeoutMs: 120000,
  knowledgeRootPath:
    "/Users/huvema/Library/Mobile Documents/com~apple~CloudDocs/MIGA/Github MIGA/MIGA Consulting AI Company/knowledge/crawl4ai",
  writeMarkdownFiles: true,
} as const;
