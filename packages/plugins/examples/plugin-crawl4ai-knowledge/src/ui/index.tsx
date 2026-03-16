import { useMemo, useState, type CSSProperties, type FormEvent } from "react";
import {
  useHostContext,
  usePluginAction,
  usePluginData,
  usePluginToast,
  type PluginPageProps,
  type PluginSidebarProps,
  type PluginWidgetProps,
} from "@paperclipai/plugin-sdk/ui";
import { ACTION_KEYS, DATA_KEYS, PAGE_ROUTE } from "../constants.js";

type EntityRecord = {
  id: string;
  title: string | null;
  externalId: string | null;
  updatedAt: string;
  data?: Record<string, unknown>;
};

type OverviewData = {
  health: { ok: boolean; message: string };
  sourceCount: number;
  snapshotCount: number;
  lastCrawl: { url?: string; capturedAt?: string; markdownPath?: string | null } | null;
  recentSnapshots: EntityRecord[];
};

type SearchResult = {
  path: string;
  excerpt: string;
  sourceTitle: string;
};

const cardStyle: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: "12px",
  padding: "16px",
  display: "grid",
  gap: "12px",
};

const buttonStyle: CSSProperties = {
  appearance: "none",
  border: "1px solid var(--border)",
  borderRadius: "999px",
  background: "transparent",
  color: "inherit",
  padding: "6px 12px",
  cursor: "pointer",
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  background: "var(--foreground)",
  color: "var(--background)",
  borderColor: "var(--foreground)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border)",
  borderRadius: "8px",
  padding: "8px 10px",
  background: "transparent",
  color: "inherit",
  fontSize: "12px",
};

function hostPath(companyPrefix: string | null | undefined, suffix: string): string {
  return companyPrefix ? `/${companyPrefix}${suffix}` : suffix;
}

function pluginPagePath(companyPrefix: string | null | undefined): string {
  return hostPath(companyPrefix, `/${PAGE_ROUTE}`);
}

function SummaryCard({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <section style={cardStyle}>
      <div style={{ fontSize: "12px", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>
      <strong style={{ fontSize: "24px" }}>{value}</strong>
      <div style={{ fontSize: "12px", opacity: 0.75 }}>{hint}</div>
    </section>
  );
}

export function Crawl4aiKnowledgeDashboardWidget({ context }: PluginWidgetProps) {
  const { data, loading, error } = usePluginData<OverviewData>(DATA_KEYS.overview, { companyId: context.companyId });

  if (loading) {
    return <section style={cardStyle}>Crawl4AI lädt …</section>;
  }

  if (error || !data) {
    return <section style={cardStyle}>Crawl4AI nicht verfügbar: {error?.message ?? "Unbekannter Fehler"}</section>;
  }

  return (
    <section style={cardStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
        <strong>Crawl4AI Knowledge</strong>
        <a href={pluginPagePath(context.companyPrefix)} style={{ fontSize: "12px" }}>Öffnen</a>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "10px" }}>
        <SummaryCard title="Sources" value={data.sourceCount} hint="Persistente Crawl-Quellen" />
        <SummaryCard title="Snapshots" value={data.snapshotCount} hint="Gespeicherte Wissensstände" />
        <SummaryCard title="Health" value={data.health.ok ? "OK" : "Down"} hint={data.health.message} />
      </div>
      {data.lastCrawl ? (
        <div style={{ fontSize: "12px", opacity: 0.78 }}>
          Letzter Crawl: {data.lastCrawl.url} · {data.lastCrawl.capturedAt}
        </div>
      ) : null}
    </section>
  );
}

export function Crawl4aiKnowledgeSidebarLink({ context }: PluginSidebarProps) {
  return (
    <a href={pluginPagePath(context.companyPrefix)} style={{ display: "block", fontSize: "13px" }}>
      Crawl4AI
    </a>
  );
}

export function Crawl4aiKnowledgePage({ context }: PluginPageProps) {
  const host = useHostContext();
  const toast = usePluginToast();
  const companyId = host.companyId ?? context.companyId;
  const { data: overview, loading, error, refresh } = usePluginData<OverviewData>(DATA_KEYS.overview, { companyId });
  const { data: sources, refresh: refreshSources } = usePluginData<EntityRecord[]>(DATA_KEYS.sources, { companyId });
  const { data: snapshots, refresh: refreshSnapshots } = usePluginData<EntityRecord[]>(DATA_KEYS.snapshots, { companyId });
  const upsertSource = usePluginAction(ACTION_KEYS.upsertSource);
  const crawlSource = usePluginAction(ACTION_KEYS.crawlSource);
  const searchKnowledge = usePluginAction(ACTION_KEYS.searchKnowledge);

  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [busySourceId, setBusySourceId] = useState<string | null>(null);

  const sourceItems = sources ?? [];
  const snapshotItems = useMemo(() => (snapshots ?? []).slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 10), [snapshots]);

  async function handleAddSource(event: FormEvent) {
    event.preventDefault();
    await upsertSource({
      companyId,
      url,
      title,
      tags: tags.split(",").map((entry) => entry.trim()).filter(Boolean),
    });
    setUrl("");
    setTitle("");
    setTags("");
    refresh();
    refreshSources();
    toast({ title: "Source gespeichert", body: "Die Crawl4AI-Quelle wurde registriert.", tone: "success" });
  }

  async function handleCrawl(sourceId: string) {
    setBusySourceId(sourceId);
    try {
      await crawlSource({ companyId, sourceId });
      refresh();
      refreshSources();
      refreshSnapshots();
      toast({ title: "Crawl abgeschlossen", body: "Der Snapshot wurde in die Wissensbasis geschrieben.", tone: "success" });
    } finally {
      setBusySourceId(null);
    }
  }

  async function handleSearch(event: FormEvent) {
    event.preventDefault();
    const result = await searchKnowledge({ companyId, query: searchQuery, limit: 10 });
    setSearchResults(result as SearchResult[]);
  }

  return (
    <main style={{ display: "grid", gap: "16px", padding: "16px" }}>
      <section style={cardStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <div>
            <h1 style={{ margin: 0 }}>Crawl4AI Knowledge Base</h1>
            <div style={{ fontSize: "13px", opacity: 0.75 }}>
              Persistente Website-Snapshots und durchsuchbare Markdown-Wissensbasis für {companyId}.
            </div>
          </div>
          <button type="button" style={buttonStyle} onClick={() => { refresh(); refreshSources(); refreshSnapshots(); }}>
            Refresh
          </button>
        </div>
        {loading ? <div>Lade Überblick …</div> : null}
        {error ? <div>Fehler: {error.message}</div> : null}
        {overview ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "12px" }}>
            <SummaryCard title="Sources" value={overview.sourceCount} hint="Registrierte Crawl-Quellen" />
            <SummaryCard title="Snapshots" value={overview.snapshotCount} hint="Persistierte Markdown-Stände" />
            <SummaryCard title="Health" value={overview.health.ok ? "OK" : "Down"} hint={overview.health.message} />
          </div>
        ) : null}
      </section>

      <section style={cardStyle}>
        <strong>Neue Quelle registrieren</strong>
        <form onSubmit={handleAddSource} style={{ display: "grid", gap: "10px" }}>
          <input style={inputStyle} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com" required />
          <input style={inputStyle} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Optionaler Titel" />
          <input style={inputStyle} value={tags} onChange={(event) => setTags(event.target.value)} placeholder="Tags, kommasepariert" />
          <div>
            <button type="submit" style={primaryButtonStyle}>Quelle speichern</button>
          </div>
        </form>
      </section>

      <section style={cardStyle}>
        <strong>Registrierte Quellen</strong>
        <div style={{ display: "grid", gap: "10px" }}>
          {sourceItems.length === 0 ? <div>Noch keine Quellen.</div> : null}
          {sourceItems.map((source) => {
            const data = source.data ?? {};
            const sourceUrl = typeof data.url === "string" ? data.url : source.externalId ?? "";
            const sourceTags = Array.isArray(data.tags) ? data.tags.join(", ") : "";
            return (
              <article key={source.id} style={{ ...cardStyle, padding: "12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                  <div>
                    <strong>{source.title ?? sourceUrl}</strong>
                    <div style={{ fontSize: "12px", opacity: 0.78 }}>{sourceUrl}</div>
                    {sourceTags ? <div style={{ fontSize: "12px", opacity: 0.72 }}>Tags: {sourceTags}</div> : null}
                    {typeof data.lastCrawledAt === "string" && data.lastCrawledAt ? (
                      <div style={{ fontSize: "12px", opacity: 0.72 }}>Letzter Crawl: {data.lastCrawledAt}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    style={buttonStyle}
                    disabled={busySourceId === source.id}
                    onClick={() => handleCrawl(source.id)}
                  >
                    {busySourceId === source.id ? "Crawlt …" : "Jetzt crawlen"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <strong>Knowledge durchsuchen</strong>
        <form onSubmit={handleSearch} style={{ display: "grid", gap: "10px" }}>
          <input style={inputStyle} value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Suchbegriff" required />
          <div>
            <button type="submit" style={buttonStyle}>Suche starten</button>
          </div>
        </form>
        <div style={{ display: "grid", gap: "10px" }}>
          {searchResults.map((result) => (
            <article key={result.path} style={{ ...cardStyle, padding: "12px" }}>
              <strong>{result.sourceTitle}</strong>
              <div style={{ fontSize: "12px", opacity: 0.72 }}>{result.path}</div>
              <div style={{ fontSize: "13px" }}>{result.excerpt}</div>
            </article>
          ))}
        </div>
      </section>

      <section style={cardStyle}>
        <strong>Letzte Snapshots</strong>
        <div style={{ display: "grid", gap: "10px" }}>
          {snapshotItems.length === 0 ? <div>Noch keine Snapshots.</div> : null}
          {snapshotItems.map((snapshot) => {
            const data = snapshot.data ?? {};
            return (
              <article key={snapshot.id} style={{ ...cardStyle, padding: "12px" }}>
                <strong>{snapshot.title ?? "Snapshot"}</strong>
                <div style={{ fontSize: "12px", opacity: 0.72 }}>{String(data.markdownPath ?? "")}</div>
                <div style={{ fontSize: "13px" }}>{String(data.excerpt ?? "")}</div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
