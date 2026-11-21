# Corrección del acceso móvil

El login conservaba dos columnas de al menos 400 y 480 px porque un bloque posterior de estilos sobrescribía la cuadrícula móvil. Además, el panel ilustrado tenía prioridad de orden en pantallas pequeñas. El contenedor ocultaba el desbordamiento: por eso la página podía no tener desplazamiento horizontal y aun así recortar el formulario.

Hasta 991 px el acceso utiliza una columna, centrada y de ancho máximo de 480 px. La ilustración se muestra desde 992 px. El formulario conserva etiquetas, campos de 16 px, el botón de contraseña de 44 × 44 px y el botón de acceso completo. El contenido puede desplazarse verticalmente en horizontal o con menor altura disponible. Se retiraron las dos reglas móviles antiguas del login en `custom.css`; la adaptación reside en `mobile.css`. Recursos actualizados a `3.0.112`.

Verificación:

- Compilación estricta de frontend y backend completada.
- 48 comprobaciones satisfactorias en Chromium y WebKit, en temas claro y oscuro, sin errores JavaScript.
- Anchos: 320, 390, 430, 624, 768, 902, 991, 992 y 1440 px. También 790 × 390 y 390 × 360 px.
- Se comprueba que marca, título, campos, control de contraseña y botón queden dentro del panel y de los límites horizontales de la ventana. Esta comprobación detecta el recorte interno aunque `overflow:hidden` esconda el desbordamiento.
- Marca larga, mostrar/ocultar contraseña, respuesta de acceso fallido y conservación de campos. El botón puede alcanzarse mediante desplazamiento en vistas bajas.
- Servidor temporal con API simulada; no se inició sesión en el ERP real ni se escribieron registros.

Auditoría reproducible: `node audits/2026-10-17/verify.login-responsive.cjs`. Resultados en `login-responsive-results.json`; capturas con prefijo `chromium-login-corregido-` y `webkit-login-corregido-`.

El teclado y las zonas seguras de un teléfono físico requieren comprobación en dispositivo. La vista de menor altura verifica accesibilidad del formulario, sin sustituir esa prueba.
