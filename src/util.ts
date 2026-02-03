class LocalTranslatorUtil {
  static oriFetch = window.fetch;

  static async saveJSONFile(jsonData: Record<string, any>, fileName: string) {
    const jsonString = JSON.stringify(jsonData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${fileName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static getFileType(fileName: string) {
    return fileName.split('.').pop();
  }
  static checkNodeJS() {
    return typeof module !== 'undefined' && module.exports;
  }

  static getNodeJSMoudle(moduleName: string) {
    if (LocalTranslatorUtil.checkNodeJS()) {
      return require(moduleName);
    }
    return undefined;
  }

  static saveFile(data: any, fileName: string, mimeType = 'application/json') {
    let downloadData;
    const dataType = LocalTranslatorUtil.getFileType(fileName);
    if (dataType === 'csv') {
      mimeType = 'text/csv';
      downloadData = JSON.stringify(data);
    } else {
      downloadData = JSON.stringify(data, null, 2);
    }
    const blob = new Blob([downloadData], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static async getPath(fileName: string) {
    if (LocalTranslatorUtil.checkNodeJS()) {
      let path = await getGameCWD();
      if (path) {
        return `${path}/${fileName}`;
      } else {
        const path = require('path');
        return path.join(__dirname, `./${fileName}`);
      }
    }
    return fileName;
  }

  static async requestSource(url: string, headers?: RequestInit, callback?: (response: Response) => any) {
    let response = await LocalTranslatorUtil.oriFetch(url, headers);
    if (response.ok) {
      if (typeof callback === 'function') {
        response = callback(response);
      }
      return response;
    } else {
      throw new Error('Error loading  file:' + url);
    }
  }

  static async getCsvFileData(url: string, callback?: (csvContent: Response) => any) {
    const csvContent = await LocalTranslatorUtil.requestSource(url, {
      method: 'GET',
      headers: { 'Content-Type': 'text/csv' }
    });
    if (typeof callback === 'function') {
      return callback(csvContent);
    }
    return csvContent;
  }

  static async getJSONFileData(url: string, callback?: (jsonData: Record<string, any>) => any) {
    return await LocalTranslatorUtil.requestSource(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' }
    }, async (respnse) => {
      const data = await respnse.json();
      if (typeof callback === 'function') {
        return callback(data);
      }
      return data;
    });
  }

  static insetScript(script: string, id = '.local-translator-element') {
    let scriptElement = document.createElement('script');
    scriptElement.text = script.toString();
    scriptElement.type = 'text/javascript';
    switch (id[0]) {
      case '.':
        scriptElement.classList.add(id.slice(1));
        break;
      case '#':
        scriptElement.id = id.slice(1);
        break;
      default:
        scriptElement.classList.add('local-translator-element');
    }
    document.body.appendChild(scriptElement);
  }

  static parseRegex(str: string) {
    if (typeof str !== 'string') return str;
    const m = str.match(/^\/(.*)\/([gimsuy]*)$/);
    return m ? new RegExp(m[1], m[2]) : str;
  }

  static clearScripts(id = '.local-translator-element') {
    document.querySelectorAll(id).forEach(element => element.remove());
  }

  static parseCSV(csvContent: string) {
    const rows = [];
    const lines = csvContent.split(/\r?\n/);
    for (let line of lines) {
      if (!line.trim()) continue;
      const values = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
      rows.push(values.map(v => v.replace(/^"|"$/g, '').trim()));
    }
    return rows;
  }
}
export default LocalTranslatorUtil;