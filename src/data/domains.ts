// Sitio web de las empresas más consultadas: de ahí sale su logo. Solo hay entradas de las que estamos seguros (un dominio equivocado mostraría el logo de OTRA empresa).
// Los demás activos aprenden su sitio solos: al abrir un activo, Yahoo informa su website (ver learnDomain).
const BY_TICKER = `AAPL=apple.com MSFT=microsoft.com NVDA=nvidia.com AMZN=amazon.com GOOGL=google.com GOOG=google.com META=meta.com TSLA=tesla.com BRK-B=berkshirehathaway.com AVGO=broadcom.com
LLY=lilly.com JPM=jpmorganchase.com V=visa.com MA=mastercard.com UNH=unitedhealthgroup.com XOM=exxonmobil.com WMT=walmart.com PG=pg.com JNJ=jnj.com HD=homedepot.com COST=costco.com
ORCL=oracle.com MRK=merck.com ABBV=abbvie.com CVX=chevron.com KO=coca-colacompany.com PEP=pepsico.com BAC=bankofamerica.com NFLX=netflix.com ADBE=adobe.com CRM=salesforce.com AMD=amd.com
INTC=intel.com CSCO=cisco.com QCOM=qualcomm.com TXN=ti.com IBM=ibm.com DIS=disney.com NKE=nike.com MCD=mcdonalds.com SBUX=starbucks.com PFE=pfizer.com TMO=thermofisher.com ABT=abbott.com
WFC=wellsfargo.com GS=goldmansachs.com MS=morganstanley.com C=citigroup.com AXP=americanexpress.com PYPL=paypal.com UBER=uber.com ABNB=airbnb.com SHOP=shopify.com COIN=coinbase.com
HOOD=robinhood.com PLTR=palantir.com SNOW=snowflake.com ZM=zoom.us SPOT=spotify.com PINS=pinterest.com SNAP=snap.com RBLX=roblox.com EA=ea.com MU=micron.com AMAT=appliedmaterials.com
LRCX=lamresearch.com ASML=asml.com TSM=tsmc.com ARM=arm.com SMCI=supermicro.com DELL=dell.com HPQ=hp.com T=att.com VZ=verizon.com TMUS=t-mobile.com BA=boeing.com LMT=lockheedmartin.com
RTX=rtx.com CAT=cat.com DE=deere.com GE=ge.com GM=gm.com F=ford.com TM=toyota.com HMC=honda.com RIVN=rivian.com NIO=nio.com BABA=alibaba.com JD=jd.com BIDU=baidu.com SONY=sony.com
NVO=novonordisk.com AZN=astrazeneca.com SAP=sap.com SHEL=shell.com BP=bp.com TTE=totalenergies.com UL=unilever.com KHC=kraftheinzcompany.com MDLZ=mondelezinternational.com PM=pmi.com
MO=altria.com CL=colgatepalmolive.com TGT=target.com LOW=lowes.com MELI=mercadolibre.com GLOB=globant.com DESP=despegar.com MSTR=strategy.com MARA=mara.com RIOT=riotplatforms.com
YPF=ypf.com YPFD=ypf.com PAMP=pampaenergia.com PAM=pampaenergia.com TGS=tgs.com.ar TGSU2=tgs.com.ar TEO=telecom.com.ar TECO2=telecom.com.ar CEPU=centralpuerto.com EDN=edenor.com
LOMA=lomanegra.com CRESY=cresud.com.ar CRES=cresud.com.ar IRS=irsa.com.ar IRSA=irsa.com.ar SUPV=gruposupervielle.com BBAR=bbva.com.ar BMA=macro.com.ar TXAR=ternium.com.ar ALUA=aluar.com.ar
BYMA=byma.com.ar MIRG=mirgor.com.ar TRAN=transener.com.ar HARG=holcim.com.ar
SPY=ssga.com DIA=ssga.com XLK=ssga.com XLF=ssga.com XLE=ssga.com XLV=ssga.com XLY=ssga.com XLP=ssga.com XLI=ssga.com XLU=ssga.com XLB=ssga.com XLRE=ssga.com
QQQ=invesco.com IWM=ishares.com EEM=ishares.com EWZ=ishares.com SLV=ishares.com TLT=ishares.com HYG=ishares.com IBIT=ishares.com EFA=ishares.com AGG=ishares.com
VOO=vanguard.com VTI=vanguard.com VEA=vanguard.com VWO=vanguard.com VNQ=vanguard.com BND=vanguard.com GLD=spdrgoldshares.com ARKK=ark-invest.com ARKB=ark-invest.com BITO=proshares.com FBTC=fidelity.com`;
// Símbolos con bolsa (el mismo ticker puede ser otra empresa en otra plaza): solo se aceptan completos.
const BY_SYMBOL = `SAP.DE=sap.com ASML.AS=asml.com 7203.T=toyota.co.jp 6758.T=sony.com 9984.T=softbank.jp NESN.SW=nestle.com NOVN.SW=novartis.com ROG.SW=roche.com SIE.DE=siemens.com
ALV.DE=allianz.com MC.PA=lvmh.com OR.PA=loreal.com AIR.PA=airbus.com TTE.PA=totalenergies.com SAN.MC=bancosantander.es ITX.MC=inditex.com BBVA.MC=bbva.com VOW3.DE=volkswagen.de`;
const parse = (s: string) => new Map(s.split(/\s+/).filter(Boolean).map((p) => p.split('=') as [string, string]));
export const TICKER_DOMAINS = parse(BY_TICKER);
export const SYMBOL_DOMAINS = parse(BY_SYMBOL);

/** "https://www.apple.com/es/" → "apple.com". null si no parece un sitio válido. */
export function domainOf(website: unknown): string | null {
  if (typeof website !== 'string') return null;
  try {
    const host = new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.toLowerCase().replace(/^www\./, '');
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) && host.length <= 80 ? host : null;
  } catch { return null; }
}
