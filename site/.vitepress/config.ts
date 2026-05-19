import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'xera',
  description:
    'AI-native test framework for QA teams — fetch a ticket, generate Gherkin + Playwright spec, run it, diagnose the failure, post results back. Driven by AI coding-agent skills.',
  lang: 'en-US',
  cleanUrls: true,
  lastUpdated: true,
  // Repo deploys to https://<org>.github.io/xera/, so the site must live under /xera/.
  // Override at build time with VITEPRESS_BASE if hosting at a custom domain.
  base: process.env.VITEPRESS_BASE ?? '/xera/',
  head: [
    ['meta', { name: 'theme-color', content: '#646cff' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:title', content: 'xera — AI-native test framework' }],
    [
      'meta',
      {
        property: 'og:description',
        content:
          'Fetch a ticket, generate Gherkin + Playwright spec, run it, diagnose the failure, post results back. Driven by AI coding-agent skills.',
      },
    ],
  ],
  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Architecture', link: '/guide/architecture' },
      { text: 'Configuration', link: '/guide/configuration' },
      { text: 'Troubleshooting', link: '/guide/troubleshooting' },
      {
        text: 'Roadmap',
        link: 'https://github.com/xera-ai/xera#roadmap',
      },
    ],
    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting started', link: '/guide/getting-started' },
            { text: 'Project context', link: '/guide/project-context' },
          ],
        },
        {
          text: 'Reference',
          items: [
            { text: 'Architecture', link: '/guide/architecture' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/xera-ai/xera' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@xera-ai/cli' },
    ],
    search: {
      provider: 'local',
    },
    editLink: {
      pattern: 'https://github.com/xera-ai/xera/edit/main/site/:path',
      text: 'Edit this page on GitHub',
    },
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 xera contributors',
    },
    outline: { level: [2, 3] },
  },
});
