import type { CropVariant, ImageAsset } from '../model';
import { MAX_VARIANTS } from '../model';

interface ReplaceVariantDialogProps {
  variants: CropVariant[];
  image: ImageAsset;
  onReplace: (id: string) => void;
  onDelete: (id: string) => void;
  onSaveNew: () => void;
  onClose: () => void;
}

export function ReplaceVariantDialog({ variants, image, onReplace, onDelete, onSaveNew, onClose }: ReplaceVariantDialogProps) {
  const hasFreeSlot = variants.length < MAX_VARIANTS;
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="replace-dialog-title" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-heading">
          <div>
            <p className="eyebrow">LIMIT REACHED · {variants.length}/{MAX_VARIANTS}</p>
            <h3 id="replace-dialog-title">方案已达上限（{MAX_VARIANTS} 个）</h3>
            <p>请选择一个已有方案进行替换，或删除后再保存。已有方案不会被自动丢弃。</p>
          </div>
          <button className="dialog-close" aria-label="关闭" onClick={onClose}>×</button>
        </div>
        <div className="dialog-list">
          {variants.map((variant, index) => (
            <div className="dialog-row" key={variant.id}>
              <span className="variant-thumb"><img src={image.src} alt="" style={{ objectPosition: `${variant.x * 100}% ${variant.y * 100}%` }} /></span>
              <span className="dialog-row-meta"><strong>方案 {String(index + 1).padStart(2, '0')}</strong><small>{variant.ratio === 'free' ? '自由裁切' : variant.ratio} · {Math.round(variant.width * 100)}% × {Math.round(variant.height * 100)}%</small></span>
              <button className="dialog-replace" onClick={() => onReplace(variant.id)}>替换为此方案</button>
              <button className="dialog-delete" aria-label={`删除方案 ${index + 1}`} onClick={() => onDelete(variant.id)}>删除</button>
            </div>
          ))}
        </div>
        <div className="dialog-footer">
          <span>{hasFreeSlot ? `已腾出空位（${variants.length}/${MAX_VARIANTS}），可直接保存为新方案。` : `当前 ${variants.length}/${MAX_VARIANTS}，没有空位。`}</span>
          <div>
            <button className="quiet-button" onClick={onClose}>取消</button>
            <button className="save-button" disabled={!hasFreeSlot} onClick={onSaveNew}>保存为新方案</button>
          </div>
        </div>
      </div>
    </div>
  );
}
