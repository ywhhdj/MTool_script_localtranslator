declare namespace Data {
  type TranslationRule = {
    source: string | RegExp;
    target: string;
    regex?: RegExp;
  }

  type TranslationData = {
    exactMap: Map<string, string>;
    regexRules: Array<{ pattern: RegExp; replacement: string }>;
    ruleCount: number;
  }
}