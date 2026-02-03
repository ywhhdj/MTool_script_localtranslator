import LocalTranslator from "./index.ts";

function main() {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => new LocalTranslator().start());
  else new LocalTranslator().start();
}
main();
