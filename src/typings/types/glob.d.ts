export {};

declare global {
  const getGameCWD: () => Promise<string>;

  interface Window {
    MToolTranslatorPlugin: any;
    require: (path: string) => any;
    PIXI: { Text: any; BitmapText: any };
    Game_Message: any;
    Window_Command: any;
    Window_Base: any;
    Scene_Base: any;
    Game_Interpreter: any;
    cc: { Label: any };
    Phaser: { GameObjects: { Text: any } };
    Bitmap: any;
    DataManager: any;
    $data: any;
    $gameParty: any;
    $gameActors: any;
    $gameMap: any;
    $dataItems: any;
    $dataWeapons: any;
    $dataArmors: any;
    XLSX: {
      read: (buffer: ArrayBuffer, init?: any) => any;
      utils: { sheet_to_json: <T = any>(data: any, init?: any) => T };
    };
  }
}

declare const getGameCWD: () => Promise<string>;
