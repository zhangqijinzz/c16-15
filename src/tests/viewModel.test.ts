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

  it('blocks the ninth save instead of silently dropping the earliest variant', () => {
    vm.loadDemo();
    for (let i = 0; i < MAX_VARIANTS; i += 1) {
      vm.markSubject(i / 10, i / 10);
      vm.saveVariant();
    }
    const before = vm.getSnapshot().document.variants;
    expect(before).toHaveLength(MAX_VARIANTS);
    const firstId = before[0].id;

    vm.markSubject(0.9, 0.9);
    vm.saveVariant();

    const after = vm.getSnapshot().document.variants;
    expect(after).toHaveLength(MAX_VARIANTS);
    expect(after[0].id).toBe(firstId);
    expect(vm.getSnapshot().notice).toContain(String(MAX_VARIANTS));
  });

  it('assigns unique ids even when saving twice within the same millisecond', () => {
    vm.loadDemo();
    vm.saveVariant();
    vm.saveVariant();
    const ids = vm.getSnapshot().document.variants.map((variant) => variant.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('highlights only the variant selected by id, not geometrically identical siblings', () => {
    vm.loadDemo();
    vm.saveVariant();
    vm.saveVariant();
    const variants = vm.getSnapshot().document.variants;
    expect(variants[0].id).not.toBe(variants[1].id);
    vm.selectVariant(variants[0].id);
    expect(vm.getSnapshot().selectedVariantId).toBe(variants[0].id);
  });

  it('lets the user replace one variant and delete a variant to free a slot', () => {
    vm.loadDemo();
    for (let i = 0; i < MAX_VARIANTS; i += 1) {
      vm.markSubject(i / 10, i / 10);
      vm.saveVariant();
    }
    const target = vm.getSnapshot().document.variants[2];

    vm.replaceVariant(target.id);
    const replaced = vm.getSnapshot().document.variants;
    expect(replaced).toHaveLength(MAX_VARIANTS);
    expect(replaced.some((variant) => variant.id === target.id)).toBe(false);
    expect(vm.getSnapshot().selectedVariantId).toBe(replaced[2].id);

    vm.deleteVariant(replaced[2].id);
    expect(vm.getSnapshot().document.variants).toHaveLength(MAX_VARIANTS - 1);
    expect(vm.getSnapshot().selectedVariantId).toBeNull();

    vm.markSubject(0.5, 0.5);
    vm.saveVariant();
    expect(vm.getSnapshot().document.variants).toHaveLength(MAX_VARIANTS);
  });
});
