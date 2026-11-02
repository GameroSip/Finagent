"""Descarga la historia diaria con yfinance (imita a un navegador, por eso suele pasar donde un pedido simple recibe 429).
Uso: python evals/radar/fetch_yf.py ^GSPC AAPL BTC-USD ...   → escribe evals/radar/data/<símbolo>.json con {"bars": [[t, o, h, l, c, v], ...]}"""
import json, pathlib, re, sys, time

import yfinance as yf

out = pathlib.Path("evals/radar/data")
out.mkdir(parents=True, exist_ok=True)
ok, fail = 0, []
for sym in sys.argv[1:]:
    rows = None
    for attempt in range(3):
        try:
            df = yf.Ticker(sym).history(period="max", interval="1d", auto_adjust=False, actions=False)
            if df is not None and len(df) >= 100:
                rows = [[int(ts.timestamp()), float(r.Open), float(r.High), float(r.Low), float(r.Close), float(r.Volume or 0)]
                        for ts, r in df.iterrows() if r.Open > 0 and r.High > 0 and r.Low > 0 and r.Close > 0]
                break
        except Exception as e:  # noqa: BLE001
            print(f"  intento {attempt + 1} de {sym}: {str(e)[:80]}")
        time.sleep(2 * (attempt + 1))
    if rows:
        (out / (re.sub(r"[^A-Za-z0-9.-]", "_", sym) + ".json")).write_text(json.dumps({"bars": rows}))
        ok += 1
        print(f"ok {sym}: {len(rows)} ruedas")
    else:
        fail.append(sym)
        print(f"FALLÓ {sym}")
    time.sleep(0.6)
print(f"yfinance: {ok} descargados, {len(fail)} fallaron: {' '.join(fail)}")
