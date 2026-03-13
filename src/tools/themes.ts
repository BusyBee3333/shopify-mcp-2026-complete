// Themes tools — Shopify Admin API 2024-01
// Covers: list_themes, get_theme, create_theme, update_theme, delete_theme,
//         list_theme_assets, get_theme_asset, update_theme_asset

import { z } from "zod";
import type { ShopifyClient } from "../client.js";
import type { ToolDefinition, ToolHandler } from "../types.js";
import { logger } from "../logger.js";

// === Types ===
interface ShopifyTheme {
  id?: number;
  name?: string;
  role?: string;
  theme_store_id?: number | null;
  previewable?: boolean;
  processing?: boolean;
  src?: string;
  created_at?: string;
  updated_at?: string;
}

interface ShopifyThemeAsset {
  key?: string;
  public_url?: string | null;
  value?: string;
  attachment?: string;
  content_type?: string;
  size?: number;
  checksum?: string | null;
  theme_id?: number;
  created_at?: string;
  updated_at?: string;
}

// === Zod Schemas ===
const ListThemesSchema = z.object({
  role: z.enum(["main", "unpublished", "demo"]).optional().describe("Filter by theme role: main (live), unpublished, or demo"),
});

const GetThemeSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID"),
});

const CreateThemeSchema = z.object({
  name: z.string().describe("Theme name"),
  src: z.string().url().describe("Public URL of a ZIP file containing the theme (must be accessible by Shopify)"),
  role: z.enum(["unpublished", "main"]).optional().default("unpublished").describe("Theme role: 'unpublished' to install without publishing, 'main' to publish immediately"),
});

const UpdateThemeSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID"),
  name: z.string().optional().describe("Updated theme name"),
  role: z.enum(["main", "unpublished"]).optional().describe("Set to 'main' to publish this theme"),
});

const DeleteThemeSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID to delete (cannot delete the active/main theme)"),
});

const ListThemeAssetsSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID"),
  asset_key: z.string().optional().describe("Filter to a specific asset key (e.g. 'templates/index.liquid')"),
});

const GetThemeAssetSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID"),
  key: z.string().describe("Asset key (e.g. 'templates/index.liquid', 'assets/theme.css')"),
});

const UpdateThemeAssetSchema = z.object({
  theme_id: z.string().describe("Shopify theme ID"),
  key: z.string().describe("Asset key (e.g. 'templates/index.liquid')"),
  value: z.string().optional().describe("Asset content as a UTF-8 string (use for text files like .liquid, .css, .js)"),
  attachment: z.string().optional().describe("Base64-encoded asset content (use for binary files like images)"),
  src: z.string().url().optional().describe("URL of a source asset to copy from"),
});

// === Tool Definitions ===
function getToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: "list_themes",
      title: "List Themes",
      description:
        "List all themes installed on the Shopify store. Returns theme name, role (main = live theme, unpublished, demo), theme store ID, and processing status. Use to identify the active theme or find a theme ID before editing assets.",
      inputSchema: {
        type: "object",
        properties: {
          role: { type: "string", enum: ["main", "unpublished", "demo"], description: "Filter by role (main = live theme)" },
        },
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_theme",
      title: "Get Theme",
      description:
        "Get full details for a specific Shopify theme by ID. Returns name, role, theme store ID, previewable status, and timestamps.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID" },
        },
        required: ["theme_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, name: { type: "string" }, role: { type: "string" }, processing: { type: "boolean" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "create_theme",
      title: "Create Theme",
      description:
        "Install a new Shopify theme from a ZIP file URL. Set role='main' to publish immediately, or 'unpublished' to install without activating. The ZIP must be publicly accessible. Returns the new theme; check 'processing' field — theme assets are uploaded asynchronously.",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", description: "Theme name" },
          src: { type: "string", description: "Public URL of the theme ZIP file" },
          role: { type: "string", enum: ["unpublished", "main"], description: "Role: unpublished (default) or main (publish immediately)" },
        },
        required: ["name", "src"],
      },
      outputSchema: {
        type: "object",
        properties: {
          id: { type: "number" }, name: { type: "string" }, role: { type: "string" }, processing: { type: "boolean" },
        },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "update_theme",
      title: "Update Theme",
      description:
        "Update a Shopify theme's name or role. Set role='main' to publish (activate) this theme as the live store theme. Returns the updated theme.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID" },
          name: { type: "string", description: "Updated theme name" },
          role: { type: "string", enum: ["main", "unpublished"], description: "Set to 'main' to activate/publish this theme" },
        },
        required: ["theme_id"],
      },
      outputSchema: {
        type: "object",
        properties: { id: { type: "number" }, name: { type: "string" }, role: { type: "string" } },
        required: ["id"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "delete_theme",
      title: "Delete Theme",
      description:
        "Delete a Shopify theme. Cannot delete the currently active (main) theme — unpublish it first. This action is irreversible. All theme assets will be deleted.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID to delete (cannot be the active main theme)" },
        },
        required: ["theme_id"],
      },
      outputSchema: {
        type: "object",
        properties: { success: { type: "boolean" }, theme_id: { type: "string" } },
        required: ["success"],
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    },
    {
      name: "list_theme_assets",
      title: "List Theme Assets",
      description:
        "List all assets in a Shopify theme. Returns the asset key, content type, size, and checksum for every file in the theme (templates, sections, snippets, assets, config, locales). Use to browse theme structure before editing specific files.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID" },
          asset_key: { type: "string", description: "Filter to a specific asset key (optional)" },
        },
        required: ["theme_id"],
      },
      outputSchema: {
        type: "object",
        properties: {
          data: { type: "array" },
          meta: { type: "object", properties: { count: { type: "number" } } },
        },
        required: ["data", "meta"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "get_theme_asset",
      title: "Get Theme Asset",
      description:
        "Get the full content of a specific theme asset (file) by its key. Returns the file content as a string (value) for text files, or base64-encoded attachment for binary files. Use before editing to retrieve current content.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID" },
          key: { type: "string", description: "Asset key (e.g. 'templates/index.liquid', 'assets/theme.css')" },
        },
        required: ["theme_id", "key"],
      },
      outputSchema: {
        type: "object",
        properties: {
          key: { type: "string" }, value: { type: "string" }, content_type: { type: "string" },
          size: { type: "number" }, theme_id: { type: "number" },
        },
        required: ["key"],
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    {
      name: "update_theme_asset",
      title: "Update Theme Asset",
      description:
        "Create or update a file (asset) in a Shopify theme. Provide the asset key and either value (text content for .liquid, .css, .js files) or attachment (base64-encoded binary for images). Can also copy from a src URL. Use to edit Liquid templates, CSS, JavaScript, or theme configuration files.",
      inputSchema: {
        type: "object",
        properties: {
          theme_id: { type: "string", description: "Shopify theme ID" },
          key: { type: "string", description: "Asset key (e.g. 'templates/index.liquid')" },
          value: { type: "string", description: "Asset content as UTF-8 string (for text files)" },
          attachment: { type: "string", description: "Base64-encoded content (for binary files)" },
          src: { type: "string", description: "URL to copy the asset from" },
        },
        required: ["theme_id", "key"],
      },
      outputSchema: {
        type: "object",
        properties: { key: { type: "string" }, theme_id: { type: "number" }, updated_at: { type: "string" } },
        required: ["key"],
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ];
}

// === Tool Handlers ===
function getToolHandlers(client: ShopifyClient): Record<string, ToolHandler> {
  return {
    list_themes: async (args) => {
      const params = ListThemesSchema.parse(args);
      const extraParams: Record<string, string> = {};
      if (params.role) extraParams.role = params.role;

      const data = await logger.time("tool.list_themes", () =>
        client.get<{ themes: ShopifyTheme[] }>(`/themes.json${Object.keys(extraParams).length ? "?" + new URLSearchParams(extraParams) : ""}`)
      , { tool: "list_themes" });

      const themes = (data as { themes: ShopifyTheme[] }).themes || [];
      const response = { data: themes, meta: { count: themes.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_theme: async (args) => {
      const { theme_id } = GetThemeSchema.parse(args);
      const data = await logger.time("tool.get_theme", () =>
        client.get<{ theme: ShopifyTheme }>(`/themes/${theme_id}.json`)
      , { tool: "get_theme", theme_id });

      const theme = (data as { theme: ShopifyTheme }).theme;

      return {
        content: [{ type: "text", text: JSON.stringify(theme, null, 2) }],
        structuredContent: theme,
      };
    },

    create_theme: async (args) => {
      const params = CreateThemeSchema.parse(args);
      const data = await logger.time("tool.create_theme", () =>
        client.post<{ theme: ShopifyTheme }>("/themes.json", { theme: params })
      , { tool: "create_theme" });

      const theme = (data as { theme: ShopifyTheme }).theme;

      return {
        content: [{ type: "text", text: JSON.stringify(theme, null, 2) }],
        structuredContent: theme,
      };
    },

    update_theme: async (args) => {
      const { theme_id, ...updateData } = UpdateThemeSchema.parse(args);
      const data = await logger.time("tool.update_theme", () =>
        client.put<{ theme: ShopifyTheme }>(`/themes/${theme_id}.json`, { theme: updateData })
      , { tool: "update_theme", theme_id });

      const theme = (data as { theme: ShopifyTheme }).theme;

      return {
        content: [{ type: "text", text: JSON.stringify(theme, null, 2) }],
        structuredContent: theme,
      };
    },

    delete_theme: async (args) => {
      const { theme_id } = DeleteThemeSchema.parse(args);
      await logger.time("tool.delete_theme", () =>
        client.delete<unknown>(`/themes/${theme_id}.json`)
      , { tool: "delete_theme", theme_id });

      const response = { success: true, theme_id };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    list_theme_assets: async (args) => {
      const { theme_id, asset_key } = ListThemeAssetsSchema.parse(args);
      const qs = asset_key ? `?asset[key]=${encodeURIComponent(asset_key)}` : "";
      const data = await logger.time("tool.list_theme_assets", () =>
        client.get<{ assets: ShopifyThemeAsset[] }>(`/themes/${theme_id}/assets.json${qs}`)
      , { tool: "list_theme_assets", theme_id });

      const assets = (data as { assets: ShopifyThemeAsset[] }).assets || [];
      const response = { data: assets, meta: { count: assets.length } };

      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
        structuredContent: response,
      };
    },

    get_theme_asset: async (args) => {
      const { theme_id, key } = GetThemeAssetSchema.parse(args);
      const data = await logger.time("tool.get_theme_asset", () =>
        client.get<{ asset: ShopifyThemeAsset }>(
          `/themes/${theme_id}/assets.json?asset[key]=${encodeURIComponent(key)}`
        )
      , { tool: "get_theme_asset", theme_id, key });

      const asset = (data as { asset: ShopifyThemeAsset }).asset;

      return {
        content: [{ type: "text", text: JSON.stringify(asset, null, 2) }],
        structuredContent: asset,
      };
    },

    update_theme_asset: async (args) => {
      const { theme_id, ...assetData } = UpdateThemeAssetSchema.parse(args);
      const data = await logger.time("tool.update_theme_asset", () =>
        client.put<{ asset: ShopifyThemeAsset }>(
          `/themes/${theme_id}/assets.json`,
          { asset: assetData }
        )
      , { tool: "update_theme_asset", theme_id });

      const asset = (data as { asset: ShopifyThemeAsset }).asset;

      return {
        content: [{ type: "text", text: JSON.stringify(asset, null, 2) }],
        structuredContent: asset,
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
