import type { ScraperConfig, SourceFormState } from "./types";

export const SCRAPER_CONFIGS: Record<string, ScraperConfig> = {
  iconify: {
    label: "Iconify",
    defaultUrl: "https://icon-sets.iconify.design/logos/",
    defaultBatch: 5000,
  },
};

export const PAGE_SIZE = 48;

export const defaultForm = (): SourceFormState => ({
  name: "",
  siteUrl: SCRAPER_CONFIGS.iconify.defaultUrl,
  enabled: true,
  fetchBatchSize: 50,
  cacheTtlHours: 168,
  fetchIntervalHours: 24,
  sourceType: "svg",
  scraperType: "iconify",
});
