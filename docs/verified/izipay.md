---
topic: izipay
status: verified
checked_on: 2026-11-15
source_url: https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/kb/ipn_usage.html
recurring_supported: yes
usd_supported: yes
ipn_signature: HMAC-SHA-256 (kr-hash-algorithm=sha256_hmac) del campo kr-answer tal como llega, en hexadecimal, con la contraseña de la API REST (2.ª clave, testpassword_… o prodpassword_…); válido si coincide con kr-hash
integration: hosted_redirect
mode: recurring
decision: Driver izipay sobre la API REST V4 de micuentaweb (donde está el Back Office del dueño). Alta: Charge/CreatePaymentOrder con channelType URL y formAction REGISTER_PAY (pago en página alojada que además guarda el token). Renovación: Charge/CreateSubscription con ese token. Confirmación: IPN firmado. Monedas PEN y USD.
---

# Izipay: cobro del plan mensual

Leído el 2026-11-15 en la documentación oficial de micuentaweb (Izipay, API REST V4) y en
`developers.izipay.pe`. Las páginas de micuentaweb se arman con JavaScript; se leyeron en un navegador.

## Citas de la fuente

**Firma del IPN** — `https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/kb/ipn_usage.html`
- `kr-hash-key`: "Contraseña de test o de producción según el caso (2ª clave de la tabla de claves API REST ). Clave utilizada para firmar kr-answer."
- `kr-hash-algorithm`: "Su valor es sha256_hmac."
- "Clave secreta: la contraseña que comienza con testpassword o prodpassword"; "Base de codificación: hexadecimal (base 16)."
- "si el kr-hash es igual al cifrado del kr-answer, entonces el mensaje es auténtico."
- Ojo: el retorno del navegador a la tienda usa otra clave, la "Clave HMAC-SHA-256 (4ª clave de la tabla de claves API REST )" (`/rest/V4.0/kb/payment_done.html`). El webhook usa la contraseña.

**Recurrencia** — `https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/playground/Charge/CreateSubscription`
- "El Servicio Web REST Charge/CreateSubscription permite realizar pagos recurrentes (suscripciones) a partir de un token".
- "Para recibir una notificación del resultado de una cuota, la regla \"URL de notificación en la creación de una suscripción\" debe estar activada".

**Monedas** — misma página, parámetro `currency`: "Sol peruano PEN 604 2" y "Dólar estadounidense USD 840 2".
`https://developers.izipay.pe/value-table/` también lista "PEN" (Soles) y "USD" (Dólares).

**Página alojada con redirección** — `https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/playground/Charge/CreatePaymentOrder`
- "El servicio web Charge/CreatePaymentOrder permite crear enlaces de pago".
- `channelType` `URL`: "Solo se realiza la creación de la URL de pago devuelta en la respuesta".
- `formAction` `REGISTER_PAY`: "Creación del alias durante un pago."
- "En el IPN, el parámetro kr-src tiene como valor PAYMENT_ORDER".
- `developers.izipay.pe/web-core/modalidades/redirect/` (SDK web nuevo) también describe redirigir
  "a una página externa para completar el proceso de pago".

## Pendiente para E3-T5 (no bloquea esta compuerta)

- El dueño debe activar en el Back Office la regla "URL de notificación en la creación de una
  suscripción" y confirmar que su contrato incluye tokens y suscripciones. Si no los incluye,
  cambiar a `mode: manual_renewal` (un enlace de pago por mes) sin tocar el resto.
- Lista de IPs de origen del IPN: "194.50.38.0/24" (misma página del IPN).
