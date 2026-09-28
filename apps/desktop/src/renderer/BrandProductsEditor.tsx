import { LoaderCircle, Plus, Save, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { BrandProfile } from '../main/brand-profile.js';
import { getProductPrice, normalizeProductCatalog, parseProductOptions, type ProductPrices } from '../shared/product-services.js';

export function BrandProductsEditor({ userId, savedValue, savedPrices, profileReady, disabled, onBusyChange, onSaved }: {
  readonly userId: string;
  readonly savedValue: string;
  readonly savedPrices: ProductPrices;
  readonly profileReady: boolean;
  readonly disabled: boolean;
  readonly onBusyChange: (busy: boolean) => void;
  readonly onSaved: (profile: BrandProfile) => void;
}) {
  const sequence = useRef(0);
  const [rows, setRows] = useState([{ id: 0, value: '', price: '' }]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const fields = useRef<HTMLFieldSetElement>(null);

  const savedPricesJson = JSON.stringify(savedPrices);
  useEffect(() => {
    const items = parseProductOptions(savedValue);
    const prices = JSON.parse(savedPricesJson) as ProductPrices;
    setRows((items.length ? items : ['']).map((value) => ({ id: ++sequence.current, value, price: getProductPrice(prices, value) })));
    setDirty(false);
  }, [savedValue, savedPricesJson]);

  const changed = (): void => { setDirty(true); setError(null); setNotice(null); };
  const focusRow = (id: number): void => {
    requestAnimationFrame(() => document.getElementById(`brand-product-${id}`)?.focus());
  };

  const save = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (disabled || saving || !profileReady) return;
    try {
      normalizeProductCatalog(rows.map((row) => ({ name: row.value, price: row.price })));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '상품·서비스 목록을 확인해 주세요.');
      setNotice(null);
      const invalid = rows.find((row) => !row.value.trim() || row.value.length > 200 || row.price.length > 80);
      if (invalid) focusRow(invalid.id);
      else fields.current?.querySelector('input')?.focus();
      return;
    }
    setSaving(true);
    onBusyChange(true);
    setError(null);
    setNotice(null);
    try {
      const response = await window.blowBrandProfile.saveProducts(userId, rows.map((row) => ({ name: row.value, price: row.price })));
      if (!response.ok || !response.profile) {
        setError(response.ok ? '상품·서비스를 저장하지 못했습니다.' : response.error.message);
        return;
      }
      onSaved(response.profile);
      setDirty(false);
      setNotice('상품·서비스 목록을 저장했습니다. 새 글 작성에서 바로 선택할 수 있습니다.');
    } catch {
      setError('저장하지 못했습니다. 입력한 목록은 유지됩니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setSaving(false);
      onBusyChange(false);
    }
  };

  return (
    <section className="brand-products-panel" aria-labelledby="brand-products-heading" aria-busy={saving}>
      <header className="panel-heading brand-category-heading">
        <div>
          <h2 id="brand-products-heading" tabIndex={-1}>주요 상품·서비스</h2>
          <p>한 항목씩 등록하고 이 목록만 따로 저장하세요. 새 글 작성의 ‘상품·서비스’ 선택 목록에 연결됩니다.</p>
        </div>
      </header>
      <form className="connection-form" noValidate onSubmit={(event) => void save(event)}>
        <p id="brand-products-help" className="field-help">서비스명은 필수이며 가격은 비워 두어도 됩니다. 서비스명은 항목당 200자, 전체 1,500자까지 입력할 수 있습니다.</p>
        {!profileReady ? <p className="field-help">처음에는 위의 필수 사항을 입력하고 화면 아래의 ‘블로그 세팅 저장’을 눌러 주세요. 그다음 이 목록만 따로 저장할 수 있습니다.</p> : null}
        <fieldset ref={fields} className="brand-product-fields" disabled={disabled || saving} aria-label="저장할 상품·서비스 목록" aria-describedby="brand-products-help">
          <div className="brand-product-list">
            {rows.map((row, index) => (
              <div className="brand-product-row" key={row.id} role="group" aria-labelledby={`brand-product-title-${row.id}`}>
                <h3 id={`brand-product-title-${row.id}`}>상품·서비스 {index + 1}</h3>
                <div className="field-group">
                  <label htmlFor={`brand-product-${row.id}`}>서비스명<span>필수</span></label>
                  <div className="brand-product-input">
                    <input id={`brand-product-${row.id}`} value={row.value} maxLength={200} required
                      placeholder="예: 실손보험 보장 점검" autoComplete="off"
                      onChange={(event) => {
                        const value = event.target.value;
                        setRows((current) => current.map((item) => item.id === row.id ? { ...item, value } : item));
                        changed();
                      }} />
                    <button className="button danger icon-only" type="button" disabled={rows.length === 1}
                      aria-label={`상품·서비스 ${index + 1} 삭제`} title="이 항목 삭제"
                      onClick={() => {
                        setRows((current) => current.filter((item) => item.id !== row.id));
                        changed();
                        const next = rows[index + 1] ?? rows[index - 1];
                        if (next) focusRow(next.id);
                      }}><Trash2 aria-hidden="true" /></button>
                  </div>
                </div>
                <div className="field-group">
                  <label htmlFor={`brand-product-price-${row.id}`}>가격<span>선택</span></label>
                  <input id={`brand-product-price-${row.id}`} value={row.price} maxLength={80}
                    placeholder="예: 30,000원, 1회 50,000원" autoComplete="off"
                    aria-describedby={`brand-product-price-help-${row.id}`}
                    onChange={(event) => {
                      const price = event.target.value;
                      setRows((current) => current.map((item) => item.id === row.id ? { ...item, price } : item));
                      changed();
                    }} />
                  <p id={`brand-product-price-help-${row.id}`} className="field-help">가격과 단위를 함께 입력하세요. 정해진 가격이 없으면 비워 두세요.</p>
                </div>
              </div>
            ))}
          </div>
          <button className="button secondary" type="button" onClick={() => {
            const id = ++sequence.current;
            setRows((current) => [...current, { id, value: '', price: '' }]);
            changed();
            focusRow(id);
          }}><Plus aria-hidden="true" />상품·서비스 추가</button>
        </fieldset>
        {error ? <p className="field-error" role="alert">{error}</p> : null}
        {notice ? <p className="field-help" role="status">{notice}</p> : null}
        <div className="brand-profile-actions">
          <button className="button primary" type="submit" disabled={disabled || saving || !profileReady}>
            {saving ? <LoaderCircle className="is-spinning" aria-hidden="true" /> : <Save aria-hidden="true" />}
            {saving ? '목록 저장 중…' : '상품·서비스 저장'}
          </button>
          {dirty ? <span className="unsaved-label">상품·서비스 목록을 아직 저장하지 않았습니다.</span> : null}
        </div>
        <p className="field-help">이 버튼은 상품·서비스 목록만 저장합니다. 필수 사항과 선택 사항은 ‘블로그 세팅 저장’으로 따로 저장하세요.</p>
      </form>
    </section>
  );
}
