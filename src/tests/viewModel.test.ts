import { beforeEach, describe, expect, it } from 'vitest';
import { FrameSenseViewModel } from '../viewModel';
import { EMPTY_DOCUMENT, MAX_VARIANTS, type FrameDocument, type ImageAsset } from '../model';
import type { FrameRepository } from '../repository';
import type { ImageService } from '../service';

class MemoryRepository implements FrameRepository {
  document: FrameDocument = structuredClone(EMPTY_DOCUMENT);
  fail = false;
  load() { return structuredClone(this.document); }
  save(document: FrameDocument) { if (this.fail) throw new Error('no storage'); this.document = structuredClone(document); }
}

class FakeImageService implements ImageService {
  asset: ImageAsset = { src: 'data:image/svg+xml,test', width: 1200, height: 800, name: 'test.svg' };
  readFile() { return Promise.resolve(this.asset); }
  demo() { return this.asset; }
}

describe('FrameSenseViewModel', () => {
  let repository: MemoryRepository;
  let vm: FrameSenseViewModel;
  beforeEach(() => { repository = new MemoryRepository(); vm = new FrameSenseViewModel(repository, new FakeImageService()); });

  it('initializes empty and loads a demo image', async () => {
    await vm.initialize();
    expect(vm.getSnapshot().phase).toBe('ready');
    vm.loadDemo();
    expect(vm.getSnapshot().document.image?.name).toBe('test.svg');
    expect(repository.document.image).not.toBeNull();
  });

  it('updates guides, subject, ratio, and variants', () => {
    vm.loadDemo();
    vm.toggleGuide('center');
    vm.markSubject(0.2, 0.8);
    vm.setRatio('1:1');
    vm.saveVariant();
    expect(vm.getSnapshot().document.guides.center).toBe(true);
    expect(vm.getSnapshot().document.subject).toEqual({ x: 0.2, y: 0.8 });
    expect(vm.getSnapshot().document.crop.ratio).toBe('1:1');
    expect(vm.getSnapshot().document.variants).toHaveLength(1);
  });

  it('keeps edits in memory and reports persistence failure', () => {
    repository.fail = true;
    vm.loadDemo();
    expect(vm.getSnapshot().phase).toBe('error');
    expect(vm.getSnapshot().document.image).not.toBeNull();
    expect(vm.getSnapshot().error).toContain('本地保存失败');
  });

  it('assigns unique ids even when saving twice in the same millisecond', () => {
    vm.loadDemo();
    vm.saveVariant();
    vm.saveVariant();
    const { variants } = vm.getSnapshot().document;
    expect(variants).toHaveLength(2);
    expect(variants[0].id).not.toBe(variants[1].id);
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(2);
  });

  it(`blocks saving beyond ${MAX_VARIANTS} and prompts the user instead of dropping variants`, () => {
    vm.loadDemo();
    for (let i = 0; i < MAX_VARIANTS; i += 1) {
      vm.moveCrop(0.01, 0);
      vm.saveVariant();
    }
    const existing = vm.getSnapshot().document.variants;
    expect(existing).toHaveLength(MAX_VARIANTS);

    vm.saveVariant();
    const state = vm.getSnapshot();
    // 一条都没少：最早保存的方案依然在
    expect(state.document.variants.map((variant) => variant.id)).toEqual(existing.map((variant) => variant.id));
    expect(state.replacePickerOpen).toBe(true);
    expect(state.notice).toContain(String(MAX_VARIANTS));
  });

  it('replaces the chosen variant and leaves the others untouched', () => {
    vm.loadDemo();
    vm.resizeCrop(0.5, 0.5);
    for (let i = 0; i < MAX_VARIANTS; i += 1) {
      vm.moveCrop(0.01, 0);
      vm.saveVariant();
    }
    const before = vm.getSnapshot().document.variants;
    const target = before[2];
    const others = before.filter((variant) => variant.id !== target.id);

    vm.moveCrop(0.05, 0.05);
    vm.saveVariant();
    vm.replaceVariant(target.id);

    const after = vm.getSnapshot().document.variants;
    expect(after).toHaveLength(MAX_VARIANTS);
    expect(after[2].id).toBe(target.id);
    expect(after[2].x).not.toBe(target.x);
    for (const other of others) {
      expect(after.find((variant) => variant.id === other.id)).toEqual(other);
    }
    expect(vm.getSnapshot().replacePickerOpen).toBe(false);
  });

  it('deletes a variant so the freed slot can be saved as a new independent variant', () => {
    vm.loadDemo();
    for (let i = 0; i < MAX_VARIANTS; i += 1) {
      vm.moveCrop(0.01, 0);
      vm.saveVariant();
    }
    const removed = vm.getSnapshot().document.variants[3];

    vm.saveVariant();
    expect(vm.getSnapshot().replacePickerOpen).toBe(true);
    vm.deleteVariant(removed.id);
    expect(vm.getSnapshot().document.variants).toHaveLength(MAX_VARIANTS - 1);
    vm.saveVariant();

    const { variants } = vm.getSnapshot().document;
    expect(variants).toHaveLength(MAX_VARIANTS);
    expect(variants.some((variant) => variant.id === removed.id)).toBe(false);
    expect(new Set(variants.map((variant) => variant.id)).size).toBe(MAX_VARIANTS);
    expect(vm.getSnapshot().replacePickerOpen).toBe(false);
  });

  it('highlights only the selected variant by id, even when crops share coordinates', () => {
    vm.loadDemo();
    vm.saveVariant();
    vm.saveVariant();
    const [first, second] = vm.getSnapshot().document.variants;
    expect(first.x).toBe(second.x);

    vm.selectVariant(second.id);
    expect(vm.getSnapshot().selectedVariantId).toBe(second.id);

    vm.deleteVariant(second.id);
    expect(vm.getSnapshot().selectedVariantId).toBeNull();
  });

  it('clears selection highlight once the crop is edited away from the saved variant', () => {
    vm.loadDemo();
    vm.saveVariant();
    const saved = vm.getSnapshot().document.variants[0];
    vm.selectVariant(saved.id);
    expect(vm.getSnapshot().selectedVariantId).toBe(saved.id);
    vm.moveCrop(0.02, 0);
    expect(vm.getSnapshot().selectedVariantId).toBeNull();
  });
});
