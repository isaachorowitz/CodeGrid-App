import type { MetadataRoute } from 'next';
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: "https://codegrid.app", lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: "https://codegrid.app/pricing", lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: "https://codegrid.app/privacy", lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: "https://codegrid.app/terms", lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];
}
