/**
 * engine.ts — 游戏引擎 Hook 集合
 *
 * 修复（Bug 修复）：
 *  - hookRPGMaker 中 try { args[0] = String(args[0]); } 缺少闭合括号
 *  - 各 hook 增加开关关闭时的 uninstall 调用
 *  - 增加 console.log 调试输出
 *  - Bitmap.drawText 防止非字符串参数崩溃
 */

import config from '../../config';
import logger, { LogLevel } from '../logger';
import { hookPrototype, uninstallHook } from './utils';

type HookCallback = (text: string) => any;

// ==================== Bitmap Hook ====================

export function hookBitmap(callback: HookCallback): void {
  if (typeof window.Bitmap === 'undefined') {
    logger.addLog('[Engine] Bitmap 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎨 Hook Bitmap.drawText');

  //drawText(text, x, y, maxWidth, align)
  hookPrototype('Bitmap', 'drawText', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    if (config.debug) console.log(`[MToolTranslatorPlugin][Bitmap] drawText: "${text.slice(0, 30)}"`);
    args[0] = callback(text);
    return args;
  });

  //drawTextEx(text, x, y, maxWidth, align, options)
  hookPrototype('Bitmap', 'drawTextEx', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    args[0] = callback(text);
    return args;
  });
}

export function unhookBitmap(): void {
  uninstallHook('Bitmap', 'drawText');
  uninstallHook('Bitmap', 'drawTextEx');
}

// ==================== Canvas 2D Hook ====================

export function hookCanvas(callback: HookCallback): void {
  if (typeof window.CanvasRenderingContext2D === 'undefined') {
    logger.addLog('[Engine] Canvas2D 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🖼️ Hook Canvas2D.fillText');

  for (const methodName of ['fillText', 'strokeText']) {
    //fillText(text, x, y, maxWidth, align)
    //strokeText(text, x, y, maxWidth, align)
    hookPrototype('CanvasRenderingContext2D', methodName, (_, ...args: any[]) => {
      const text = args[0];
      if (typeof text !== 'string') return args;
      if (text.length === 0) return args;
      if (config.debug) console.log(`[MToolTranslatorPlugin][Canvas] ${methodName}: "${text.slice(0, 30)}"`);
      args[0] = callback(text);
      return args;
    });
  }
}

export function unhookCanvas(): void {
  uninstallHook('CanvasRenderingContext2D', 'fillText');
  uninstallHook('CanvasRenderingContext2D', 'strokeText');
}

// ==================== RPG Maker Hook ====================

export function hookRPGMaker(callback: HookCallback): void {
  if (typeof window.Window_Base === 'undefined' && typeof window.Scene_Base === 'undefined') {
    logger.addLog('[Engine] RPG Maker 未检测到，跳过 Hook', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎮 Hook RPG Maker');

  // ---- Window_Base.drawText ----
  //drawText(text, x, y, maxWidth, align)
  if (typeof window.Window_Base !== 'undefined') {
    hookPrototype('Window_Base', 'drawText', (_, ...args: any[]) => {
      const text = args[0];
      if (typeof text !== 'string') return args;
      if (text.length === 0) return args;
      if (config.debug) console.log(`[MToolTranslatorPlugin][RPG] drawText: "${text.slice(0, 30)}`);
      args[0] = callback(text);
      return args;
    });

    // convertEscapeCharacters — 处理转义序列中的文本
    //convertEscapeCharacters(text)
    hookPrototype('Window_Base', 'convertEscapeCharacters', (_, ...args: any[]) => {
      if (typeof args[0] !== 'string') return args;
      const text = callback(args[0]);
      args[0] = text;
      return args;
    });
  }

  // ---- Scene_Base / Game_Interpreter ----
  // command101(params)
  if (typeof window.Game_Interpreter !== 'undefined') {
    hookPrototype('Game_Interpreter', 'command101', (_, ...args: any[]) => {
      // 对话命令 — 在显示前拦截
      try {
        // @ts-ignore
        const interpreter = (this as any);
        const params = interpreter._params;
        if (params && params[0] && typeof params[0] === 'string') {
          const text = callback(params[0]);
          if (typeof text === 'string') {
            params[0] = text;
          } else if (Array.isArray(text) && typeof text[0] === 'string') {
            params[0] = text[0];
          }
        }
      } catch (e) { /* ignore */ }
      return args;
    });
  }

  // ---- 文本转义保护 ----
  // drawTextEx(text, x, y, maxWidth, align, options)
  if (typeof window.Window_Base !== 'undefined') {
    hookPrototype('Window_Base', 'drawTextEx', (_, ...args: any[]) => {
      if (typeof args[0] !== 'string') return args;
      const text = callback(args[0]);
      args[0] = text;
      return args;
    });
  }
}

export function unhookRPGMaker(): void {
  uninstallHook('Window_Base', 'drawText');
  uninstallHook('Window_Base', 'convertEscapeCharacters');
  uninstallHook('Window_Base', 'drawTextEx');
  uninstallHook('Game_Interpreter', 'command101');
}

// ==================== PixiJS Hook ====================

export function hookPixiJS(callback: HookCallback): void {
  if (typeof window.PIXI === 'undefined') {
    logger.addLog('[Engine] PixiJS 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }
  if (config.debug)
    console.log('[MToolTranslatorPlugin][Engine] 🧊 Hook PixiJS.Text');

  // PIXI.Text.prototype.updateText 或 _updateText
  // updateText(text) 或 setText(text)
  const TextCls = window.PIXI.Text || window.PIXI.BitmapText;
  if (!TextCls) {
    logger.addLog('[Engine] PIXI.Text 不可用', LogLevel.WARNING);
    return;
  }

  const proto = TextCls.prototype;
  const targetMethod = proto.updateText || proto._updateText || proto.setText;

  if (typeof targetMethod !== 'function') {
    logger.addLog('[Engine] PIXI.Text 无可 hook 方法', LogLevel.WARNING);
    return;
  }

  const methodName = targetMethod === proto.updateText ? 'updateText'
    : targetMethod === proto._updateText ? '_updateText' : 'setText';

  hookPrototype('PIXI.Text', methodName, (_, ...args: any[]) => {
    if (typeof args[0] === 'string' && args[0].length > 0) {
      if (config.debug) console.log(`[MToolTranslatorPlugin][Pixi] ${methodName}: "${args[0].slice(0, 30)}`);
      args[0] = callback(args[0]);
    }
    return args;
  });
}

export function unhookPixiJS(): void {
  uninstallHook('PIXI.Text', 'updateText');
  uninstallHook('PIXI.Text', '_updateText');
  uninstallHook('PIXI.Text', 'setText');
}

// ==================== Cocos2d Hook ====================

export function hookCocos(callback: HookCallback): void {
  const cc = window.cc;
  if (!cc) {
    logger.addLog('[Engine] Cocos2d 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }
  if (config.debug)
    console.log('[MToolTranslatorPlugin][Engine] 🎯 Hook Cocos2d');

  // cc.Label.setString(text)
  if (cc.Label && cc.Label.prototype) {
    hookPrototype('cc.Label', 'setString', (_, ...args: any[]) => {
      if (typeof args[0] === 'string') {
        if (config.debug) console.log(`[MToolTranslatorPlugin][Cocos] setString: "${args[0].slice(0, 30)}`);
        args[0] = callback(args[0]);
      }
      return args;
    });
  }

  // // cc.RichText
  // if (cc.RichText && cc.RichText.prototype) {
  //   hookPrototype('cc.RichText', 'string', (original, ...args: any[]) => {
  //     // 这是 setter 方式，不一定能 hook prototype
  //   });
  // }
}

export function unhookCocos(): void {
  uninstallHook('cc.Label', 'setString');
}

export function hookPhaser(callback: HookCallback): void {
  if (typeof window.Phaser === 'undefined') {
    logger.addLog('[Engine] Phaser 不可用，跳过 Hook', LogLevel.WARNING);
    return;
  }

  const TextClass = window.Phaser.GameObjects?.Text;
  if (!TextClass) {
    logger.addLog('[Engine] Phaser.GameObjects.Text 不可用', LogLevel.WARNING);
    return;
  }

  console.log('[MToolTranslatorPlugin][Engine] 🎮 Hook Phaser.GameObjects.Text.setText');

  hookPrototype('Phaser.GameObjects.Text', 'setText', (_, ...args: any[]) => {
    const text = args[0];
    if (typeof text !== 'string') return args;
    if (text.length === 0) return args;
    if (config.debug) console.log(`[MToolTranslatorPlugin][Phaser] setText: "${text.slice(0, 30)}"`);
    args[0] = callback(text);
    return args;
  });
}

export function unhookPhaser(): void {
  uninstallHook('Phaser.GameObjects.Text', 'setText');
}