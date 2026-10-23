import { beforeEach, describe, expect, it } from 'vitest';
import { SYMBOL_DOMAINS, TICKER_DOMAINS, domainOf } from '../src/data/domains';
import { assetIcon, candidates, classify, learnDomain, setLogoToken } from '../src/ui/assetIcon';

beforeEach(() => setLogoToken(''));

describe('qué es cada activo', () => {
  it('acciones y CEDEARs resuelven la empresa por su sitio; los CEDEARs repiten el ticker de origen', () => {
    expect(classify('AAPL')).toMatchObject({ kind: 'equity', domain: 'apple.com' });
    expect(classify('AAPL.BA')).toMatchObject({ kind: 'equity', domain: 'apple.com' });
    expect(classify('YPFD.BA').domain).toBe('ypf.com');
    expect(classify('BRK-B')).toMatchObject({ kind: 'equity', domain: 'berkshirehathaway.com' });   // no es una cripto aunque tenga guion
  });
  it('NO confunde el mismo ticker de otra bolsa con otra empresa (T.TO no es AT&T)', () => {
    expect(classify('T').domain).toBe('att.com');
    expect(classify('T.TO').domain).toBeUndefined();
    expect(classify('F.DE').domain).toBeUndefined();
    expect(classify('SAP.DE').domain).toBe('sap.com');
    expect(classify('7203.T').domain).toBe('toyota.co.jp');
  });
  it('cripto, índices, divisas y materias primas', () => {
    expect(classify('BTC-USD')).toEqual({ kind: 'crypto', base: 'btc' });
    expect(classify('eth-usdt').base).toBe('eth');
    expect(classify('^GSPC')).toMatchObject({ kind: 'index', emoji: '🇺🇸' });
    expect(classify('^MERV').emoji).toBe('🇦🇷');
    expect(classify('^NOEXISTE').emoji).toBe('📊');
    expect(classify('EURUSD=X')).toMatchObject({ kind: 'fx', emoji: '🇪🇺' });
    expect(classify('GC=F')).toMatchObject({ kind: 'commodity', emoji: '🥇' });
    expect(classify('CL=F').emoji).toBe('🛢️');
  });
  it('un ticker desconocido no inventa dominio', () => {
    expect(classify('ZZZZ')).toEqual({ kind: 'equity', base: 'ZZZZ' });
  });
});

describe('de dónde se piden los logos', () => {
  it('cripto: biblioteca pública de íconos y, si falla, otra; en minúsculas', () => {
    const u = candidates('BTC-USD');
    expect(u).toHaveLength(2);
    expect(u[0]).toBe('https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/btc.png');
    expect(u[1]).toBe('https://assets.coincap.io/assets/icons/btc@2x.png');
  });
  it('empresas: favicon en 128 px y, si hay clave de logo.dev, primero el logo de alta calidad', () => {
    expect(candidates('AAPL')).toEqual(['https://www.google.com/s2/favicons?domain=apple.com&sz=128']);
    setLogoToken('pk_test');
    expect(candidates('AAPL')[0]).toBe('https://img.logo.dev/apple.com?token=pk_test&size=128&format=png');
    expect(candidates('AAPL')).toHaveLength(2);
  });
  it('índices, divisas, materias primas y desconocidos no hacen ningún pedido de red', () => {
    for (const s of ['^GSPC', 'EURUSD=X', 'GC=F', 'ZZZZ']) expect(candidates(s)).toEqual([]);
  });
});

describe('el ícono en pantalla', () => {
  it('trae el monograma debajo y el logo encima; sin origen, solo el monograma', () => {
    const a = assetIcon('AAPL');
    expect(a).toContain('aico-t">AAP</span>');
    expect(a).toContain('<img src="https://www.google.com/s2/favicons?domain=apple.com&amp;sz=128"');
    const z = assetIcon('ZZZZ');
    expect(z).toContain('aico-t">ZZZ</span>');
    expect(z).not.toContain('<img');
    expect(assetIcon('^GSPC')).toContain('🇺🇸');
    expect(assetIcon('^GSPC')).not.toContain('<img');
  });
  it('el color es estable por símbolo', () => {
    expect(assetIcon('AAPL')).toBe(assetIcon('AAPL'));
    expect(assetIcon('AAPL')).not.toBe(assetIcon('MSFT'));
  });
  it('el símbolo no puede inyectar código en la página', () => {
    const evil = assetIcon('"><img src=x onerror=alert(1)>');
    expect(evil).not.toContain('<img src=x');
    expect(evil).not.toContain('onerror=alert(1)>');
    expect(evil).toContain('&quot;');
  });
});

describe('aprender el sitio de un activo (Yahoo lo informa al abrirlo)', () => {
  it('un ticker desconocido consigue su logo en cuanto se conoce su sitio', () => {
    expect(candidates('QWER')).toEqual([]);
    learnDomain('QWER', 'https://www.example-corp.com/es/inversores');
    expect(classify('QWER').domain).toBe('example-corp.com');
    expect(candidates('QWER')).toEqual(['https://www.google.com/s2/favicons?domain=example-corp.com&sz=128']);
    expect(assetIcon('QWER')).toContain('<img');
  });
  it('rechaza sitios inválidos o raros', () => {
    expect(domainOf('https://www.apple.com/es/')).toBe('apple.com');
    expect(domainOf('apple.com')).toBe('apple.com');
    expect(domainOf('')).toBeNull(); expect(domainOf(null)).toBeNull(); expect(domainOf('javascript:alert(1)')).toBeNull();
    expect(domainOf('http://localhost')).toBeNull(); expect(domainOf('https://a b.com')).toBeNull();
    learnDomain('ASDF', 'not a site'); expect(classify('ASDF').domain).toBeUndefined();
  });
});

describe('la tabla de empresas', () => {
  it('todos los dominios son válidos y no hay claves en minúscula (un error acá mostraría el logo de otra empresa)', () => {
    for (const [k, d] of [...TICKER_DOMAINS, ...SYMBOL_DOMAINS]) { expect(domainOf(d), `${k}=${d}`).toBe(d); expect(k).toBe(k.toUpperCase()); }
    expect(TICKER_DOMAINS.size).toBeGreaterThan(150);   // las más consultadas; el resto aprende su sitio al abrirse
  });
  it('las claves con bolsa no están también "a secas" (evita logos cruzados)', () => {
    for (const k of SYMBOL_DOMAINS.keys()) expect(k.includes('.')).toBe(true);
    for (const k of TICKER_DOMAINS.keys()) expect(/\.[A-Z]{1,3}$/.test(k)).toBe(false);
  });
});
