// File Uploads tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: staged_uploads_create, files_query, file_create, file_delete

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const StagedUploadsCreateSchema = z.object({
  input: z.array(z.object({
    resource: z.enum(["IMAGE", "VIDEO", "MODEL_3D", "FILE", "BULK_MUTATION_VARIABLES", "GENERIC_FILE"]).describe("Resource type to upload"),
    filename: z.string().describe("Original filename"),
    mimeType: z.string().describe("MIME type (e.g. image/jpeg, video/mp4)"),
    fileSize: z.string().optional().describe("File size in bytes"),
    httpMethod: z.enum(["PUT", "POST"]).optional().default("PUT").describe("HTTP method for upload"),
  })).describe("Array of files to stage for upload"),
});

const FilesQuerySchema = z.object({
  first: z.number().min(1).max(250).optional().default(50).describe("Number of files to return"),
  after: z.string().optional().describe("Cursor for next page"),
  query: z.string().optional().describe("Filter query (e.g. filename:logo, media_type:IMAGE)"),
});

const FileCreateSchema = z.object({
  files: z.array(z.object({
    originalSource: z.string().describe("URL or staged upload URL of the file"),
    contentType: z.enum(["FILE", "IMAGE", "VIDEO"]).optional().describe("Content type"),
    filename: z.string().optional().describe("Desired filename"),
    alt: z.string().optional().describe("Alt text for images"),
  })).describe("Files to create"),
});

const FileDeleteSchema = z.object({
  fileIds: z.array(z.string()).describe("Array of file GIDs to delete (e.g. gid://shopify/MediaImage/123)"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "staged_uploads_create",
      title: "Create Staged Uploads",
      description: "Generate staged upload targets (pre-signed URLs) for uploading files to Shopify. Returns upload URLs and required parameters. After uploading to the URL, use file_create with the staged URL to attach to Shopify.",
      inputSchema: {
        type: "object",
        properties: {
          input: {
            type: "array",
            description: "Array of {resource, filename, mimeType, fileSize} objects describing files to stage",
          },
        },
        required: ["input"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "query_files",
      title: "Query Files",
      description: "List files uploaded to Shopify (images, videos, generic files). Supports filtering by filename, type, and cursor-based pagination. Returns file URLs, alt text, and creation timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          first: { type: "number", description: "Number of files to return (default 50)" },
          after: { type: "string", description: "Pagination cursor" },
          query: { type: "string", description: "Filter query string (e.g. filename:logo)" },
        },
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_file",
      title: "Create File",
      description: "Create file records in Shopify from staged upload URLs or external URLs. Use after staged_uploads_create to finalize uploaded files. Returns file IDs and URLs for use in products, pages, etc.",
      inputSchema: {
        type: "object",
        properties: {
          files: {
            type: "array",
            description: "Array of {originalSource, contentType, filename, alt} objects",
          },
        },
        required: ["files"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "delete_files",
      title: "Delete Files",
      description: "Delete one or more files from Shopify by their GIDs. This permanently removes the files from the store's file system.",
      inputSchema: {
        type: "object",
        properties: {
          fileIds: { type: "array", description: "Array of file GIDs (e.g. gid://shopify/MediaImage/123)" },
        },
        required: ["fileIds"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    staged_uploads_create: async (args) => {
      const { input } = StagedUploadsCreateSchema.parse(args);
      const query = `
        mutation stagedUploadsCreate($input: [StagedUploadInput!]!) {
          stagedUploadsCreate(input: $input) {
            stagedTargets {
              url
              resourceUrl
              parameters { name value }
            }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.staged_uploads_create", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { input } })
      , { tool: "staged_uploads_create" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    query_files: async (args) => {
      const params = FilesQuerySchema.parse(args);
      const query = `
        query getFiles($first: Int!, $after: String, $query: String) {
          files(first: $first, after: $after, query: $query) {
            edges {
              cursor
              node {
                id
                alt
                createdAt
                updatedAt
                ... on MediaImage { image { url width height } mimeType originalUploadSize }
                ... on Video { filename sources { url mimeType } duration }
                ... on GenericFile { url mimeType size }
              }
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      `;
      const data = await logger.time("tool.query_files", () =>
        client.post<Record<string, unknown>>("/graphql.json", {
          query,
          variables: { first: params.first, after: params.after, query: params.query },
        })
      , { tool: "query_files" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_file: async (args) => {
      const { files } = FileCreateSchema.parse(args);
      const query = `
        mutation fileCreate($files: [FileCreateInput!]!) {
          fileCreate(files: $files) {
            files {
              id
              alt
              createdAt
              ... on MediaImage { image { url } }
              ... on GenericFile { url }
            }
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.create_file", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { files } })
      , { tool: "create_file" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_files: async (args) => {
      const { fileIds } = FileDeleteSchema.parse(args);
      const query = `
        mutation fileDelete($fileIds: [ID!]!) {
          fileDelete(fileIds: $fileIds) {
            deletedFileIds
            userErrors { field message }
          }
        }
      `;
      const data = await logger.time("tool.delete_files", () =>
        client.post<Record<string, unknown>>("/graphql.json", { query, variables: { fileIds } })
      , { tool: "delete_files" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
