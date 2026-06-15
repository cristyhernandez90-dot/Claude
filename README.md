# 💰 Mi Presupuesto

App personal para controlar tus gastos mensuales y guardar fotos de tus recibos.
**Funciona 100% en tu dispositivo** — sin servidores, sin cuentas, sin internet (después de la primera carga) y gratis. Tus datos y fotos nunca salen de tu teléfono.

## ✨ Qué hace

- 📊 **Resumen mensual**: total gastado, gasto por categoría, promedio diario, mayor gasto y comparación con el mes anterior.
- 🧾 **Movimientos**: lista de todos los gastos del mes, editables.
- 📥 **Importar desde Numbers / tu atajo**: sube el CSV que genera tu lista y la app detecta sola las columnas de fecha, monto y comercio.
- 📷 **Fotos de recibos**: toma o adjunta una foto a cada gasto (se comprime automáticamente para ahorrar espacio).
- 🏷️ **Categorías automáticas**: clasifica cada gasto según palabras clave del comercio (ej. "uber" → Transporte). Editables a tu gusto.
- 💾 **Respaldo**: exporta/restaura todos tus datos (incluidas las fotos) en un archivo.

## 📱 Cómo instalarla como app en tu iPhone

1. Sube estos archivos a un hosting estático gratuito (por ejemplo **GitHub Pages**, Netlify o Vercel), o ábrelos desde un servidor local.
2. Abre la dirección en **Safari**.
3. Toca el botón **Compartir** (cuadro con flecha hacia arriba) → **"Agregar a pantalla de inicio"**.
4. Listo: aparece con su ícono propio y se abre en pantalla completa, como una app nativa. Funciona sin conexión.

> En Android es igual desde Chrome: menú → "Instalar aplicación".

## 🔗 Cómo conectar tu atajo del iPhone

Tu atajo ya crea una lista en Numbers cada vez que pasas la tarjeta. Para traer esos datos:

1. En **Numbers**, abre tu hoja → botón **···** → **Exportar** → **CSV**.
2. En la app, ve a la pestaña **Importar**, sube el CSV y pulsa **Analizar**.
3. Confirma qué columna es Fecha / Monto / Comercio (la app las adivina) y pulsa **Importar**.

**Opcional (avanzado):** puedes ampliar tu atajo para que, además de escribir en Numbers, guarde una fila en un archivo CSV (acción *"Anexar a archivo"* en la app Atajos). La app entiende cualquier CSV con columnas de fecha, monto y comercio, sin importar el orden ni el separador (`,` `;` o tabulador).

### Formato de CSV esperado (flexible)

Detecta encabezados en español o inglés. Ejemplo:

```csv
Fecha,Monto,Comercio,Categoria
15/06/2026,24.50,OXXO,
15/06/2026,120.00,UBER *TRIP,
14/06/2026,"1,250.00",Supermercado La Comer,Supermercado
```

- La **Categoría** es opcional: si la dejas vacía, se asigna automáticamente.
- Acepta montos como `24.50`, `1,250.00`, `1.250,00` o `$24`.
- Acepta fechas `15/06/2026`, `2026-06-15`, `6/15/26`, etc. (asume día/mes para fechas ambiguas).

## 🗂️ Archivos del proyecto

| Archivo | Para qué sirve |
|---|---|
| `index.html` | La interfaz de la app |
| `app.js` | Toda la lógica (datos, importación, gráficos) |
| `manifest.webmanifest` | Permite instalarla como app |
| `sw.js` | Service worker: funciona sin conexión |
| `icon.svg` | Ícono de la app |

## 🔒 Privacidad

Todo se guarda localmente en tu navegador (IndexedDB). Si borras los datos del sitio o cambias de teléfono, usa **Exportar respaldo** primero para no perder tu historial.

## 🧪 Probar localmente

```bash
# Cualquier servidor estático sirve, por ejemplo:
python3 -m http.server 8000
# luego abre http://localhost:8000
```
