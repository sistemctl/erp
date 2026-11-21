export interface EmpleadoDTO {
  id: string; nombre: string; documento: string; telefono: string | null; email: string | null;
  cargo: string | null; sedeId: string; sede?: { nombre: string } | null;
  tipoContrato: 'indefinido' | 'fijo' | 'prestacion_servicios'; salarioBase: string;
  auxilioTransporte: boolean; fechaIngreso: string; banco: string | null; cuentaBancaria: string | null; activo: boolean;
}
export interface NominaDTO {
  id: string; empleadoId: string; empleado?: EmpleadoDTO | null; periodo: string;
  tipoPeriodo: 'quincenal' | 'mensual'; estado: 'borrador' | 'aprobada' | 'pagada';
  salarioBase: string; auxilioTransporte: string; horasExtra: string; recargosNocturnos: string;
  dominicales: string; bonos: string; deduccionEPS: string; deduccionPension: string;
  deduccionPrestamos: string; totalDevengado: string; totalDeducciones: string; neto: string;
}
