import Config, { Lang, Language, User } from "./config";
import logger, { LogLevel, LogLevelInfo } from "./logger";
import LocalTranslatorUtil from "./util";

interface LocalTranslatorDOM {
  fileName: HTMLInputElement | null;
  autoLoad: HTMLInputElement | null;
  engine: HTMLInputElement | null;
  translatorName: HTMLInputElement | null;
  input: HTMLInputElement | null;
  targetLang: HTMLSelectElement | null;
}

class LocalTranslatorUI {
  container: HTMLDivElement | null = null;
  isOpen: boolean = false;
  dom: LocalTranslatorDOM = {
    fileName: null,
    autoLoad: null,
    engine: null,
    translatorName: null,
    input: null,
    targetLang: null,
  };
  fragment: DocumentFragment | null = document.createDocumentFragment();

  private fileType: string[] = ['json', 'csv'];

  constructor() { }

  show() {
    if (document.body && this.fragment) {
      document.body.appendChild(this.fragment);
    } else {
      console.warn("[Translator] Document body not ready, retrying...");
      setTimeout(() => this.show(), 500);
    }
  }

  createLogElement() {
    const logElement = document.createElement('div');
    logElement.className = 'local-translator-element';
    Object.assign(logElement.style, {
      position: 'fixed', top: '10px', height: '270px', right: '10px',
      width: '150px', background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      padding: '20px', zIndex: '10000', display: 'none',
      flexDirection: 'column', gap: '12px',
      backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.4)',
      overflowY: 'auto', transition: 'all 0.3s ease-in-out', opacity: '0.8'
    });
    const style = document.createElement('style');
    let styleText = `
      .local-translator-element-log {
      margin-bottom: 6px;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.7);
      border-radius: 8px;
      font-size: 12px;
      color: #333;
      border-left: 4px solid ${LogLevelInfo.info.yellow};
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      word-break: break-all;
      animation: 'fadeIn 0.3s ease';
    }
    `;
    for (const item in LogLevel) {
      styleText += `
      #local-translator-element-log-${LogLevelInfo[item as LogLevel].text} {
        border-left-color: ${LogLevelInfo[item as LogLevel].yellow};
      }
      `;
    }
    style.innerHTML = styleText;
    style.className = 'local-translator-element';
    this.fragment?.appendChild(style);
    const header = document.createElement('div');
    header.innerHTML = '<div style="font-weight:bold; color:#197dea; border-bottom:2px solid #f0f0f0; padding-bottom:8px; font-size:14px;">📜 翻译实时日志</div>';
    logElement.appendChild(header);
    logger.logElement = logElement;
    this.fragment?.appendChild(logElement);

  }

  createConfigUI(onSaveCallback: (config: User) => void, exportCallback?: (ev: PointerEvent) => void) {
    this.container = document.createElement('div');
    this.container.className = 'local-translator-element';
    Object.assign(this.container.style, {
      position: 'fixed', bottom: '20px', height: '270px', left: '10px',
      width: '150px', background: 'rgba(255, 255, 255, 0.95)',
      borderRadius: '16px', boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
      padding: '18px', zIndex: '10000', display: 'none',
      flexDirection: 'column', gap: '12px', fontFamily: 'sans-serif',
      backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.3)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', opacity: '0.8'
    });

    this.container.innerHTML = `
      <div style="font-family:Arial, Helvetica, sans-serif;justify-content: space-between;display: flex;padding-bottom: 8px; ">
        <div style=" font-weight: bold; color: #333;">翻译配置</div>
        <button id='lt_export' style="font-size: 10px;padding: 7px 14px;background: #94c5fd;color: white;border: none;border-radius: 8px;cursor: pointer;font-weight: bold;">导出翻译</button>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px; font-size:13px; color:#666;">
          <label>${Config.user.fileName.description} (JSON/CSV):<input type="text" id="lt_fName" value="${Config.user.fileName.default}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #ddd;"></label>
          <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="lt_aLoad" ${Config.user.autoLoad.default ? 'checked' : ''}> 启动时自动加载缓存
          </label>
          <label>${Config.user.transengine.description}:<input type="text" id="lt_engine" value="${Config.user.transengine.default}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #ddd;"></label>
          <label>${Config.user.translatorName.description}:<input type="text" id="lt_tName" value="${Config.user.translatorName.default}" style="width:100%; padding:6px; border-radius:6px; border:1px solid #ddd;"></label>
      </div>
      <div style=" justify-content: space-between;display: flex;font-size:10px;">
        <button id="lt_saveBtn"
          style="background:#94c5fd; color:white; border:none; border-radius:8px; cursor:pointer; font-weight:bold;font-size: 10px;">保存配置并应用</button>
        <div style="display:flex; flex-direction:column; gap:4px; align-items:center;">
          <label style="color:#666;font-weight:bold;font-size: 10px;">${Config.user.targetLang.description}</label>
          <select id="lt_targetLang" style="border: none;color: #333;outline: none; font-size: 13px;">
          ${Object.keys(Lang).map(key => `<option value="${key}" ${Config.user.targetLang.default === key as Language ? 'selected' : ''}>${Lang[key as Language]}</option>`).join('')}
          </select>
        </div>
      </div>
  </div>
    `;
    this.fragment?.appendChild(this.container);
    // 延迟绑定
    setTimeout(() => {
      const export_btn = document.getElementById('lt_export');
      if (export_btn && exportCallback) {
        export_btn.onclick = exportCallback;
      }
      this.dom.fileName = document.getElementById('lt_fName') as HTMLInputElement;
      this.dom.autoLoad = document.getElementById('lt_aLoad') as HTMLInputElement;
      this.dom.engine = document.getElementById('lt_engine') as HTMLInputElement;
      this.dom.translatorName = document.getElementById('lt_tName') as HTMLInputElement;
      this.dom.targetLang = document.getElementById('lt_targetLang') as HTMLSelectElement;
      const saveBtn = document.getElementById('lt_saveBtn');
      if (saveBtn) {
        saveBtn.onclick = () => {
          const fileName = this.dom.fileName?.value;
          const autoLoad = this.dom.autoLoad?.checked;
          const transengine = this.dom.engine?.value;
          const translatorName = this.dom.translatorName?.value;
          const targetLang = this.dom.targetLang?.value as Language;
          if (fileName === '') {
            logger.addLog('请输入数据文件名', LogLevel.error);
            return;
          } else if (fileName !== 'CollData.json' && (transengine || translatorName)) {
            logger.addLog('只有当输入数据文件名为MTool社区的CollData.json时，才允许修改引擎和翻译器名称', LogLevel.error);
            return;
          } else {
            const newConf = {
              fileName: fileName || Config.user.fileName.default,
              autoLoad: autoLoad || Config.user.autoLoad.default,
              translatorName: translatorName || Config.user.translatorName.default,
              transengine: transengine || Config.user.transengine.default,
              targetLang: targetLang || Config.user.targetLang.default,
            };
            onSaveCallback(newConf);
          }
          this.toggle();
        };
      }
    }, 0);
  }

  toggle() {
    this.isOpen = !this.isOpen;
    const displayMode = this.isOpen ? 'flex' : 'none';
    if (this.container) this.container.style.display = displayMode;
    if (logger.logElement) logger.logElement.style.display = displayMode;
  }

  createBtn(onClickCallback: () => void) {
    const btn = document.createElement('div');
    btn.className = 'local-translator-element';
    btn.innerHTML = '译';
    Object.assign(btn.style, {
      position: 'fixed', bottom: '20px', right: '20px',
      width: '40px', height: '40px', background: 'linear-gradient(35deg, #dbdbdb, #197dea)', opacity: '0.8',
      color: '#fff', borderRadius: '50%', textAlign: 'center',
      lineHeight: '40px', cursor: 'pointer', zIndex: '99999',
      fontSize: '14px', boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
      userSelect: 'none'
    });

    btn.onclick = onClickCallback;
    this.fragment?.appendChild(btn);
  }

  createInputElement(onChangeCallback: (e: Event) => void) {
    this.dom.input = document.createElement('input');
    this.dom.input.type = 'file';
    this.dom.input.accept = this.fileType.map(type => `.${type}`).join(',');
    this.dom.input.style.display = 'none';
    this.dom.input.className = 'local-translator-element';
    this.dom.input.onchange = onChangeCallback;
    this.fragment?.appendChild(this.dom.input);
  }

  createLeftBtn() {
    const leftBtn = document.createElement('div');
    leftBtn.className = 'local-translator-element';
    leftBtn.innerText = '译';
    Object.assign(leftBtn.style, {
      position: 'fixed', left: '0', bottom: '150px', opacity: '0.75',
      width: '30px', height: '60px', background: '#94c5fd',
      color: 'white', borderRadius: '0 8px 8px 0', textAlign: 'center',
      lineHeight: '60px', cursor: 'pointer', zIndex: '10001',
      fontSize: '14px', boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
      userSelect: 'none', transition: 'background 0.2s'
    });

    leftBtn.onmouseover = () => { leftBtn.style.background = '#7fb5f0'; };
    leftBtn.onmouseout = () => { leftBtn.style.background = '#94c5fd'; };
    leftBtn.onclick = this.toggle.bind(this);
    this.fragment?.appendChild(leftBtn);
  }

  destroy() {
    LocalTranslatorUtil.clearScripts();
    logger.destroy();
    if (this.fragment) {
      this.fragment = null;
    }
    if (this.dom) {
      (Object.keys(this.dom) as (keyof LocalTranslatorDOM)[]).forEach(key => {
        this.dom[key] = null;
      });
    }
  }
}
export default LocalTranslatorUI;