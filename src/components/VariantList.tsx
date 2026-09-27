import { MAX_VARIANTS, type CropVariant, type ImageAsset } from '../model';

interface VariantListProps {
  variants: CropVariant[];
  image: ImageAsset;
  selectedId: string | null;
  onSave: () => void;
  onSelect: (id: string) => void;
  onReplace: (id: string) => void;
  onDelete: (id: string) => void;
}

export function VariantList({ variants, image, selectedId, onSave, onSelect, onReplace, onDelete }: VariantListProps) {
  const limitReached = variants.length >= MAX_VARIANTS;
  return (
    <section className="variants-panel">
      <div className="panel-heading"><div><p className="eyebrow">SAVED FRAMES</p><h3>裁切方案 <span className={limitReached ? 'count-full' : ''}>{variants.length}/{MAX_VARIANTS}</span></h3></div><button className="save-button" onClick={onSave} disabled={limitReached} aria-disabled={limitReached} title={limitReached ? `已达上限 ${MAX_VARIANTS} 个，请先删除或替换` : '保存当前裁切'}>保存当前</button></div>
      {limitReached && <div className="variant-limit" role="alert">已达上限 {MAX_VARIANTS} 个。新方案不会自动顶替；请先删除一个，或在对应方案上点「替换」。</div>}
      {variants.length === 0 ? <div className="variant-empty"><span>◇</span><p>还没有保存的方案</p><small>调整画框后保存，最多保留 {MAX_VARIANTS} 个方案。</small></div> : <div className="variant-list">{variants.map((variant, index) => <div className={`variant-card ${selectedId === variant.id ? 'selected' : ''}`} key={variant.id}><button type="button" className="variant-select" onClick={() => onSelect(variant.id)}><span className="variant-thumb"><img src={image.src} alt="" style={{ objectPosition: `${variant.x * 100}% ${variant.y * 100}%` }} /></span><span className="variant-meta"><strong>方案 {String(index + 1).padStart(2, '0')}</strong><small>{variant.ratio === 'free' ? '自由裁切' : variant.ratio} · {Math.round(variant.width * 100)}%</small></span><em>→</em></button><span className="variant-actions"><button type="button" className="variant-action" title="用当前裁切替换此方案" onClick={() => onReplace(variant.id)}>替换</button><button type="button" className="variant-action variant-delete" title="删除此方案" onClick={() => onDelete(variant.id)}>删除</button></span></div>)}</div>}
      <div className="variant-tip"><span>✦</span><p>建议保存至少 3 个版本：<br />保守、平衡、实验性。</p></div>
    </section>
  );
}
