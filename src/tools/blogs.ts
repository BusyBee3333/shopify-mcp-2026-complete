// Blogs & Articles tools — Shopify Admin API 2024-01
// Covers: list_blogs, list_articles, create_article, get_article

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyBlog {
  id: number;
  title?: string;
  handle?: string;
  commentable?: string;
  feedburner?: string | null;
  feedburner_location?: string | null;
  tags?: string;
  template_suffix?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyArticle {
  id: number;
  title?: string;
  blog_id?: number;
  author?: string;
  body_html?: string;
  summary_html?: string | null;
  handle?: string;
  tags?: string;
  published?: boolean;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
  image?: { src?: string; alt?: string | null } | null;
}

// === Zod Schemas ===
const ListBlogsSchema = z.object({
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  handle: z.string().optional().describe("Filter by blog handle"),
});

const ListArticlesSchema = z.object({
  blog_id: z.string().describe("Blog ID to list articles from"),
  limit: z.number().min(1).max(250).optional().default(50).describe("Number of results (1-250, default 50)"),
  page_info: z.string().optional().describe("Cursor for next page"),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any").describe("Filter by publish status"),
  author: z.string().optional().describe("Filter by author name"),
  tag: z.string().optional().describe("Filter by tag"),
  created_at_min: z.string().optional().describe("Filter created after ISO 8601 date"),
  created_at_max: z.string().optional().describe("Filter created before ISO 8601 date"),
});

const GetArticleSchema = z.object({
  blog_id: z.string().describe("Blog ID"),
  article_id: z.string().describe("Article ID"),
});

const CreateArticleSchema = z.object({
  blog_id: z.string().describe("Blog ID to publish article in"),
  title: z.string().describe("Article title"),
  body_html: z.string().describe("Article body (HTML supported)"),
  author: z.string().optional().describe("Author name"),
  tags: z.string().optional().describe("Comma-separated tags"),
  summary_html: z.string().optional().describe("Article summary/excerpt (HTML)"),
  published: z.boolean().optional().default(false).describe("Publish immediately (default: false = draft)"),
  image: z.object({
    src: z.string().url().describe("Image URL"),
    alt: z.string().optional().describe("Alt text"),
  }).optional().describe("Featured image"),
  metafields: z.array(z.object({
    key: z.string(),
    value: z.string(),
    type: z.string(),
    namespace: z.string(),
  })).optional().describe("Metafields to attach"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_blogs",
      title: "List Blogs",
      description:
        "List all blogs on the Shopify store. Each blog contains articles. Returns blog title, handle, comment settings, and tags. Use to find blog IDs before listing or creating articles.",
      inputSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          handle: { type: "string", description: "Filter by blog handle" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" }, nextPageInfo: { type: "string" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "list_articles",
      title: "List Articles",
      description:
        "List articles within a specific Shopify blog. Supports filtering by publish status, author, tag, and date range. Returns title, author, body, tags, and publish status. Supports cursor-based pagination.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string", description: "Blog ID (use list_blogs to find)" },
          limit: { type: "number", description: "Number of results (1-250, default 50)" },
          page_info: { type: "string", description: "Cursor for next page" },
          published_status: { type: "string", enum: ["published", "unpublished", "any"], description: "Filter by publish status" },
          author: { type: "string", description: "Filter by author name" },
          tag: { type: "string", description: "Filter by tag" },
          created_at_min: { type: "string", description: "Filter created after ISO 8601 date" },
          created_at_max: { type: "string", description: "Filter created before ISO 8601 date" },
        },
        required: ["blog_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: {
            type: "object",
            properties: { count: { type: "number" }, hasMore: { type: "boolean" } },
          },
        },
        required: ["data", "meta"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "get_article",
      title: "Get Article",
      description:
        "Get full details for a specific Shopify blog article by blog ID and article ID. Returns full body HTML, author, tags, publish status, and featured image.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string", description: "Blog ID" },
          article_id: { type: "string", description: "Article ID" },
        },
        required: ["blog_id", "article_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          blog_id: { type: "number" },
          author: { type: "string" },
          body_html: { type: "string" },
          published: { type: "boolean" },
          tags: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "create_article",
      title: "Create Article",
      description:
        "Create a new article in a Shopify blog. Supports setting title, body HTML, author, tags, featured image, and publish status. Use published=false to save as draft. Returns the created article with assigned ID.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string", description: "Blog ID to publish in" },
          title: { type: "string", description: "Article title" },
          body_html: { type: "string", description: "Article body (HTML)" },
          author: { type: "string", description: "Author name" },
          tags: { type: "string", description: "Comma-separated tags" },
          summary_html: { type: "string", description: "Article excerpt (HTML)" },
          published: { type: "boolean", description: "Publish immediately (default: false)" },
          image: {
            type: "object",
            description: "Featured image",
            properties: {
              src: { type: "string" },
              alt: { type: "string" },
            },
          },
        },
        required: ["blog_id", "title", "body_html"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" },
          title: { type: "string" },
          blog_id: { type: "number" },
          published: { type: "boolean" },
          created_at: { type: "string" },
        },
        required: ["id", "title"],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_blogs: async (args) => {
      const params = ListBlogsSchema.parse(args);
      let result: { data: ShopifyBlog[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_blogs", () =>
          client.paginateFromCursor<ShopifyBlog>("/blogs.json", params.page_info!, params.limit)
        , { tool: "list_blogs" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.handle) extraParams.handle = params.handle;

        result = await logger.time("tool.list_blogs", () =>
          client.paginatedGet<ShopifyBlog>("/blogs.json", extraParams, params.limit)
        , { tool: "list_blogs" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    list_articles: async (args) => {
      const params = ListArticlesSchema.parse(args);
      let result: { data: ShopifyArticle[]; nextPageInfo?: string };

      if (params.page_info) {
        result = await logger.time("tool.list_articles", () =>
          client.paginateFromCursor<ShopifyArticle>(
            `/blogs/${params.blog_id}/articles.json`,
            params.page_info!,
            params.limit
          )
        , { tool: "list_articles" });
      } else {
        const extraParams: Record<string, string> = {};
        if (params.published_status) extraParams.published_status = params.published_status;
        if (params.author) extraParams.author = params.author;
        if (params.tag) extraParams.tag = params.tag;
        if (params.created_at_min) extraParams.created_at_min = params.created_at_min;
        if (params.created_at_max) extraParams.created_at_max = params.created_at_max;

        result = await logger.time("tool.list_articles", () =>
          client.paginatedGet<ShopifyArticle>(
            `/blogs/${params.blog_id}/articles.json`,
            extraParams,
            params.limit
          )
        , { tool: "list_articles" });
      }

      const response = {
        data: result.data,
        meta: {
          count: result.data.length,
          hasMore: !!result.nextPageInfo,
          ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}),
        },
      };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_article: async (args) => {
      const { blog_id, article_id } = GetArticleSchema.parse(args);
      const data = await logger.time("tool.get_article", () =>
        client.get<{ article: ShopifyArticle }>(`/blogs/${blog_id}/articles/${article_id}.json`)
      , { tool: "get_article", blog_id, article_id });

      const article = (data as { article: ShopifyArticle }).article;

      return {
        content: [{ type: "text", text: JSON.stringify(article, null, 2) }],
        structuredContent: article,
      };
    },

    create_article: async (args) => {
      const { blog_id, ...articleData } = CreateArticleSchema.parse(args);
      const data = await logger.time("tool.create_article", () =>
        client.post<{ article: ShopifyArticle }>(
          `/blogs/${blog_id}/articles.json`,
          { article: articleData }
        )
      , { tool: "create_article", blog_id });

      const article = (data as { article: ShopifyArticle }).article;

      return {
        content: [{ type: "text", text: JSON.stringify(article, null, 2) }],
        structuredContent: article,
      };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return {
    tools: getToolDefinitions(),
    handlers: getToolHandlers(client),
  };
}
