export function parseProductOptions(value: string): readonly string[] {
  return [...new Set(value.split(/\r?\n/u).map((item) => item.trim()).filter(Boolean))];
}

export function normalizeProductServices(input: unknown): string {
  if (!Array.isArray(input) || input.length === 0 || !input.every((item) => typeof item === 'string')) {
    throw new Error('상품·서비스를 한 개 이상 입력해 주세요.');
  }
  const items = (input as string[]).map((item) => item.trim());
  if (items.some((item) => !item)) throw new Error('빈 항목을 입력하거나 해당 항목을 삭제해 주세요.');
  if (items.some((item) => item.length > 200 || /[\r\n]/u.test(item))) {
    throw new Error('각 상품·서비스는 줄바꿈 없이 200자 이내로 입력해 주세요.');
  }
  if (new Set(items).size !== items.length) throw new Error('중복된 상품·서비스를 수정하거나 삭제해 주세요.');
  const value = items.join('\n');
  if (value.length > 1_500) throw new Error('상품·서비스 목록은 전체 1,500자 이내로 입력해 주세요.');
  return value;
}

export interface ProductService {
  readonly name: string;
  readonly price: string;
}

export type ProductPrices = Readonly<Record<string, string>>;

export function getProductPrice(prices: ProductPrices | undefined, name: string): string {
  return prices && Object.hasOwn(prices, name) ? prices[name] ?? '' : '';
}

export function normalizeProductPrices(input: unknown, names: string): ProductPrices {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('상품·서비스 가격을 확인해 주세요.');
  }
  const allowedNames = new Set(parseProductOptions(names));
  return Object.fromEntries(Object.entries(input).flatMap(([name, value]) => {
    if (typeof value !== 'string' || value.trim().length > 80 || /[\r\n]/u.test(value)) {
      throw new Error('가격은 줄바꿈 없이 80자 이내로 입력해 주세요.');
    }
    return allowedNames.has(name) && value.trim() ? [[name, value.trim()]] : [];
  }));
}

export function normalizeProductCatalog(input: unknown): {
  productsAndServices: string;
  productPrices: ProductPrices;
} {
  if (!Array.isArray(input)) throw new Error('상품·서비스를 한 개 이상 입력해 주세요.');
  // Existing name-only callers and saved profiles remain compatible.
  const entries = input.map((item: unknown) => typeof item === 'string'
    ? { name: item, price: '' }
    : item && typeof item === 'object' && !Array.isArray(item)
      ? item as Record<string, unknown>
      : { name: undefined, price: undefined });
  const productsAndServices = normalizeProductServices(entries.map((item) => item.name));
  const prices = Object.fromEntries(entries.map((item) => [
    (item.name as string).trim(), item.price === undefined ? '' : item.price,
  ]));
  return { productsAndServices, productPrices: normalizeProductPrices(prices, productsAndServices) };
}

export function formatProductCatalog(names: string, prices?: ProductPrices): string {
  return parseProductOptions(names).map((name) => {
    const price = getProductPrice(prices, name);
    return price ? `${name} (가격: ${price})` : name;
  }).join('\n');
}
