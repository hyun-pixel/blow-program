import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from 'electron';
import type { PocSnapshot } from '@blow/automation-core';

const ipcChannels = {
  start: 'poc:start',
  closeBrowser: 'poc:close-browser',
  state: 'poc:state',
} as const;

const blowPocApi = {
  start: () => ipcRenderer.invoke(ipcChannels.start),
  closeBrowser: () => ipcRenderer.invoke(ipcChannels.closeBrowser),
  onState: (listener: (snapshot: PocSnapshot) => void) => {
    const handler = (_event: IpcRendererEvent, snapshot: PocSnapshot): void => {
      listener(snapshot);
    };

    ipcRenderer.on(ipcChannels.state, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.state, handler);
    };
  },
};

contextBridge.exposeInMainWorld('blowPoc', blowPocApi);
