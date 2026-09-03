import {
  contextBridge,
  ipcRenderer,
  type IpcRendererEvent,
} from 'electron';
import type { PocSnapshot } from '@blow/automation-core';
import type { NaverConnectionStatus } from '@blow/naver-adapter';

type NaverStateResponse =
  | {
      readonly ok: true;
      readonly status: NaverConnectionStatus;
    }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: string;
        readonly message: string;
      };
    };

const ipcChannels = {
  mockStart: 'poc:start',
  mockCloseBrowser: 'poc:close-browser',
  mockState: 'poc:state',
  naverOpen: 'naver:open',
  naverState: 'naver:state',
  naverVerify: 'naver:verify',
  naverOpenWriter: 'naver:open-writer',
  naverClose: 'naver:close',
  naverFocus: 'naver:focus',
} as const;

const blowPocApi = {
  start: () => ipcRenderer.invoke(ipcChannels.mockStart),
  closeBrowser: () => ipcRenderer.invoke(ipcChannels.mockCloseBrowser),
  onState: (listener: (snapshot: PocSnapshot) => void) => {
    const handler = (_event: IpcRendererEvent, snapshot: PocSnapshot): void => {
      listener(snapshot);
    };

    ipcRenderer.on(ipcChannels.mockState, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.mockState, handler);
    };
  },
};

const blowNaverApi = {
  open: (blogUrl: string) => ipcRenderer.invoke(
    ipcChannels.naverOpen,
    blogUrl,
  ),
  onState: (listener: (response: NaverStateResponse) => void) => {
    const handler = (
      _event: IpcRendererEvent,
      response: NaverStateResponse,
    ): void => {
      listener(response);
    };

    ipcRenderer.on(ipcChannels.naverState, handler);

    return () => {
      ipcRenderer.removeListener(ipcChannels.naverState, handler);
    };
  },
  verify: () => ipcRenderer.invoke(ipcChannels.naverVerify),
  openWriter: () => ipcRenderer.invoke(ipcChannels.naverOpenWriter),
  focus: () => ipcRenderer.invoke(ipcChannels.naverFocus),
  close: () => ipcRenderer.invoke(ipcChannels.naverClose),
};

contextBridge.exposeInMainWorld('blowPoc', blowPocApi);
contextBridge.exposeInMainWorld('blowNaver', blowNaverApi);
