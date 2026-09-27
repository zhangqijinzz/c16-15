import { useState, useSyncExternalStore } from 'react';
import { cropForRatio, makeVariant, moveCrop, resizeCrop } from './domain';
import { EMPTY_DOCUMENT, MAX_VARIANTS, type FrameDocument, type GuideKey, type Ratio, type ViewState } from './model';
import type { FrameRepository } from './repository';
import type { ImageService } from './service';

type Listener = () => void;

export class FrameSenseViewModel {
  private state: ViewState = { phase: 'loading', document: structuredClone(EMPTY_DOCUMENT), compareOpen: false, replacePickerOpen: false, selectedVariantId: null, notice: '', error: null };
  private readonly listeners = new Set<Listener>();
  private variantSequence = 0;

  constructor(private readonly repository: FrameRepository, private readonly imageService: ImageService) {}

  getSnapshot = (): ViewState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private patch(next: Partial<ViewState>): void {
    this.state = { ...this.state, ...next };
    this.listeners.forEach((listener) => listener());
  }

  private persist(document: FrameDocument, notice: string, extra: Partial<ViewState> = {}): void {
    this.patch({ document, phase: 'editing', notice, error: null, ...extra });
    try {
      this.repository.save(document);
    } catch {
      this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
    }
  }

  // 同一毫秒内连续调用也会得到不同标识，并避开已存在（含历史恢复）的标识
  private nextVariantId(): string {
    const existing = new Set(this.state.document.variants.map((variant) => variant.id));
    let id: string;
    do {
      this.variantSequence += 1;
      id = `variant-${Date.now()}-${this.variantSequence}`;
    } while (existing.has(id));
    return id;
  }

  async initialize(): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在恢复上次工作状态…', error: null });
    try {
      const document = this.repository.load();
      this.patch({ document, phase: document.image ? 'editing' : 'ready', notice: document.image ? '已恢复上次工作状态' : '欢迎来到 FrameSense，先载入示例或导入图片。', replacePickerOpen: false, selectedVariantId: null });
    } catch {
      this.patch({ phase: 'error', notice: '未能读取历史状态，可继续新建工作。', error: '本地数据读取失败。' });
    }
  }

  async importImage(file: File): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在载入图片…', error: null });
    try {
      const image = await this.imageService.readFile(file);
      const document: FrameDocument = { ...structuredClone(EMPTY_DOCUMENT), image };
      this.persist(document, '图片已载入，可以开始构图。', { replacePickerOpen: false, selectedVariantId: null });
    } catch (error) {
      this.patch({ phase: 'error', error: error instanceof Error ? error.message : '图片载入失败。' });
    }
  }

  loadDemo(): void {
    this.persist({ ...structuredClone(EMPTY_DOCUMENT), image: this.imageService.demo() }, '示例图片已载入。', { replacePickerOpen: false, selectedVariantId: null });
  }

  toggleGuide(guide: GuideKey): void {
    const document = { ...this.state.document, guides: { ...this.state.document.guides, [guide]: !this.state.document.guides[guide] } };
    this.persist(document, '辅助层已更新。');
  }

  setRatio(ratio: Ratio): void {
    const image = this.state.document.image;
    if (!image) return;
    const crop = cropForRatio(ratio, image.width / image.height, this.state.document.crop);
    this.persist({ ...this.state.document, crop }, `${ratio === 'free' ? '自由' : ratio} 裁切已应用。`, { selectedVariantId: null });
  }

  moveCrop(dx: number, dy: number): void {
    this.persist({ ...this.state.document, crop: moveCrop(this.state.document.crop, dx, dy) }, '裁切位置已调整。', { selectedVariantId: null });
  }

  resizeCrop(width: number, height: number): void {
    this.persist({ ...this.state.document, crop: resizeCrop(this.state.document.crop, width, height) }, '裁切范围已调整。', { selectedVariantId: null });
  }

  markSubject(x: number, y: number): void {
    this.persist({ ...this.state.document, subject: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }, '主体标记已更新。');
  }

  saveVariant(): void {
    // 达到上限时拦截，由用户决定替换哪一个或先删除，绝不后台丢弃
    if (this.state.document.variants.length >= MAX_VARIANTS) {
      this.patch({ replacePickerOpen: true, notice: `最多只能保存 ${MAX_VARIANTS} 个裁切方案，请替换其中一个或先删除后再保存。` });
      return;
    }
    const variant = makeVariant(this.state.document.crop, this.nextVariantId());
    const document = { ...this.state.document, variants: [...this.state.document.variants, variant] };
    this.persist(document, `已保存裁切方案 ${document.variants.length}/${MAX_VARIANTS}。`, { replacePickerOpen: false, selectedVariantId: variant.id });
  }

  replaceVariant(id: string): void {
    const index = this.state.document.variants.findIndex((item) => item.id === id);
    if (index === -1) return;
    // 沿用被替换方案的位置与标识，其余方案不受影响
    const variant = makeVariant(this.state.document.crop, id);
    const variants = [...this.state.document.variants];
    variants[index] = variant;
    this.persist({ ...this.state.document, variants }, `已替换裁切方案 ${index + 1}。`, { replacePickerOpen: false, selectedVariantId: id });
  }

  deleteVariant(id: string): void {
    const removedIndex = this.state.document.variants.findIndex((item) => item.id === id);
    if (removedIndex === -1) return;
    const variants = this.state.document.variants.filter((item) => item.id !== id);
    const document = { ...this.state.document, variants };
    const wasSelected = this.state.selectedVariantId === id;
    const notice = `已删除裁切方案 ${removedIndex + 1}，现有 ${variants.length}/${MAX_VARIANTS} 个。`;
    this.persist(document, notice, { selectedVariantId: wasSelected ? null : this.state.selectedVariantId });
  }

  closeReplacePicker(): void {
    this.patch({ replacePickerOpen: false });
  }

  selectVariant(id: string): void {
    const variant = this.state.document.variants.find((item) => item.id === id);
    if (!variant) return;
    this.persist({ ...this.state.document, crop: { ...variant, id: 'current' } }, '已切换到保存的裁切方案。', { selectedVariantId: id });
  }

  toggleCompare(): void {
    this.patch({ compareOpen: !this.state.compareOpen });
  }
}

export function useFrameSenseViewModel(repository: FrameRepository, imageService: ImageService): [FrameSenseViewModel, ViewState] {
  const [viewModel] = useState(() => new FrameSenseViewModel(repository, imageService));
  const state = useSyncExternalStore(viewModel.subscribe, viewModel.getSnapshot, viewModel.getSnapshot);
  return [viewModel, state];
}
