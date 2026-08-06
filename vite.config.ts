import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
const cssInjectedByJs = () => ({
  name: 'css-injected-by-js',
  apply: 'build' as const,
  enforce: 'post' as const,
  generateBundle(_: any, bundle: any) {
    const cssFiles = Object.keys(bundle).filter(key => key.endsWith('.css'))
    const jsFiles = Object.keys(bundle).filter(key => key.endsWith('.js'))

    if (cssFiles.length > 0 && jsFiles.length > 0) {
      // 1. 提取合并所有组件的 CSS 样式
      const cssContent = cssFiles.map(key => bundle[key].source).join('\n')

      // 2. 找到打包后的主 JS 文件
      const jsFile = bundle[jsFiles[0]]

      // 3. 生成将 CSS 动态创建 style 标签并插入页面 head 的代码
      const injectionCode = `(function(){
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(cssContent)};
        document.head.appendChild(style);
      })();\n`

      // 4. 将这段 CSS 注入逻辑拼接在打包 JS 的最开头
      jsFile.code = injectionCode + jsFile.code

      // 5. 移出多余的单独 CSS 文件，防止它输出到 dist 目录
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
    assetsInlineLimit: 100000000,
  }
})
