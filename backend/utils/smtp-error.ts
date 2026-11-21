// Traduce los errores de nodemailer a un mensaje que el usuario pueda corregir desde
// Configuración → SMTP. Sin esto, el manejador de errores devuelve "Error interno del
// servidor." y no hay forma de saber si falla el servidor, el puerto o las credenciales.

interface SmtpErrorLike {
  code?: string;
  responseCode?: number;
  hostname?: string;
  message?: string;
}

const CONFIG_INCOMPLETA = 'Configuración SMTP incompleta o nodemailer no disponible.';

export function describirErrorSmtp(error: unknown, host?: string | null): string | null {
  if (!error || typeof error !== 'object') return null;
  const err = error as SmtpErrorLike;
  const servidor = err.hostname || host || 'el servidor SMTP';

  if (err.message === CONFIG_INCOMPLETA) {
    return 'Falta el servidor SMTP (host). Ejemplo para Gmail: smtp.gmail.com.';
  }

  switch (err.code) {
    case 'EDNS':
      return `No se encontró el servidor SMTP "${servidor}". Revise el campo servidor (host): `
        + 'debe ser un nombre como smtp.gmail.com, no una dirección de correo.';
    case 'EAUTH':
      return 'El servidor SMTP rechazó el usuario o la contraseña. El usuario suele ser la dirección '
        + 'de correo completa; en Gmail la contraseña debe ser una contraseña de aplicación.';
    case 'ETIMEDOUT':
    case 'ECONNECTION':
    case 'ESOCKET':
      return `No se pudo conectar con ${servidor}. Revise el puerto (587 sin SSL o 465 con SSL) `
        + 'y que el servidor permita conexiones desde este equipo.';
    case 'ETLS':
      return 'Falló la conexión segura (TLS) con el servidor SMTP. Revise el puerto y la opción SSL.';
    case 'EENVELOPE':
      return 'El servidor SMTP rechazó el remitente o el destinatario. Revise el correo remitente y el de destino.';
    default:
      return null;
  }
}
