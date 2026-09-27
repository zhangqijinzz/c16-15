import type { CropVariant, ImageAsset } from '../model';
import { MAX_VARIANTS } from '../model';

interface VariantListProps {
  variants: CropVariant[];
  image: ImageAsset;
  selectedVariantId: string | null;
  onSave: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function VariantList({ variants, image, selectedVariantId, onSave, onSelect, onDelete }: VariantListProps) {
  const isFull = variants.length >= MAX_VARIANTS;
  return (
    <section className="variants-panel">
      <div className="panel-heading"><div><p className="eyebrow">SAVED FRAMES</p><h3>裁切方案 <span>{variants.length}/{MAX_VARIANTS}</span></h3></div><button className="save-button" onClick={onSave} aria-disabled={isFull}>{isFull ? `已达上限 ${MAX_VARIANTS} 个` : '保存当前'}</button></div>
      {variants.length === 0 ? <div className="variant-empty"><span>◇</span><p>还没有保存的方案</p><small>调整画框后保存，比较不同构图取舍。最多可保存 {MAX_VARIANTS} 个。</small></div> : <div className="variant-list">{variants.map((variant, index) => <div className={`variant-card ${selectedVariantId === variant.id ? 'selected' : ''}`} key={variant.id}><button className="variant-main" onClick={() => onSelect(variant.id)}><span className="variant-thumb"><img src={image.src} alt="" style={{ objectPosition: `${variant.x * 100}% ${variant.y * 100}%` }} /></span><span><strong>方案 {String(index + 1).padStart(2, '0')}</strong><small>{variant.ratio === 'free' ? '自由裁切' : variant.ratio} · {Math.round(variant.width * 100)}%</small></span><em>→</em></button><button className="variant-delete" aria-label={`删除方案 ${index + 1}`} onClick={() => onDelete(variant.id)}>×</button></div>)}</div>}
      <div className="variant-tip"><span>✦</span><p>建议保存至少 3 个版本：<br />保守、平衡、实验性。</p></div>
    </section>
  );
}
