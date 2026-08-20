declare namespace Options {
  type AITranslateOptions = {
    sourceLang?: string;
    targetLang?: string;
    systemPrompt?: string;
    timeout?: number;
    maxRetries?: number;
    options?: {
      temperature?: number;
      maxTokens?: number;
    }
  }
  type UserConfigItem<T = any> = {
    description: string;
    default: T;
    userConfig: T;
  }

  type XHRHookOptions = {
    urlPatterns?: Array<string | RegExp>;
    method?: "GET"|"POST";
    transformRequest?: (body: string, url: string) => string | null;
    transformResponse?: (data: any, url: string) => any;
  }

  type FetchHookOptions = {
    shouldIntercept?: (url: string, options?: any) => boolean;
    transformRequest?: (args: any[]) => any[] | null;
    transformResponse?: (data: any, url: string, options?: any) => any;
    jsonOnly?: boolean;
  }

  type WebSocketHookOptions= {
    targetURL?: string;
    enableRequestFix?: boolean;
    enableResponseFix?: boolean;
    translateFn?: (text: string) => string | null;
    fixResponseFn?: (original: string, aiResult: string) => string;
    pendingTimeout?: number;
  }
}