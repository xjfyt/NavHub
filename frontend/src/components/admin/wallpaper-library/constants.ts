import type { ScraperConfig, SourceFormState } from "./types";

export const SCRAPER_CONFIGS: Record<string, ScraperConfig> = {
  manual: {
    label: "本地上传（手动）",
    defaultUrl: "",
    defaultBatch: 0,
    batchHint: "本地壁纸库，不走任何爬虫，直接由你上传图片/视频。",
  },
  bing: {
    label: "Bing 每日壁纸",
    defaultUrl:
      "https://www.bing.com/HPImageArchive.aspx?format=js&n=8&mkt=zh-CN",
    defaultBatch: 15,
    maxBatch: 50,
    batchHint:
      "Bing 公开接口单次最多返回 8 张，历史窗口较短；系统会翻页去重，超过公开窗口后会自动停止。",
  },
  nasa: {
    label: "NASA 天文高清图库",
    defaultUrl:
      "https://images-api.nasa.gov/search?q=aurora%20nebula%20galaxy%20earth&media_type=image&page_size=80",
    defaultBatch: 30,
    batchHint:
      "NASA 会按关键词拆分查询，并过滤低分辨率、非横屏和人物/标识类素材。",
  },
  wikimedia: {
    label: "Wikimedia Commons 动态高清",
    defaultUrl:
      "https://commons.wikimedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:Time-lapse_videos&cmtype=file&cmlimit=100&format=json",
    defaultBatch: 20,
    batchHint:
      "使用可返回内容的 Time-lapse videos 分类，并按媒体尺寸过滤 1080p 以上横屏视频。",
  },
  unsplash: {
    label: "Unsplash 高质量风景",
    defaultUrl:
      "https://api.unsplash.com/search/photos?query=nature%20landscape%20scenic%20wallpaper&orientation=landscape&per_page=30&order_by=popular",
    defaultBatch: 30,
    keyParam: "client_id",
    keyRequired: true,
    keyHint:
      "前往 unsplash.com/developers 创建应用，复制 Access Key 填入此处（不是 Secret Key —— Secret Key 仅用于 OAuth 用户授权，抓取壁纸不需要）",
  },
  wallhaven: {
    label: "Wallhaven 高清通用",
    defaultUrl:
      "https://wallhaven.cc/api/v1/search?purity=100&categories=100&sorting=toplist&topRange=1M&atleast=2560x1440&ratios=16x9,16x10",
    defaultBatch: 24,
    keyParam: "apikey",
    keyRequired: false,
    keyHint: "可选，登录 wallhaven.cc → 设置 → API Key（可提升速率限制）",
  },
  pexels: {
    label: "Pexels 高质量风景",
    defaultUrl:
      "https://api.pexels.com/v1/search?query=nature%20landscape%20scenic%20mountains%20ocean%20forest%20waterfall&orientation=landscape&size=large&per_page=80",
    defaultBatch: 30,
    keyParam: "api_key",
    keyRequired: true,
    batchHint:
      "后端会额外过滤低分辨率、非横屏、低饱和黑白图和人物/人像类素材；Pexels API 每页最多 80 张候选。",
    keyHint:
      "前往 pexels.com/api 注册，获取免费 API Key。默认查询偏自然风景，可在 API 地址里调整 query。",
  },
  pixabay: {
    label: "Pixabay 高清自然",
    defaultUrl:
      "https://pixabay.com/api/?category=nature&image_type=photo&orientation=horizontal&min_width=2560&min_height=1440&per_page=50&order=popular&safesearch=true",
    defaultBatch: 30,
    keyParam: "key",
    keyRequired: true,
    keyHint: "前往 pixabay.com/api/docs 注册，获取免费 API Key",
  },
  desktophut: {
    label: "Desktop Hut",
    defaultUrl: "https://www.desktophut.com",
    defaultBatch: 15,
  },
};

export const SOURCE_TYPES = [
  { id: "image", name: "静态壁纸 (图片)" },
  { id: "video", name: "动态壁纸 (视频)" },
  { id: "both", name: "图文混合" },
];

export const PAGE_SIZE = 24;

export const defaultForm = (): SourceFormState => ({
  name: "",
  siteUrl: SCRAPER_CONFIGS.bing.defaultUrl,
  apiKey: "",
  enabled: true,
  fetchBatchSize: SCRAPER_CONFIGS.bing.defaultBatch,
  cacheTtlHours: 168,
  fetchIntervalHours: 24,
  sourceType: "image",
  scraperType: "bing",
});
