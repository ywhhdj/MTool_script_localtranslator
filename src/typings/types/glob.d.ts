export {}
declare global {
  const getGameCWD: () => Promise<string>;
  interface Window {
    MToolTranslatorPlugin: any;
    require: (path: string) => any;
    PIXI: {
      Text: any;
      BitmapText: any;
    };
    Game_Message: any;
    Window_Command: any;
    Window_Base: {
      prototype: {
        convertEscapeCharacters: any;
        drawText: any;
        drawTextEx: any;
      };
    };
    Scene_Base: any;
    Game_Interpreter: any;
    cc: {
      Label: any;
    };
    Phaser: {
      GameObjects: {
        Text: any;
      };
    };
    Bitmap: {
      prototype: {
        drawText: any;
        drawTextEx: any;
      };
    };
    DataManager: any;
    $data: any;
    XLSX: {
      read: (buffer: ArrayBuffer, Init?: any) => any,
      utils: {
        sheet_to_json:<T=any>(data:any,Init?:any)=>T
      }
    };
  }

  interface XMLHttpRequest {
    _mootIsTarget: boolean;
    _requestMethod?: string;
    _mootUrl?: string | URL;
  }
}
declare const getGameCWD: () => Promise<string>;