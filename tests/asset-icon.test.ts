import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SYMBOL_DOMAINS, TICKER_DOMAINS, domainOf } from '../src/data/domains';
import { assetIcon, candidates, classify, learnDomain, setLogoToken, cryptoBase, resolveCryptoIcon, setDomainResolver, setIconFetch } from '../src/ui/assetIcon';

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
  it('empresas de EE.UU.: logo por ticker y favicon en 128 px; con clave de logo.dev, primero el logo de alta calidad', () => {
    expect(candidates('AAPL')).toEqual(['https://financialmodelingprep.com/image-stock/AAPL.png', 'https://www.google.com/s2/favicons?domain=apple.com&sz=128']);
    setLogoToken('pk_test');
    expect(candidates('AAPL')[0]).toBe('https://img.logo.dev/apple.com?token=pk_test&size=128&format=png');
    expect(candidates('AAPL')).toHaveLength(3);
    setLogoToken('');
  });
  it('índices, divisas y materias primas no hacen ningún pedido de red; un ticker desconocido solo prueba el repositorio por ticker', () => {
    for (const s of ['^GSPC', 'EURUSD=X', 'GC=F']) expect(candidates(s)).toEqual([]);
    expect(candidates('ZZZZ')).toEqual(['https://financialmodelingprep.com/image-stock/ZZZZ.png']);
  });
});

describe('el ícono en pantalla', () => {
  it('trae el monograma debajo y el logo encima; sin origen, solo el monograma', () => {
    const a = assetIcon('AAPL');
    expect(a).toContain('aico-t">AAP</span>');
    expect(a).toContain('<img src="https://financialmodelingprep.com/image-stock/AAPL.png"');
    const z = assetIcon('ZZZZ');
    expect(z).toContain('aico-t">ZZZ</span>');                                  // mientras carga (o si no existe) se ve el monograma, nunca un hueco
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
    expect(candidates('QWER')).toEqual(['https://financialmodelingprep.com/image-stock/QWER.png']);
    learnDomain('QWER', 'https://www.example-corp.com/es/inversores');
    expect(classify('QWER').domain).toBe('example-corp.com');
    expect(candidates('QWER')).toEqual(['https://financialmodelingprep.com/image-stock/QWER.png', 'https://www.google.com/s2/favicons?domain=example-corp.com&sz=128']);
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


describe('logos de monedas nuevas y de acciones poco conocidas', () => {
  const cg = (coins: unknown[], status = 200) => (async () => new Response(JSON.stringify({ coins }), { status })) as unknown as typeof fetch;
  it('el número que Yahoo agrega a las monedas nuevas se ignora, pero los símbolos reales con dígitos no se tocan', () => {
    expect(cryptoBase('PEPE24478')).toBe('PEPE'); expect(cryptoBase('TRUMP35336')).toBe('TRUMP'); expect(cryptoBase('HYPE32196')).toBe('HYPE');
    expect(cryptoBase('BTC')).toBe('BTC'); expect(cryptoBase('1INCH')).toBe('1INCH'); expect(cryptoBase('C98')).toBe('C98'); expect(cryptoBase('BONK')).toBe('BONK');
    expect(classify('PEPE24478-USD')).toMatchObject({ kind: 'crypto', base: 'pepe' });
    expect(candidates('PEPE24478-USD')[0]).toContain('/pepe.png');
  });
  it('SPCX (SpaceX) y otras empresas nuevas ya tienen su sitio, y los tickers de EE.UU. prueban también el repositorio de logos por ticker', () => {
    expect(classify('SPCX')).toMatchObject({ kind: 'equity', domain: 'spacex.com' });
    expect(classify('CRCL').domain).toBe('circle.com'); expect(classify('CRWV').domain).toBe('coreweave.com');
    const u = candidates('SPCX');
    expect(u).toHaveLength(2); expect(u[0]).toBe('https://financialmodelingprep.com/image-stock/SPCX.png'); expect(u[1]).toContain('spacex.com');
    expect(candidates('ZZZZ')).toEqual(['https://financialmodelingprep.com/image-stock/ZZZZ.png']);      // sin sitio conocido: igual se prueba por ticker
    expect(candidates('SAP.DE').every((x) => !x.includes('image-stock'))).toBe(true);                       // en otras bolsas el ticker puede ser otra empresa
  });
  it('CoinGecko: elige la moneda verdadera (coincidencia exacta de mayor capitalización), no una imitación', async () => {
    setIconFetch(cg([
      { symbol: 'wif', market_cap_rank: 900, large: 'https://coin-images.coingecko.com/imitacion.png' },
      { symbol: 'WIF', market_cap_rank: 62, large: 'https://coin-images.coingecko.com/dogwifhat.png' },
      { symbol: 'wifi', market_cap_rank: 5, large: 'https://coin-images.coingecko.com/otro.png' },
      { symbol: 'wif', market_cap_rank: null, large: 'https://coin-images.coingecko.com/sin-rank.png' },
    ]), 0);
    expect(await resolveCryptoIcon('wif')).toBe('https://coin-images.coingecko.com/dogwifhat.png');
  });
  it('lo encontrado se recuerda (no se vuelve a consultar) y el candidato pasa a ser el primero', async () => {
    let calls = 0;
    setIconFetch((async () => { calls++; return new Response(JSON.stringify({ coins: [{ symbol: 'moodeng', market_cap_rank: 400, large: 'https://coin-images.coingecko.com/moodeng.png' }] })); }) as unknown as typeof fetch, 0);
    expect(await resolveCryptoIcon('moodeng')).toContain('moodeng.png'); expect(await resolveCryptoIcon('MOODENG')).toContain('moodeng.png');
    expect(calls).toBe(1);
    expect(candidates('MOODENG-USD')[0]).toBe('https://coin-images.coingecko.com/moodeng.png');
  });
  it('si no hay resultado, se recuerda como "no hay"; si el servicio limita (429) o falla, NO se marca como inexistente', async () => {
    setIconFetch(cg([{ symbol: 'otra', market_cap_rank: 1, large: 'https://x/y.png' }]), 0);
    expect(await resolveCryptoIcon('nadatoken')).toBeNull();
    let calls = 0;
    setIconFetch((async () => { calls++; return calls === 1 ? new Response('{}', { status: 429 }) : new Response(JSON.stringify({ coins: [{ symbol: 'limitada', market_cap_rank: 9, large: 'https://coin-images.coingecko.com/ok.png' }] })); }) as unknown as typeof fetch, 0);
    expect(await resolveCryptoIcon('limitada')).toBeNull(); expect(calls).toBe(1);                              // 429: no se guarda como "no existe"
    vi.useFakeTimers();
    try {
      const again = resolveCryptoIcon('limitada');
      await vi.advanceTimersByTimeAsync(30_000); expect(calls).toBe(1);                                         // dentro de la pausa de 60 s no insiste
      await vi.advanceTimersByTimeAsync(31_000);
      expect(await again).toBe('https://coin-images.coingecko.com/ok.png'); expect(calls).toBe(2);              // pasada la pausa, reintenta y lo consigue
    } finally { vi.useRealTimers(); }
  });
  it('solo acepta imágenes https', async () => {
    setIconFetch(cg([{ symbol: 'httpx', market_cap_rank: 3, large: 'http://inseguro.example/x.png' }]), 0);
    expect(await resolveCryptoIcon('httpx')).toBeNull();
  });
  it('una acción sin sitio conocido lo averigua en segundo plano (una sola vez) y el ícono pasa a tener su logo', async () => {
    const asked: string[] = [];
    setDomainResolver(async (s) => { asked.push(s); return s === 'NEWCO' ? 'https://www.newco.example/es' : undefined; });
    const html = assetIcon('NEWCO') + assetIcon('NEWCO') + assetIcon('NOSITE');
    await new Promise((r) => setTimeout(r, 900));
    expect(asked.sort()).toEqual(['NEWCO', 'NOSITE']);
    expect(classify('NEWCO').domain).toBe('newco.example');
    expect(candidates('NEWCO').some((x) => x.includes('newco.example'))).toBe(true);
    expect(html).toContain('data-sym="NEWCO"');
    setDomainResolver(null);
  });
});
