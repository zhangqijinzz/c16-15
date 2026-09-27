import { useState, useSyncExternalStore } from 'react';
import { cropForRatio, makeVariant, moveCrop, resizeCrop } from './domain';
import { EMPTY_DOCUMENT, MAX_VARIANTS, type CropVariant, type FrameDocument, type GuideKey, type Ratio, type ViewState } from './model';
import type { FrameRepository } from './repository';
import type { ImageService } from './service';

type Listener = () => void;

/** 同毫秒内连续保存也能拿到不同后缀，配合碰撞检测保证标识唯一。 */
let variantSequence = 0;

function createVariantId(existing: readonly CropVariant[]): string {
  let id: string;
  do {
    variantSequence = (variantSequence + 1) % Number.MAX_SAFE_INTEGER;
    id = `variant-${Date.now()}-${variantSequence.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  } while (existing.some((item) => item.id === id));
  return id;
}

export class FrameSenseViewModel {
  private state: ViewState = { phase: 'loading', document: structuredClone(EMPTY_DOCUMENT), compareOpen: false, notice: '', error: null, selectedVariantId: null };
  private readonly listeners = new Set<Listener>();

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

  private persist(document: FrameDocument, notice: string, selectedVariantId?: string | null): void {
    this.patch({ document, phase: 'editing', notice, error: null, ...(selectedVariantId !== undefined ? { selectedVariantId } : {}) });
    try {
      this.repository.save(document);
    } catch {
      this.patch({ phase: 'error', error: '本地保存失败，但当前编辑仍保留在页面中。请检查浏览器存储权限。' });
    }
  }

  async initialize(): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在恢复上次工作状态…', error: null });
    try {
      const document = this.repository.load();
      this.patch({ document, phase: document.image ? 'editing' : 'ready', notice: document.image ? '已恢复上次工作状态' : '欢迎来到 FrameSense，先载入示例或导入图片。' });
    } catch {
      this.patch({ phase: 'error', notice: '未能读取历史状态，可继续新建工作。', error: '本地数据读取失败。' });
    }
  }

  async importImage(file: File): Promise<void> {
    this.patch({ phase: 'loading', notice: '正在载入图片…', error: null });
    try {
      const image = await this.imageService.readFile(file);
      const document: FrameDocument = { ...structuredClone(EMPTY_DOCUMENT), image };
      this.persist(document, '图片已载入，可以开始构图。');
    } catch (error) {
      this.patch({ phase: 'error', error: error instanceof Error ? error.message : '图片载入失败。' });
    }
  }

  loadDemo(): void {
    this.persist({ ...structuredClone(EMPTY_DOCUMENT), image: this.imageService.demo() }, '示例图片已载入。');
  }

  toggleGuide(guide: GuideKey): void {
    const document = { ...this.state.document, guides: { ...this.state.document.guides, [guide]: !this.state.document.guides[guide] } };
    this.persist(document, '辅助层已更新。');
  }

  setRatio(ratio: Ratio): void {
    const image = this.state.document.image;
    if (!image) return;
    const crop = cropForRatio(ratio, image.width / image.height, this.state.document.crop);
    this.persist({ ...this.state.document, crop }, `${ratio === 'free' ? '自由' : ratio} 裁切已应用。`, null);
  }

  moveCrop(dx: number, dy: number): void {
    this.persist({ ...this.state.document, crop: moveCrop(this.state.document.crop, dx, dy) }, '裁切位置已调整。', null);
  }

  resizeCrop(width: number, height: number): void {
    this.persist({ ...this.state.document, crop: resizeCrop(this.state.document.crop, width, height) }, '裁切范围已调整。', null);
  }

  markSubject(x: number, y: number): void {
    this.persist({ ...this.state.document, subject: { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) } }, '主体标记已更新。');
  }

  saveVariant(): void {
    const { variants } = this.state.document;
    if (variants.length >= MAX_VARIANTS) {
      this.patch({ notice: `最多只能保存 ${MAX_VARIANTS} 个裁切方案。请先删除一个方案，或在对应方案上选择「替换」后再保存。` });
      return;
    }
    const id = createVariantId(variants);
    const variant = makeVariant(this.state.document.crop, id);
    const document = { ...this.state.document, variants: [...variants, variant] };
    this.persist(document, `已保存裁切方案 ${document.variants.length}/${MAX_VARIANTS}。`, id);
  }

  /** 上限已满时由用户显式选择某个方案，用当前裁切替换它。 */
  replaceVariant(id: string): void {
    const index = this.state.document.variants.findIndex((item) => item.id === id);
    if (index === -1) return;
    const newId = createVariantId(this.state.document.variants);
    const variant = makeVariant(this.state.document.crop, newId);
    const variants = this.state.document.variants.map((item) => (item.id === id ? variant : item));
    const document = { ...this.state.document, variants };
    this.persist(document, `已用当前裁切替换方案 ${index + 1}/${MAX_VARIANTS}。`, newId);
  }

  deleteVariant(id: string): void {
    const index = this.state.document.variants.findIndex((item) => item.id === id);
    if (index === -1) return;
    const variants = this.state.document.variants.filter((item) => item.id !== id);
    const document = { ...this.state.document, variants };
    const notice = `已删除方案 ${index + 1}，现有 ${variants.length}/${MAX_VARIANTS} 个方案。`;
    this.persist(document, notice, this.state.selectedVariantId === id ? null : undefined);
  }

  selectVariant(id: string): void {
    const variant = this.state.document.variants.find((item) => item.id === id);
    if (!variant) return;
    this.persist({ ...this.state.document, crop: { ...variant, id: 'current' } }, '已切换到保存的裁切方案。', id);
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
