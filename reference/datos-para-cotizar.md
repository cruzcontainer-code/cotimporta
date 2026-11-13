# Datos necesarios para producir la cotización (basado en COT-2026-BG880)

Referencia: `cotizacion-bg880-ejemplo.pdf`. Es el resultado que Cotimporta debe poder generar.

## Datos que ingresa el usuario
| Dato | Ejemplo en el PDF |
|---|---|
| Descripción del producto y uso | Sopladora semiautomática de botellas PET |
| Valor de la factura del proveedor (FOB) | USD 12,000 |
| Qué incluye el paquete (lista) | Máquina + horno + compresor + secador + chiller + filtros + 5 moldes |
| Condiciones de pago del proveedor | 30% inicio / 70% tras visto bueno |
| Plazos del proveedor | Fabricación 30-35 días; coordinación de embarque ~1 semana |
| Fecha / tipo de cambio de referencia | S/ 3.50 por USD |
| Cliente (nombre o "cliente interesado") | Cliente Interesado / Inversionista |

Las etapas 1 y 2 (porcentajes, plazos y pruebas) dependen del proveedor, así que se guardan POR COTIZACIÓN, no como regla fija.

## Datos que vienen del sistema (reglas y tablas editables)
- Partida arancelaria y tasas: ad valorem, sobretasa, antidumping, ISC, IGV, IPM, percepción.
- Exoneraciones (certificado de origen / TLC).
- Gastos locales del agente (flete, desaduanaje, almacén, visto bueno, transporte), editados semanalmente.
- Tránsito marítimo China a Perú: 30-40 días. Validez de la oferta: 15 días.
- Honorario de gestión: USD 1,500.

## Datos de la ficha técnica (los extrae la IA y se traducen)
- Producción: rendimiento, cavidades, volumen/cuello/diámetro/altura máximos, carrera.
- Eléctrico y dimensiones: voltaje, potencia, consumo, medidas y pesos.
- Componentes y marcas; fichas de cada equipo auxiliar; garantía y términos.
- Fotos de referencia (las del PDF del proveedor).

## Cálculos del PDF de ejemplo (para pruebas automáticas)
- Total = 12,000 + 1,417.20 + 2,415.10 + 1,500 = USD 17,332.30
- IGV compra 2,415.10 = 18% x (12,000 + 1,417.20)
- Pago 5 = logístico + IGV = 3,832.30. Pago 1 = 30% de 12,000. Pago 3 = 70%.

## Puntos a verificar (no asumir)
1. IGV compra: se agrupa como en el Excel (IGV+IPM sobre el valor CIF, más IGV sobre los gastos locales afectos). La suma coincide con 18% x (FOB + monto logístico) solo si todo el monto logístico está afecto. En el Excel, FOB charges (USD 857.14) no pagan IGV y no entran al CIF, así que la app debe calcular POR COMPONENTE, no con un 18% sobre el total.
2. El PDF no indica la partida ni el ad valorem aplicado. Hay que mostrar ambos.
3. El tipo de cambio varía entre tus archivos (3.40, 3.50, 3.70). Debe ser un dato único y visible.
4. Redondeo: el total en soles difiere en un centavo (60,663.04 vs 60,663.05).
