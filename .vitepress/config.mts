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
    nav: process.argv.includes('dev')
      ? [{ text: '发布工作台', link: 'http://127.0.0.1:4174/' }]
      : [],
    sidebar: false,
    outline: false,
    docFooter: { prev: false, next: false },
  },
})

