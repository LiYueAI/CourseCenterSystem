import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = 'http://124.223.94.102';

  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/login/student`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/login/teacher`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${base}/login/admin`, changeFrequency: 'monthly', priority: 0.6 },
  ];
}
