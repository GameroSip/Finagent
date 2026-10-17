// Iconos Lucide (licencia ISC), importados como texto y empaquetados solo los usados.
import activity from 'lucide-static/icons/activity.svg?raw';
import arrowDown from 'lucide-static/icons/arrow-down.svg?raw';
import arrowUp from 'lucide-static/icons/arrow-up.svg?raw';
import arrowUpRight from 'lucide-static/icons/arrow-up-right.svg?raw';
import bitcoin from 'lucide-static/icons/bitcoin.svg?raw';
import candles from 'lucide-static/icons/chart-candlestick.svg?raw';
import lineChart from 'lucide-static/icons/chart-line.svg?raw';
import check from 'lucide-static/icons/check.svg?raw';
import checkCircle from 'lucide-static/icons/circle-check.svg?raw';
import chevronLeft from 'lucide-static/icons/chevron-left.svg?raw';
import clock from 'lucide-static/icons/clock.svg?raw';
import dollar from 'lucide-static/icons/dollar-sign.svg?raw';
import externalLink from 'lucide-static/icons/external-link.svg?raw';
import flame from 'lucide-static/icons/flame.svg?raw';
import gauge from 'lucide-static/icons/gauge.svg?raw';
import globe from 'lucide-static/icons/globe.svg?raw';
import house from 'lucide-static/icons/house.svg?raw';
import info from 'lucide-static/icons/info.svg?raw';
import keyRound from 'lucide-static/icons/key-round.svg?raw';
import landmark from 'lucide-static/icons/landmark.svg?raw';
import layers from 'lucide-static/icons/layers.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import moon from 'lucide-static/icons/moon.svg?raw';
import newspaper from 'lucide-static/icons/newspaper.svg?raw';
import plus from 'lucide-static/icons/plus.svg?raw';
import refresh from 'lucide-static/icons/refresh-cw.svg?raw';
import scale from 'lucide-static/icons/scale.svg?raw';
import search from 'lucide-static/icons/search.svg?raw';
import send from 'lucide-static/icons/send.svg?raw';
import settings from 'lucide-static/icons/settings.svg?raw';
import shield from 'lucide-static/icons/shield-check.svg?raw';
import sparkles from 'lucide-static/icons/sparkles.svg?raw';
import star from 'lucide-static/icons/star.svg?raw';
import sun from 'lucide-static/icons/sun.svg?raw';
import trash from 'lucide-static/icons/trash-2.svg?raw';
import trendDown from 'lucide-static/icons/trending-down.svg?raw';
import trendUp from 'lucide-static/icons/trending-up.svg?raw';
import warn from 'lucide-static/icons/triangle-alert.svg?raw';
import x from 'lucide-static/icons/x.svg?raw';
import zap from 'lucide-static/icons/zap.svg?raw';

const ICONS = { activity, arrowDown, arrowUp, arrowUpRight, bitcoin, candles, lineChart, check, checkCircle, chevronLeft, clock, dollar,
  externalLink, flame, gauge, globe, house, info, keyRound, landmark, layers, lock, monitor, moon, newspaper, plus, refresh, scale,
  search, send, settings, shield, sparkles, star, sun, trash, trendDown, trendUp, warn, x, zap } as const;
export type IconName = keyof typeof ICONS;

/** Devuelve el HTML de un icono (hereda el color del texto). `fill` rellena la forma (ej. estrella activa). */
export function icon(name: IconName, size = 20, fill = false): string {
  const svg = ICONS[name].replace(/<!--[\s\S]*?-->/g, '').replace(/\s(width|height)="24"/g, '').replace('class="lucide', 'class="x lucide');
  return `<span class="ic" style="--s:${size}px">${fill ? svg.replace('fill="none"', 'fill="currentColor"') : svg}</span>`;
}
