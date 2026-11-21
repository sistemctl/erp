import { test } from 'node:test';
import assert = require('node:assert/strict');
import { describirErrorSmtp } from '../utils/smtp-error';

test('host que no resuelve: indica que el host no debe ser un correo', () => {
  const msg = describirErrorSmtp({ code: 'EDNS', hostname: 'smtp.semejal@gmail.com' });
  assert.match(msg ?? '', /No se encontró el servidor SMTP "smtp\.semejal@gmail\.com"/);
  assert.match(msg ?? '', /no una dirección de correo/);
});

test('credenciales rechazadas: menciona usuario y contraseña de aplicación', () => {
  assert.match(describirErrorSmtp({ code: 'EAUTH', responseCode: 535 }) ?? '', /usuario o la contraseña/);
});

test('fallo de conexión usa el host configurado si el error no lo trae', () => {
  assert.match(describirErrorSmtp({ code: 'ETIMEDOUT' }, 'smtp.gmail.com') ?? '', /No se pudo conectar con smtp\.gmail\.com/);
});

test('configuración sin host', () => {
  const err = new Error('Configuración SMTP incompleta o nodemailer no disponible.');
  assert.match(describirErrorSmtp(err) ?? '', /Falta el servidor SMTP/);
});

test('errores desconocidos no se traducen (siguen al manejador general)', () => {
  assert.equal(describirErrorSmtp(new Error('otra cosa')), null);
  assert.equal(describirErrorSmtp(null), null);
});
