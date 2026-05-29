export interface ScraperConfig {
  label: string;
  defaultUrl: string;
  defaultBatch: number;
  maxBatch?: number;
  batchHint?: string;
  keyParam?: string;
  keyRequired?: boolean;
  keyHint?: string;
}

export interface SourceFormState {
  name: string;
  siteUrl: string;
  apiKey: string;
  enabled: boolean;
  fetchBatchSize: number;
  cacheTtlHours: number;
  fetchIntervalHours: number;
  sourceType: string;
  scraperType: string;
}

export interface UploadProgressState {
  sourceId: string;
  fileName: string;
  index: number;
  total: number;
  filePercent: number;
  overallPercent: number;
  okCount: number;
  failCount: number;
}
