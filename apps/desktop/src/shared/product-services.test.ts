import { describe, expect, it } from 'vitest';
import { formatProductCatalog, getProductPrice, normalizeProductCatalog, normalizeProductPrices, normalizeProductServices, parseProductOptions } from './product-services.js';

describe('product/service list', () => {
  it('keeps legacy newline lists and the new saved choices compatible', () => {
    expect(parseProductOptions(' A\r\n B \nA\n')).toEqual(['A', 'B']);
    expect(parseProductOptions(normalizeProductServices([' A ', 'B']))).toEqual(['A', 'B']);
  });
  it.each([null, '상품', [], [''], [' A ', 'A'], [1], ['가'.repeat(201)], ['A\nB'], Array.from({length: 8}, (_, i) => String(i) + '가'.repeat(199))])(
    'rejects empty, duplicate or oversized catalog input %#', (value) => {
      expect(() => normalizeProductServices(value)).toThrow();
    },
  );
});

describe('optional product prices', () => {
  it('accepts mixed priced and unpriced entries, trimming names and prices', () => {
    expect(normalizeProductCatalog([{ name: ' A ', price: ' 30,000원 ' }, { name: 'B', price: '' }]))
      .toEqual({ productsAndServices: 'A\nB', productPrices: { A: '30,000원' } });
  });
  it('preserves legacy name-only lists and accepts omitted optional prices', () => {
    expect(normalizeProductCatalog(['A', 'B'])).toEqual({ productsAndServices: 'A\nB', productPrices: {} });
    expect(normalizeProductCatalog([{ name: 'A' }])).toEqual({ productsAndServices: 'A', productPrices: {} });
  });
  it.each([null, [], [{name:'',price:'30,000원'}], [{name:'A',price:100}], [{name:'A',price:'가'.repeat(81)}], [{name:'A',price:'1\n2'}], [{name:'A'}, {name:' A '}], [null]])(
    'rejects invalid names and prices %#', (value) => expect(() => normalizeProductCatalog(value)).toThrow(),
  );
  it('drops obsolete price keys and whitespace prices without inventing a price', () => {
    expect(normalizeProductPrices({ A: ' ', old: '10원' }, 'A')).toEqual({});
    expect(formatProductCatalog('A\nB', { A: '30,000원' })).toBe('A (가격: 30,000원)\nB');
  });
  it('handles names matching object property keys as ordinary service names', () => {
    const catalog = normalizeProductCatalog([{name:'__proto__',price:'무료'}, {name:'toString',price:''}]);
    expect(getProductPrice(catalog.productPrices, '__proto__')).toBe('무료');
    expect(getProductPrice(catalog.productPrices, 'toString')).toBe('');
    expect(formatProductCatalog('toString')).toBe('toString');
  });
});
