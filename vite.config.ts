import { defineConfig, type PluginOption } from "vite";
import vue from "@vitejs/plugin-vue";

const cssInjectedByJs = (): PluginOption => ({
  name: "css-injected-by-js",
  apply: "build" as const,
  enforce: "post" as const,
  generateBundle(_: any, bundle: any) {
    const cssFiles = Object.keys(bundle).filter((key) => key.endsWith(".css"));
    const jsFiles = Object.keys(bundle).filter(
      (key) => key.endsWith(".js") && bundle[key].type === "chunk"
    );
    if (cssFiles.length === 0 || jsFiles.length === 0) return;

    const cssContent = cssFiles.map((key) => bundle[key].source ?? "").join("");
    const entryKey =
      jsFiles.find((key) => bundle[key].isEntry) ?? jsFiles[jsFiles.length - 1];
    const jsFile = bundle[entryKey];
    const safeCss = JSON.stringify(cssContent);
    jsFile.code =
      `(function(){try{var s=document.createElement('style');s.textContent=${safeCss};` +
      `s.setAttribute('data-mtool','1');document.head.appendChild(s);}catch(e){}})();\n` +
      jsFile.code;

    for (const key of cssFiles) delete bundle[key];
  },
});

export default defineConfig({
  plugins: [vue(), cssInjectedByJs()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
    minify: "esbuild",
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    reportCompressedSize: false,
    lib: {
      entry: "index.ts",
      name: "MToolTranslatorPlugin",
      formats: ["iife"],
      fileName: () => "mtool-translator-plugin.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
      treeshake: {
        moduleSideEffects: false,
      },
    },
  },
  esbuild: {
    drop: ["debugger"],
    legalComments: "none",
  },
});
