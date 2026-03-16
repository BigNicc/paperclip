import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("crawl4ai knowledge plugin", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("registers sources and writes crawl snapshots", async () => {
    const harness = createTestHarness({
      manifest,
      config: {
        crawl4aiBaseUrl: "http://127.0.0.1:11235",
        knowledgeRootPath: "/tmp/crawl4ai-test",
        writeMarkdownFiles: false,
      },
    });

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/crawl")) {
        return new Response(JSON.stringify({
          results: [
            {
              markdown: {
                raw_markdown: "# Example\n\nKnowledge body",
              },
            },
          ],
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (String(url).endsWith("/health")) {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch: ${url} ${init?.method}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await plugin.definition.setup(harness.ctx);

    const source = await harness.performAction<{ id: string }>("upsert-source", {
      companyId: "company-1",
      url: "https://example.com",
      title: "Example",
      tags: ["docs"],
    });
    expect(source.id).toBeTruthy();

    const result = await harness.performAction<{ url: string; excerpt: string }>("crawl-source", {
      companyId: "company-1",
      sourceId: source.id,
    });
    expect(result.url).toBe("https://example.com");
    expect(result.excerpt).toContain("Knowledge body");

    const overview = await harness.getData<{
      sourceCount: number;
      snapshotCount: number;
      health: { ok: boolean };
    }>("overview", {
      companyId: "company-1",
    });
    expect(overview.sourceCount).toBe(1);
    expect(overview.snapshotCount).toBe(1);
    expect(overview.health.ok).toBe(true);
  });
});
