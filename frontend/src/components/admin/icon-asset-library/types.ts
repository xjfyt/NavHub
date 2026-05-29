export interface ScraperConfig {
  label: string;
  defaultUrl: string;
  defaultBatch: number;
}

export interface SourceFormState {
  name: string;
  siteUrl: string;
  enabled: boolean;
  fetchBatchSize: number;
  cacheTtlHours: number;
  fetchIntervalHours: number;
  sourceType: string;
  scraperType: string;
}
