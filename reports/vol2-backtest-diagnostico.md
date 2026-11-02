# Diagnóstico del backtest 3 (exploratorio: NO cambia ningún veredicto)

Pregunta: ¿los datos de algunos activos traen ruedas sin rango (máximo = mínimo), que el modelo toma como "volatilidad cero"?

## Activos con ruedas sin rango

| Activo | Grupo | Ruedas | % sin rango (total) | % sin rango antes de 1990 | Última rueda sin rango |
|---|---|---|---|---|---|
| ^GSPC | índices | 24827 | 34.4 % | 55.0 % | 1983-06-30 |
| ^IXIC | índices | 14053 | 24.6 % | 72.4 % | 1990-04-05 |
| ^GDAXI | índices | 9823 | 15.2 % | 100.0 % | 1997-05-28 |
| ^HSI | índices | 9830 | 5.8 % | 77.3 % | 1989-10-09 |
| WMT | acciones | 13659 | 2.0 % | 6.1 % | 1984-02-17 |

Casos totales: 446550 · con ≥ 5 % de ruedas sin rango en las 250 previas: 17043 (3.8 %).
Retornos "imposibles" (|z| > 8): todos 10863 · limpios 300.

## Sensibilidad (exploratoria): los mismos criterios sin los casos con datos de rango degenerado

| Criterio | Todos los casos (veredicto oficial) | Sin rango degenerado |
|---|---|---|
| Q1 | pasa | pasa |
| Q2 | pasa | pasa |
| Q3all | no pasa | no pasa |
| Q4 | no pasa | no pasa |
| Q5 | no pasa | pasa |
| Q6 | pasa | pasa |
| Q3 índices | no pasa | no pasa |
| Q3 ETF | pasa | pasa |
| Q3 acciones | pasa | pasa |
| Q3 cripto | pasa | pasa |
| Se construiría | no | no |

### Q5 sin rango degenerado

| Período | < 0,8× | 0,8–1,25× | 1,25–2× | ≥ 2× |
|---|---|---|---|---|
| antes de 2015 | 0.625 (93286) | 1.005 (123202) | 1.569 (54649) | 3.014 (12146) |
| desde 2015 | 0.609 (56873) | 1.001 (55303) | 1.599 (25881) | 3.858 (8167) |

### Q3 sin rango degenerado

| Grupo | Período | Cobertura | Izq. | Der. |
|---|---|---|---|---|
| todos | antes de 2015 | 93.4 % | 3.5 % | 3.0 % |
| todos | desde 2015 | 91.2 % | 4.6 % | 4.2 % |
| índices | antes de 2015 | 100.0 % | 0.0 % | 0.0 % |
| índices | desde 2015 | 100.0 % | 0.0 % | 0.0 % |
| ETF | antes de 2015 | 88.7 % | 5.7 % | 5.6 % |
| ETF | desde 2015 | 87.1 % | 6.2 % | 6.7 % |
| acciones | antes de 2015 | 92.4 % | 4.1 % | 3.4 % |
| acciones | desde 2015 | 90.1 % | 5.2 % | 4.7 % |
| cripto | desde 2015 | 92.1 % | 4.5 % | 3.4 % |
