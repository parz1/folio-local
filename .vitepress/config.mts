import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Folio',
  srcDir: 'content',
  cleanUrls: true,
  vite: {
    server: {
      watch: { awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 30 } },
    },
  },
  lastUpdated: false,
  locales: {
    root: { label: '简体中文', lang: 'zh-CN', themeConfig: { langMenuLabel: '切换语言' } },
    en: { label: 'English', lang: 'en', link: '/en/' },
    ja: { label: '日本語', lang: 'ja', link: '/ja/' },
  },
  themeConfig: {
    sidebar: false,
    outline: false,
    docFooter: { prev: false, next: false },
  },
})

