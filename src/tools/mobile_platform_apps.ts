// Mobile Platform Apps tools — Shopify Admin API 2024-01 (GraphQL)
// Covers: list_mobile_platform_applications, get_mobile_platform_application, create_mobile_platform_application, update_mobile_platform_application, delete_mobile_platform_application

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

const ListMobileAppsSchema = z.object({});

const GetMobileAppSchema = z.object({
  id: z.string().describe("Mobile platform application GID"),
});

const CreateMobileAppSchema = z.object({
  platform: z.enum(["ANDROID", "IOS"]).describe("Mobile platform"),
  applicationId: z.string().describe("App bundle ID (iOS) or package name (Android)"),
  sha256CertFingerprints: z.array(z.string()).optional().describe("SHA256 certificate fingerprints (Android only)"),
  appClipApplicationId: z.string().optional().describe("App Clip bundle ID (iOS only)"),
  enabledUniversalOrAppLinks: z.boolean().optional().default(true).describe("Enable universal/app links"),
  enabledSharedWebCredentials: z.boolean().optional().default(false).describe("Enable shared web credentials (iOS)"),
});

const UpdateMobileAppSchema = z.object({
  id: z.string().describe("Mobile platform application GID"),
  applicationId: z.string().optional(),
  sha256CertFingerprints: z.array(z.string()).optional(),
  enabledUniversalOrAppLinks: z.boolean().optional(),
  enabledSharedWebCredentials: z.boolean().optional(),
});

const DeleteMobileAppSchema = z.object({
  id: z.string().describe("Mobile platform application GID to delete"),
});

function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_mobile_platform_applications",
      title: "List Mobile Platform Applications",
      description: "List all registered mobile platform applications (iOS and Android) for the store. Used for App Links / Universal Links configuration. Returns platform, application ID, and link settings.",
      inputSchema: { type: "object", properties: {} },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_mobile_platform_application",
      title: "Get Mobile Platform Application",
      description: "Get a specific mobile platform application registration by GID.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Mobile platform application GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_mobile_platform_application",
      title: "Create Mobile Platform Application",
      description: "Register a mobile app (iOS or Android) with the Shopify store. Enables Universal Links (iOS) and App Links (Android) for deep linking from emails, checkout, and the storefront into the native app.",
      inputSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: ["ANDROID", "IOS"], description: "Mobile platform" },
          applicationId: { type: "string", description: "Bundle ID (iOS) or package name (Android)" },
          sha256CertFingerprints: { type: "array", description: "SHA256 fingerprints (Android)" },
          appClipApplicationId: { type: "string", description: "App Clip bundle ID (iOS)" },
          enabledUniversalOrAppLinks: { type: "boolean", description: "Enable universal/app links" },
          enabledSharedWebCredentials: { type: "boolean", description: "Enable shared web credentials (iOS)" },
        },
        required: ["platform", "applicationId"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_mobile_platform_application",
      title: "Update Mobile Platform Application",
      description: "Update a mobile platform application registration. Use to update bundle IDs, certificate fingerprints, or deep link settings.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string", description: "Mobile platform application GID" },
          applicationId: { type: "string", description: "New bundle ID or package name" },
          sha256CertFingerprints: { type: "array", description: "Updated SHA256 fingerprints" },
          enabledUniversalOrAppLinks: { type: "boolean", description: "Universal/app links enabled" },
          enabledSharedWebCredentials: { type: "boolean", description: "Shared web credentials enabled" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_mobile_platform_application",
      title: "Delete Mobile Platform Application",
      description: "Remove a mobile platform application registration from the store.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string", description: "Mobile platform application GID" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    },
  ];
}

function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  const gql = (query: string, variables: Record<string, unknown> = {}) =>
    client.post<Record<string, unknown>>("/graphql.json", { query, variables });

  return {
    list_mobile_platform_applications: async (_args) => {
      const q = `query{mobilePlatformApplications{edges{node{id platform applicationId enabledUniversalOrAppLinks enabledSharedWebCredentials}}}}`;
      const data = await logger.time("tool.list_mobile_platform_applications", () => gql(q), { tool: "list_mobile_platform_applications" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    get_mobile_platform_application: async (args) => {
      const { id } = GetMobileAppSchema.parse(args);
      const q = `query($id:ID!){mobilePlatformApplication(id:$id){id platform applicationId sha256CertFingerprints appClipApplicationId enabledUniversalOrAppLinks enabledSharedWebCredentials}}`;
      const data = await logger.time("tool.get_mobile_platform_application", () => gql(q, { id }), { tool: "get_mobile_platform_application" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    create_mobile_platform_application: async (args) => {
      const params = CreateMobileAppSchema.parse(args);
      const q = `mutation mobilePlatformApplicationCreate($input:MobilePlatformApplicationInput!){mobilePlatformApplicationCreate(input:$input){mobilePlatformApplication{id platform applicationId}userErrors{field message}}}`;
      const data = await logger.time("tool.create_mobile_platform_application", () => gql(q, { input: params }), { tool: "create_mobile_platform_application" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    update_mobile_platform_application: async (args) => {
      const { id, ...input } = UpdateMobileAppSchema.parse(args);
      const q = `mutation mobilePlatformApplicationUpdate($id:ID!,$input:MobilePlatformApplicationInput!){mobilePlatformApplicationUpdate(id:$id,input:$input){mobilePlatformApplication{id platform applicationId}userErrors{field message}}}`;
      const data = await logger.time("tool.update_mobile_platform_application", () => gql(q, { id, input }), { tool: "update_mobile_platform_application" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },

    delete_mobile_platform_application: async (args) => {
      const { id } = DeleteMobileAppSchema.parse(args);
      const q = `mutation mobilePlatformApplicationDelete($id:ID!){mobilePlatformApplicationDelete(id:$id){deletedMobilePlatformApplicationId userErrors{field message}}}`;
      const data = await logger.time("tool.delete_mobile_platform_application", () => gql(q, { id }), { tool: "delete_mobile_platform_application" });
      return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
    },
  };
}

export function getTools(client: ShopifyClient) {
  return { tools: getToolDefinitions(), handlers: getToolHandlers(client) };
}
