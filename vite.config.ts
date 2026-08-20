import { defineConfig, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'

const cssInjectedByJs = ():PluginOption => ({
  name: 'css-injected-by-js',
  apply: 'build' as const,
  enforce: 'post' as const,
  generateBundle(_: any, bundle: any) {
    const cssFiles = Object.keys(bundle).filter(key => key.endsWith('.css'))
    const jsFiles = Object.keys(bundle).filter(key => key.endsWith('.js'))

    if (cssFiles.length > 0 && jsFiles.length > 0) {
      // 1. 提取合并所有组件的 CSS 样式
      const cssContent = cssFiles.map(key => (bundle[key] as any).source).join('')

      // 2. 找到打包后的主 JS 文件
      const jsFile = bundle[jsFiles[0]] as any
      const safeCss = JSON.stringify(cssContent)
      const injectionCode = `(function(){try{var s=document.createElement('style');s.textContent=${safeCss};s.setAttribute('data-mtool','1');document.head.appendChild(s);}catch(e){}})();\n`
      jsFile.code = injectionCode + jsFile.code

      cssFiles.forEach(key => delete bundle[key])
    }
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    cssInjectedByJs()
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    lib: {
      entry: 'index.ts',
      name: 'MToolTranslatorPlugin',
      formats: ['iife'],
    },
    rollupOptions: {
      external: [],
    },
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
  }
})
