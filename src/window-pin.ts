import { Notice, Platform } from 'obsidian';

/**
 * Always-on-top needs an Electron BrowserWindow handle (@electron/remote), which would force
 * isDesktopOnly and drop mobile support. The titlebar control is therefore not mounted and the
 * command explains why, instead of failing silently.
 */
export class WindowPin {
  attach(_doc:Document):void { /* Requires desktop-only native window APIs; intentionally inert. */ }
  toggle(_doc:Document):void {
    new Notice(Platform.isDesktopApp
      ? '窗口置顶需要 Electron 原生窗口接口；当前构建以兼容移动端为先，已停用该功能。'
      : '窗口置顶仅在桌面端可用。');
  }
  destroy():void { /* nothing to release */ }
}
