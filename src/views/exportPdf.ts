// Genera y comparte los informes en PDF. Todo ocurre en el teléfono: los datos de la cartera no salen de él.
import { track } from '../analytics';
import { fetchQuoteCard } from '../data/market';
import { t } from '../i18n';
import { buildPdf } from '../pdf';
import { type ScenarioResult, type Valued } from '../portfolio';
import { assetBlocks, portfolioBlocks } from '../reports';
import { deliverPdf } from '../share';
import { toast } from '../ui/dom';
import { adjustBars, fetchChart } from '../yahoo';

const stamp = () => new Date().toISOString().slice(0, 10);
const footer = () => `FinAgent · ${t('Informe informativo, no es asesoramiento financiero')}`;

export async function exportAssetPdf(symbol: string, name: string): Promise<void> {
  toast(t('Preparando el informe…'));
  try {
    const [q, ch] = await Promise.all([fetchQuoteCard(symbol, name), fetchChart(symbol, '1y', '1d')]);
    if (q.price === null) throw new Error('sin datos');
    const bars = adjustBars(ch.bars);
    const asOf = new Date(q.asOf && q.asOf < 1e12 ? q.asOf * 1000 : q.asOf ?? Date.now()).toLocaleDateString();
    const pdf = buildPdf(`${name} (${symbol})`, assetBlocks({ symbol, name: q.name || name, currency: q.currency, price: q.price, changePct: q.changePct, asOf, bars }), footer());
    track('report_export', { kind: 'asset' });
    await deliverPdf(pdf, `FinAgent_${symbol}_${stamp()}`, t('Informe de {s}', { s: symbol }));
  } catch { toast(t('No se pudo armar el informe. Probá de nuevo.')); }
}

export async function exportPortfolioPdf(v: Valued[], base: 'ARS' | 'USD', rate: number, sc?: ScenarioResult | null): Promise<void> {
  try {
    const pdf = buildPdf(t('Mi cartera'), portfolioBlocks(v, base, rate, sc), footer());
    track('report_export', { kind: sc ? 'scenario' : 'portfolio' });
    await deliverPdf(pdf, `FinAgent_cartera_${stamp()}`, t('Mi cartera'));
  } catch { toast(t('No se pudo armar el informe. Probá de nuevo.')); }
}
