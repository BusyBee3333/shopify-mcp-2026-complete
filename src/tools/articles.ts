// Articles & Comments tools — Shopify Admin API 2024-01
// Covers: list_articles, get_article, create_article, update_article, delete_article,
//         list_comments, get_comment, create_comment, update_comment, spam_comment, approve_comment, delete_comment

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

interface ShopifyArticle {
  id: number;
  title: string;
  author?: string;
  tags?: string;
  body_html?: string;
  summary_html?: string | null;
  published?: boolean;
  published_at?: string | null;
  blog_id?: number;
  handle?: string;
  template_suffix?: string | null;
  image?: { src: string; alt?: string } | null;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyComment {
  id: number;
  article_id?: number;
  blog_id?: number;
  author?: string;
  email?: string;
  body?: string;
  body_html?: string;
  status?: string;
  ip?: string;
  published_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListArticlesSchema = z.object({
  blog_id: z.string().describe("Blog ID to list articles from"),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any"),
  author: z.string().optional(),
  tag: z.string().optional(),
  created_at_min: z.string().optional(),
  created_at_max: z.string().optional(),
});

const GetArticleSchema = z.object({
  blog_id: z.string(),
  article_id: z.string(),
});

const CreateArticleSchema = z.object({
  blog_id: z.string(),
  title: z.string(),
  author: z.string().optional(),
  tags: z.string().optional().describe("Comma-separated tags"),
  body_html: z.string().optional().describe("Article body HTML"),
  summary_html: z.string().optional().describe("Article summary/excerpt HTML"),
  published: z.boolean().optional(),
  published_at: z.string().optional().describe("Publication datetime (ISO8601)"),
  image: z.object({ src: z.string().url(), alt: z.string().optional() }).optional(),
  template_suffix: z.string().optional(),
});

const UpdateArticleSchema = z.object({
  blog_id: z.string(),
  article_id: z.string(),
  title: z.string().optional(),
  author: z.string().optional(),
  tags: z.string().optional(),
  body_html: z.string().optional(),
  summary_html: z.string().optional(),
  published: z.boolean().optional(),
  image: z.object({ src: z.string().url(), alt: z.string().optional() }).optional(),
});

const DeleteArticleSchema = z.object({ blog_id: z.string(), article_id: z.string() });

const ListCommentsSchema = z.object({
  blog_id: z.string().optional(),
  article_id: z.string().optional(),
  limit: z.number().min(1).max(250).optional().default(50),
  page_info: z.string().optional(),
  status: z.enum(["pending", "published", "spam", "unapproved", "removed"]).optional(),
  published_status: z.enum(["published", "unpublished", "any"]).optional().default("any"),
});

const GetCommentSchema = z.object({ comment_id: z.string() });

const CreateCommentSchema = z.object({
  article_id: z.number(),
  blog_id: z.number(),
  author: z.string(),
  email: z.string().email(),
  body: z.string().describe("Comment body (plain text)"),
  ip: z.string().optional(),
  published_at: z.string().optional(),
});

const UpdateCommentSchema = z.object({
  comment_id: z.string(),
  body: z.string().optional(),
  author: z.string().optional(),
  email: z.string().optional(),
});

const CommentActionSchema = z.object({ comment_id: z.string() });

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_articles",
      title: "List Blog Articles",
      description: "List articles in a blog. Filter by author, tag, or publish status. Supports cursor pagination.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string" },
          limit: { type: "number" },
          page_info: { type: "string" },
          published_status: { type: "string", enum: ["published", "unpublished", "any"] },
          author: { type: "string" },
          tag: { type: "string" },
          created_at_min: { type: "string" },
          created_at_max: { type: "string" },
        },
        required: ["blog_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_article",
      title: "Get Blog Article",
      description: "Get a specific article by ID from a blog.",
      inputSchema: {
        type: "object",
        properties: { blog_id: { type: "string" }, article_id: { type: "string" } },
        required: ["blog_id", "article_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_article",
      title: "Create Blog Article",
      description: "Create a new article in a blog. Set published=true to publish immediately, or leave false for draft.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string" },
          title: { type: "string" },
          author: { type: "string" },
          tags: { type: "string" },
          body_html: { type: "string" },
          summary_html: { type: "string" },
          published: { type: "boolean" },
          published_at: { type: "string" },
          image: { type: "object", properties: { src: { type: "string" }, alt: { type: "string" } } },
        },
        required: ["blog_id", "title"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_article",
      title: "Update Blog Article",
      description: "Update an existing blog article — content, author, tags, or publication status.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string" },
          article_id: { type: "string" },
          title: { type: "string" },
          author: { type: "string" },
          tags: { type: "string" },
          body_html: { type: "string" },
          summary_html: { type: "string" },
          published: { type: "boolean" },
        },
        required: ["blog_id", "article_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_article",
      title: "Delete Blog Article",
      description: "Permanently delete a blog article. Cannot be undone.",
      inputSchema: {
        type: "object",
        properties: { blog_id: { type: "string" }, article_id: { type: "string" } },
        required: ["blog_id", "article_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_comments",
      title: "List Article Comments",
      description: "List comments across articles, optionally filtered by blog, article, or moderation status.",
      inputSchema: {
        type: "object",
        properties: {
          blog_id: { type: "string" },
          article_id: { type: "string" },
          limit: { type: "number" },
          page_info: { type: "string" },
          status: { type: "string" },
          published_status: { type: "string" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_comment",
      title: "Get Comment",
      description: "Get a specific comment by ID.",
      inputSchema: {
        type: "object",
        properties: { comment_id: { type: "string" } },
        required: ["comment_id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "approve_comment",
      title: "Approve Comment",
      description: "Approve a pending or spam comment to make it publicly visible.",
      inputSchema: {
        type: "object",
        properties: { comment_id: { type: "string" } },
        required: ["comment_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "spam_comment",
      title: "Mark Comment as Spam",
      description: "Mark a comment as spam to hide it from the blog.",
      inputSchema: {
        type: "object",
        properties: { comment_id: { type: "string" } },
        required: ["comment_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_comment",
      title: "Delete Comment",
      description: "Permanently delete a comment from a blog article.",
      inputSchema: {
        type: "object",
        properties: { comment_id: { type: "string" } },
        required: ["comment_id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
  ];
}

// === Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_articles: async (args) => {
      const params = ListArticlesSchema.parse(args);
      let result: { data: ShopifyArticle[]; nextPageInfo?: string };
      if (params.page_info) {
        result = await logger.time("tool.list_articles", () =>
          client.paginateFromCursor<ShopifyArticle>(`/blogs/${params.blog_id}/articles.json`, params.page_info!, params.limit)
        , { tool: "list_articles" });
      } else {
        const extra: Record<string, string> = {};
        if (params.published_status && params.published_status !== "any") extra.published_status = params.published_status;
        if (params.author) extra.author = params.author;
        if (params.tag) extra.tag = params.tag;
        if (params.created_at_min) extra.created_at_min = params.created_at_min;
        if (params.created_at_max) extra.created_at_max = params.created_at_max;
        result = await logger.time("tool.list_articles", () =>
          client.paginatedGet<ShopifyArticle>(`/blogs/${params.blog_id}/articles.json`, extra, params.limit)
        , { tool: "list_articles" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_article: async (args) => {
      const { blog_id, article_id } = GetArticleSchema.parse(args);
      const data = await logger.time("tool.get_article", () =>
        client.get<{ article: ShopifyArticle }>(`/blogs/${blog_id}/articles/${article_id}.json`)
      , { tool: "get_article" });
      const article = (data as { article: ShopifyArticle }).article;
      return { content: [{ type: "text", text: JSON.stringify(article, null, 2) }], structuredContent: article };
    },

    create_article: async (args) => {
      const { blog_id, ...articleData } = CreateArticleSchema.parse(args);
      const data = await logger.time("tool.create_article", () =>
        client.post<{ article: ShopifyArticle }>(`/blogs/${blog_id}/articles.json`, { article: articleData })
      , { tool: "create_article" });
      const article = (data as { article: ShopifyArticle }).article;
      return { content: [{ type: "text", text: JSON.stringify(article, null, 2) }], structuredContent: article };
    },

    update_article: async (args) => {
      const { blog_id, article_id, ...updateData } = UpdateArticleSchema.parse(args);
      const data = await logger.time("tool.update_article", () =>
        client.put<{ article: ShopifyArticle }>(`/blogs/${blog_id}/articles/${article_id}.json`, { article: updateData })
      , { tool: "update_article" });
      const article = (data as { article: ShopifyArticle }).article;
      return { content: [{ type: "text", text: JSON.stringify(article, null, 2) }], structuredContent: article };
    },

    delete_article: async (args) => {
      const { blog_id, article_id } = DeleteArticleSchema.parse(args);
      await logger.time("tool.delete_article", () =>
        client.delete<unknown>(`/blogs/${blog_id}/articles/${article_id}.json`)
      , { tool: "delete_article" });
      const response = { success: true, article_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    list_comments: async (args) => {
      const params = ListCommentsSchema.parse(args);
      let result: { data: ShopifyComment[]; nextPageInfo?: string };
      const extra: Record<string, string> = {};
      if (params.status) extra.status = params.status;
      if (params.published_status && params.published_status !== "any") extra.published_status = params.published_status;
      if (params.page_info) {
        result = await logger.time("tool.list_comments", () =>
          client.paginateFromCursor<ShopifyComment>("/comments.json", params.page_info!, params.limit)
        , { tool: "list_comments" });
      } else {
        if (params.blog_id) extra.blog_id = params.blog_id;
        if (params.article_id) extra.article_id = params.article_id;
        result = await logger.time("tool.list_comments", () =>
          client.paginatedGet<ShopifyComment>("/comments.json", extra, params.limit)
        , { tool: "list_comments" });
      }
      const response = { data: result.data, meta: { count: result.data.length, hasMore: !!result.nextPageInfo, ...(result.nextPageInfo ? { nextPageInfo: result.nextPageInfo } : {}) } };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },

    get_comment: async (args) => {
      const { comment_id } = GetCommentSchema.parse(args);
      const data = await logger.time("tool.get_comment", () =>
        client.get<{ comment: ShopifyComment }>(`/comments/${comment_id}.json`)
      , { tool: "get_comment" });
      const comment = (data as { comment: ShopifyComment }).comment;
      return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }], structuredContent: comment };
    },

    approve_comment: async (args) => {
      const { comment_id } = CommentActionSchema.parse(args);
      const data = await logger.time("tool.approve_comment", () =>
        client.post<{ comment: ShopifyComment }>(`/comments/${comment_id}/approve.json`, {})
      , { tool: "approve_comment" });
      const comment = (data as { comment: ShopifyComment }).comment;
      return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }], structuredContent: comment };
    },

    spam_comment: async (args) => {
      const { comment_id } = CommentActionSchema.parse(args);
      const data = await logger.time("tool.spam_comment", () =>
        client.post<{ comment: ShopifyComment }>(`/comments/${comment_id}/spam.json`, {})
      , { tool: "spam_comment" });
      const comment = (data as { comment: ShopifyComment }).comment;
      return { content: [{ type: "text", text: JSON.stringify(comment, null, 2) }], structuredContent: comment };
    },

    delete_comment: async (args) => {
      const { comment_id } = CommentActionSchema.parse(args);
      await logger.time("tool.delete_comment", () =>
        client.delete<unknown>(`/comments/${comment_id}.json`)
      , { tool: "delete_comment" });
      const response = { success: true, comment_id };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }], structuredContent: response };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
