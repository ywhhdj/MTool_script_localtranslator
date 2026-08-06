export {}
declare global {
  interface Window {
    MToolTranslatorPlugin: any;
    getGameCWD: () => Promise<string>;
    require: (path: string) => any;
    PIXI: any;
    Game_Message: any;
    Window_Command: any;
    Window_Base: any;
    cc: any;
    Bitmap: any;
    DataManager: any;
    $data: any;
  }

  interface XMLHttpRequest {
    _shouldIntercept?: {
      url: boolean;
      method: boolean;
    };
    _requestMethod?: string;
    _requestUrl?: string | URL;
  }
}
declare const getGameCWD: () => Promise<string>;