const { Nomina, Empleado, Sede, ConfiguracionSistema } = require('../models');
const PDFDocument = require('pdfkit');
const { obtenerPeriodoPagoQuincenal } = require('../utils/nomina-periodo');

const SMLV = 1300000; // Salario Mínimo Mensual Legal Vigente 2024 aprox
const AUX_TRANSPORTE_MENSUAL = 162000; // Auxilio de transporte mensual aprox

// --- CALCULAR NÓMINA (Lógica Ley Colombiana) ---
exports.calcularNomina = async (req, res, next) => {
  try {
    const {
      empleadoId,
      periodo,
      tipoPeriodo,
      horasExtra,
      recargosNocturnos,
      dominicales,
      bonos,
      deduccionPrestamos
    } = req.body;

    let periodoFinal = periodo;
    let tipoPeriodoFinal = tipoPeriodo || 'quincenal';

    if (!periodoFinal) {
      const configSistema = await ConfiguracionSistema.findOne();
      const auto = obtenerPeriodoPagoQuincenal(new Date(), configSistema || {});
      periodoFinal = auto.periodo;
      tipoPeriodoFinal = auto.tipoPeriodo;
    }

    if (!empleadoId || !tipoPeriodoFinal) {
      return res.status(400).json({ error: 'Faltan parámetros requeridos para calcular la nómina.' });
    }

    const empleado = await Empleado.findByPk(empleadoId);
    if (!empleado) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }

    // Validar si ya existe nómina para este empleado y período
    const existe = await Nomina.findOne({ where: { empleadoId, periodo: periodoFinal } });
    if (existe) {
      return res.status(400).json({ error: 'Ya existe una liquidación de nómina registrada para este empleado en el período indicado.' });
    }

    const esQuincenal = tipoPeriodoFinal === 'quincenal';
    const divisor = esQuincenal ? 2 : 1;

    // 1. Salario Base
    const salarioBasePeriodo = parseFloat(empleado.salarioBase) / divisor;

    // 2. Auxilio de Transporte (Si gana <= 2 SMLV y su contrato es laboral y tiene el flag activo)
    let auxTransportePeriodo = 0;
    if (
      empleado.tipoContrato !== 'prestacion_servicios' &&
      parseFloat(empleado.salarioBase) <= 2 * SMLV &&
      empleado.auxilioTransporte
    ) {
      auxTransportePeriodo = AUX_TRANSPORTE_MENSUAL / divisor;
    }

    // Novedades devengados
    const extraNum = parseFloat(horasExtra || 0);
    const recargosNum = parseFloat(recargosNocturnos || 0);
    const domNum = parseFloat(dominicales || 0);
    const bonosNum = parseFloat(bonos || 0);
    const prestamosNum = parseFloat(deduccionPrestamos || 0);

    // 3. Calcular Ingreso Base de Cotización (IBC)
    // El auxilio de transporte y los bonos no constitutivos de salario (no incluidos aquí) no entran a IBC
    let ibc = 0;
    let saludDeduccion = 0;
    let pensionDeduccion = 0;

    if (empleado.tipoContrato !== 'prestacion_servicios') {
      ibc = salarioBasePeriodo + extraNum + recargosNum + domNum;
      saludDeduccion = ibc * 0.04; // 4% Salud
      pensionDeduccion = ibc * 0.04; // 4% Pensión
    }

    // 4. Totales
    const totalDevengado = salarioBasePeriodo + auxTransportePeriodo + extraNum + recargosNum + domNum + bonosNum;
    const totalDeducciones = saludDeduccion + pensionDeduccion + prestamosNum;
    const neto = totalDevengado - totalDeducciones;

    const nomina = await Nomina.create({
      empleadoId,
      periodo: periodoFinal,
      tipoPeriodo: tipoPeriodoFinal,
      salarioBase: salarioBasePeriodo,
      auxilioTransporte: auxTransportePeriodo,
      horasExtra: extraNum,
      recargosNocturnos: recargosNum,
      dominicales: domNum,
      bonos: bonosNum,
      deduccionEPS: saludDeduccion,
      deduccionPension: pensionDeduccion,
      deduccionPrestamos: prestamosNum,
      totalDevengado,
      totalDeducciones,
      neto,
      estado: 'borrador'
    });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'CREATE',
        modulo: 'Nominas',
        registroId: nomina.id,
        valorNuevo: nomina.toJSON()
      });
    }

    return res.status(201).json(nomina);
  } catch (error) {
    next(error);
  }
};

// --- OBTENER NOMINAS ---
exports.getNominas = async (req, res, next) => {
  try {
    const { periodo, empleadoId } = req.query;
    const where = {};
    if (periodo) where.periodo = periodo;
    if (empleadoId) where.empleadoId = empleadoId;

    const nominas = await Nomina.findAll({
      where,
      include: [{ model: Empleado, as: 'empleado', attributes: ['nombre', 'documento', 'cargo', 'tipoContrato'] }],
      order: [['createdAt', 'DESC']]
    });

    return res.json(nominas);
  } catch (error) {
    next(error);
  }
};

// --- ACTUALIZAR ESTADO DE LA NÓMINA ---
exports.updateEstadoNomina = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    if (!['borrador', 'aprobada', 'pagada'].includes(estado)) {
      return res.status(400).json({ error: 'Estado de nómina inválido.' });
    }

    const nomina = await Nomina.findByPk(id);
    if (!nomina) {
      return res.status(404).json({ error: 'Registro de nómina no encontrado.' });
    }

    const valorAnterior = nomina.toJSON();
    await nomina.update({ estado });

    if (req.logAudit) {
      await req.logAudit({
        accion: 'UPDATE',
        modulo: 'Nominas',
        registroId: id,
        valorAnterior,
        valorNuevo: { estado }
      });
    }

    return res.json({ message: 'Estado de nómina actualizado.', estado: nomina.estado });
  } catch (error) {
    next(error);
  }
};

// --- BORRAR REGISTRO DE NÓMINA (EN BORRADOR) ---
exports.deleteNomina = async (req, res, next) => {
  try {
    const { id } = req.params;
    const nomina = await Nomina.findByPk(id);
    if (!nomina) {
      return res.status(404).json({ error: 'Registro de nómina no encontrado.' });
    }

    if (nomina.estado !== 'borrador') {
      return res.status(400).json({ error: 'Solo se pueden eliminar liquidaciones en estado de borrador.' });
    }

    const valorAnterior = nomina.toJSON();
    await nomina.destroy();

    if (req.logAudit) {
      await req.logAudit({
        accion: 'DELETE',
        modulo: 'Nominas',
        registroId: id,
        valorAnterior
      });
    }

    return res.json({ message: 'Liquidación eliminada con éxito.' });
  } catch (error) {
    next(error);
  }
};

// --- DESPRENDIBLE DE NÓMINA PDF (PDFKIT) ---
exports.getDesprendiblePdf = async (req, res, next) => {
  try {
    const { id } = req.params;
    const nomina = await Nomina.findByPk(id, {
      include: [
        {
          model: Empleado,
          as: 'empleado',
          include: [{ model: Sede, as: 'sede' }]
        }
      ]
    });

    if (!nomina) {
      return res.status(404).json({ error: 'Liquidación de nómina no encontrada.' });
    }

    const config = await ConfiguracionSistema.findOne();
    const empresa = config?.empresa || 'TechStore Colombia S.A.S.';
    const nit = config?.nit || 'N/A';

    const doc = new PDFDocument({ margin: 50 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=desprendible_${nomina.empleado.nombre.replace(/\s+/g, '_')}_${nomina.periodo}.pdf`);
    doc.pipe(res);

    const formatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

    // Encabezado
    doc.fontSize(16).text(empresa.toUpperCase(), { align: 'center', bold: true });
    doc.fontSize(9).text(`NIT: ${nit}`, { align: 'center' });
    doc.text(`Sede: ${nomina.empleado.sede.nombre} | ${nomina.empleado.sede.direccion}`, { align: 'center' });
    doc.moveDown(1.5);

    // Titulo
    doc.fontSize(12).text(`COMPROBANTE DE PAGO DE NÓMINA: Periodo ${nomina.periodo} (${nomina.tipoPeriodo.toUpperCase()})`, { align: 'center', color: '#2563eb', bold: true });
    doc.moveDown(1.5);

    // Datos del Empleado
    doc.fontSize(10);
    doc.text(`Colaborador: ${nomina.empleado.nombre}`, { bold: true });
    doc.text(`Documento:   ${nomina.empleado.documento}`);
    doc.text(`Cargo:       ${nomina.empleado.cargo || 'N/A'}`);
    doc.text(`Contrato:    ${nomina.empleado.tipoContrato.toUpperCase()}`);
    if (nomina.empleado.cuentaBancaria) {
      doc.text(`Pago:        Transferencia ${nomina.empleado.banco || ''} - Ahorros: ${nomina.empleado.cuentaBancaria}`);
    }
    doc.moveDown(1.5);

    // Tabla de Conceptos
    doc.fontSize(11).text('DETALLE DE CONCEPTOS', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10);
    doc.text('Concepto / Descripción                     Devengados          Deducciones', { bold: true });
    doc.text('---------------------------------------------------------------------------------');

    // Salario
    doc.text(`Salario Base Periodo                       ${formatter.format(nomina.salarioBase).padStart(15)}`);
    
    // Auxilio Transporte
    if (parseFloat(nomina.auxilioTransporte) > 0) {
      doc.text(`Auxilio de Transporte                      ${formatter.format(nomina.auxilioTransporte).padStart(15)}`);
    }

    // Horas Extra
    if (parseFloat(nomina.horasExtra) > 0) {
      doc.text(`Horas Extras                               ${formatter.format(nomina.horasExtra).padStart(15)}`);
    }

    // Recargos
    if (parseFloat(nomina.recargosNocturnos) > 0) {
      doc.text(`Recargos Nocturnos                         ${formatter.format(nomina.recargosNocturnos).padStart(15)}`);
    }

    // Dominicales
    if (parseFloat(nomina.dominicales) > 0) {
      doc.text(`Dominicales / Festivos                     ${formatter.format(nomina.dominicales).padStart(15)}`);
    }

    // Bonos
    if (parseFloat(nomina.bonos) > 0) {
      doc.text(`Bonificaciones / Auxilios Extra            ${formatter.format(nomina.bonos).padStart(15)}`);
    }

    // Salud (EPS)
    if (parseFloat(nomina.deduccionEPS) > 0) {
      doc.text(`Deducción Salud (EPS 4%)                                       ${formatter.format(nomina.deduccionEPS).padStart(15)}`);
    }

    // Pension (AFP)
    if (parseFloat(nomina.deduccionPension) > 0) {
      doc.text(`Deducción Pensión (AFP 4%)                                     ${formatter.format(nomina.deduccionPension).padStart(15)}`);
    }

    // Prestamos
    if (parseFloat(nomina.deduccionPrestamos) > 0) {
      doc.text(`Deducción Préstamos / Libranzas                                ${formatter.format(nomina.deduccionPrestamos).padStart(15)}`);
    }

    doc.text('---------------------------------------------------------------------------------');
    doc.moveDown(1);

    // Totales
    doc.fontSize(11);
    doc.text(`Total Devengado:    ${formatter.format(nomina.totalDevengado)}`, { align: 'right' });
    doc.text(`Total Deducciones:  ${formatter.format(nomina.totalDeducciones)}`, { align: 'right' });
    doc.fontSize(12).text(`NETO PAGADO:        ${formatter.format(nomina.neto)}`, { align: 'right', bold: true });
    doc.moveDown(3);

    // Firmas
    doc.fontSize(10);
    doc.text('_______________________                  _______________________', { align: 'center' });
    doc.text(`Firma Autorizada (${empresa})                Firma Recibido Colaborador`, { align: 'center' });

    doc.end();
  } catch (error) {
    next(error);
  }
};
