import { Editor, MarkdownView } from 'obsidian';
import type PrismPlugin from './main';

/**
 * Live Preview keeps a fenced code block inside the note's single CodeMirror scroller.
 * A long block therefore makes the whole note tall, and the only way to move through it
 * was the note scrollbar. Grabbing that bar (or clicking beside it) blurs the editor,
 * which makes Obsidian swap the open code block back to its rendered widget: the caret
 * position is lost and the block animates back to its preview.
 *
 * This adds a scrollbar that belongs to the code block itself. It drives the same
 * scroller programmatically, so dragging it never moves focus and never collapses the
 * block. Geometry comes from CodeMirror's line blocks (document coordinates), not from
 * guessing with rendered DOM, so it stays correct while the block is scrolled.
 */

type LineBlock = { top: number; bottom: number; height: number };
type CmView = {
  scrollDOM: HTMLElement;
  contentDOM: HTMLElement;
  lineBlockAt(pos: number): LineBlock;
  state: { doc: { line(n: number): { from: number; to: number; length: number } } };
};

export type Fence = { start: number; end: number; lang: string };

const clamp = (value: number, min = 0, max = 1): number => Math.max(min, Math.min(max, value));

/** The fenced block that contains `line`, or null when the line sits in ordinary text. */
export function fenceAt(editor: Editor, line: number): Fence | null {
  const total = editor.lineCount();
  let open = -1;
  let marker = '';
  let lang = '';
  for (let i = 0; i < total; i++) {
    const text = editor.getLine(i) || '';
    const match = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(text);
    if (open < 0) {
      if (match) { open = i; marker = match[1]; lang = match[2] || ''; }
      continue;
    }
    // A closing fence uses the same character, is at least as long, and carries no info string.
    if (match && match[1][0] === marker[0] && match[1].length >= marker.length && !match[2]) {
      if (line >= open && line <= i) return { start: open, end: i, lang };
      open = -1; marker = ''; lang = '';
    }
  }
  // An unterminated block still contains the caret when it starts above it.
  if (open >= 0 && line >= open) return { start: open, end: Math.min(total - 1, line), lang };
  return null;
}

export class CodeBlockScroller {
  private el: HTMLElement;
  private track: HTMLElement;
  private thumb: HTMLElement;
  private label: HTMLElement;
  private frame = 0;
  private dragging = false;
  private dragOffset = 0;
  private cleanup: (() => void)[] = [];
  private win: Window;
  private scroller: HTMLElement | null = null;
  private content: HTMLElement | null = null;
  private range = { top: 0, bottom: 0 };
  private rows = 0;
  private lang = '';
  private timer = 0;
  constructor(private plugin: PrismPlugin, private doc: Document) {
    this.win = doc.defaultView!;
    // A detached node must be built with createElement: doc.createDiv() would try to append
    // it to the Document and throw "Only one element on document allowed".
    this.el = doc.createElement('div');
    this.el.className = 'prism-code-scroll';
    this.el.hidden = true;
    this.el.setAttribute('role', 'scrollbar');
    this.el.setAttribute('aria-orientation', 'vertical');
    this.el.setAttribute('aria-label', '代码块滚动条');
    this.el.setAttribute('aria-valuemin', '0');
    this.el.setAttribute('aria-valuemax', '100');
    this.track = doc.createElement('div');
    this.track.className = 'prism-code-scroll-track';
    this.thumb = doc.createElement('div');
    this.thumb.className = 'prism-code-scroll-thumb';
    this.label = doc.createElement('div');
    this.label.className = 'prism-code-scroll-label';
    this.track.appendChild(this.thumb);
    this.el.appendChild(this.track);
    this.el.appendChild(this.label);
    doc.body.appendChild(this.el);
    this.listen(this.el, 'pointerdown', event => this.startDrag(event as PointerEvent));
    this.listen(this.el, 'mousedown', event => { event.preventDefault(); event.stopPropagation(); });
    this.listen(this.el, 'wheel', event => this.onWheel(event as WheelEvent), { passive: false });
    this.listen(this.win, 'pointermove', event => { if (this.dragging) this.moveTo(event as PointerEvent); });
    this.listen(this.win, 'pointerup', () => this.endDrag());
    this.listen(this.win, 'pointercancel', () => this.endDrag());
    this.listen(this.win, 'resize', () => this.schedule());
    this.listen(doc, 'scroll', () => this.schedule(), true);
    this.listen(doc, 'selectionchange', () => this.throttle());
  }
  private listen(target: EventTarget, type: string, fn: EventListener, options?: boolean | AddEventListenerOptions): void {
    target.addEventListener(type, fn, options as EventListenerOptions);
    this.cleanup.push(() => target.removeEventListener(type, fn, options as EventListenerOptions));
  }
  /** Cheap gate so typing does not re-scan the document on every keystroke. */
  private throttle(): void {
    if (this.timer || this.dragging) return;
    this.timer = this.win.setTimeout(() => { this.timer = 0; this.update(); }, 90);
  }
  private schedule(): void {
    if (this.frame) return;
    this.frame = this.win.requestAnimationFrame(() => { this.frame = 0; this.paint(); });
  }
  private hide(): void {
    this.el.hidden = true;
    this.scroller = null;
    this.content = null;
    this.doc.body.classList.remove('prism-code-scrolling');
  }
  update(): void {
    if (!this.plugin.data.settings.codeBlockScroll) return this.hide();
    const view = this.plugin.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view || view.getMode() !== 'source' || !view.file || !view.containerEl.isConnected) return this.hide();
    const cm = (view.editor as unknown as { cm?: CmView }).cm;
    if (!cm || !cm.scrollDOM || !cm.state?.doc) return this.hide();
    const fence = fenceAt(view.editor, view.editor.getCursor().line);
    const rows = fence ? fence.end - fence.start - 1 : 0;
    if (!fence || rows < 12) return this.hide();
    const doc = cm.state.doc;
    const start = cm.lineBlockAt(doc.line(fence.start + 1).from);
    const end = cm.lineBlockAt(doc.line(fence.end + 1).from);
    this.range = { top: start.top, bottom: end.bottom };
    this.rows = rows;
    this.lang = fence.lang;
    this.scroller = cm.scrollDOM;
    this.content = cm.contentDOM;
    this.paint();
  }
  private paint(): void {
    const scroller = this.scroller;
    if (!scroller || !scroller.isConnected || !this.content) return this.hide();
    const rect = scroller.getBoundingClientRect();
    const viewHeight = scroller.clientHeight;
    const blockHeight = this.range.bottom - this.range.top;
    const maxScroll = blockHeight - viewHeight;
    // Short blocks need no dedicated bar: the note scroller already shows all of them.
    if (viewHeight < 120 || blockHeight <= viewHeight + 32 || maxScroll < 60) return this.hide();
    const scrollTop = scroller.scrollTop;
    const visibleTop = Math.max(rect.top, rect.top + this.range.top - scrollTop);
    const visibleBottom = Math.min(rect.bottom, rect.top + this.range.bottom - scrollTop);
    const height = Math.round(visibleBottom - visibleTop);
    if (height < 90) return this.hide();
    const contentRect = this.content.getBoundingClientRect();
    // Sit just inside the text column, clear of the reading rail at the pane edge.
    const left = Math.round(Math.min(contentRect.right - 8, rect.right - 20));
    this.el.hidden = false;
    // Two identical bars side by side read as clutter: the outer rail steps back while
    // the caret works inside a block, and returns as soon as the block is left.
    this.doc.body.classList.add('prism-code-scrolling');
    this.el.style.left = `${left}px`;
    this.el.style.top = `${visibleTop + 8}px`;
    this.el.style.height = `${height - 16}px`;
    const trackHeight = height - 16;
    const thumbHeight = Math.max(30, Math.min(trackHeight, Math.round(trackHeight * viewHeight / blockHeight)));
    const travel = Math.max(1, trackHeight - thumbHeight);
    const ratio = clamp(maxScroll > 0 ? (scrollTop - this.range.top) / maxScroll : 0);
    this.thumb.style.height = `${thumbHeight}px`;
    this.thumb.style.transform = `translateY(${Math.round(ratio * travel)}px)`;
    this.el.setAttribute('aria-valuenow', String(Math.round(ratio * 100)));
    this.el.setAttribute('aria-valuetext', `${this.lang || 'code'} · ${this.rows} 行 · ${Math.round(ratio * 100)}%`);
    this.el.dataset.lines = String(this.rows);
    if (this.label.textContent !== `${this.lang || 'code'} · ${this.rows} 行`) this.label.textContent = `${this.lang || 'code'} · ${this.rows} 行`;
    this.el.classList.toggle('is-active', this.dragging);
  }
  private startDrag(event: PointerEvent): void {
    if (event.button !== 0 || !this.scroller) return;
    // Never take focus: a blurred editor collapses the open block back into its widget.
    event.preventDefault();
    event.stopPropagation();
    this.dragging = true;
    this.el.classList.add('is-dragging');
    const thumb = this.thumb.getBoundingClientRect();
    this.dragOffset = event.target === this.thumb ? event.clientY - thumb.top : thumb.height / 2;
    try { this.el.setPointerCapture(event.pointerId); } catch { /* Synthetic pointers in tests. */ }
    this.moveTo(event);
  }
  private moveTo(event: PointerEvent): void {
    const scroller = this.scroller;
    if (!scroller) return;
    const track = this.track.getBoundingClientRect();
    const thumbHeight = this.thumb.getBoundingClientRect().height;
    const travel = Math.max(1, track.height - thumbHeight);
    const ratio = clamp((event.clientY - track.top - this.dragOffset) / travel);
    const maxScroll = Math.max(0, this.range.bottom - this.range.top - scroller.clientHeight);
    scroller.scrollTop = this.range.top + ratio * maxScroll;
    this.paint();
  }
  private onWheel(event: WheelEvent): void {
    const scroller = this.scroller;
    if (!scroller || !event.deltaY) return;
    event.preventDefault();
    event.stopPropagation();
    scroller.scrollTop += event.deltaY;
    this.schedule();
  }
  private endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.el.classList.remove('is-dragging', 'is-active');
    try { this.el.releasePointerCapture?.(0); } catch { /* No capture was taken. */ }
    this.schedule();
  }
  destroy(): void {
    this.endDrag();
    this.cleanup.forEach(fn => fn());
    this.cleanup = [];
    this.doc.defaultView?.cancelAnimationFrame(this.frame);
    this.doc.defaultView?.clearTimeout(this.timer);
    this.el.remove();
  }
}
