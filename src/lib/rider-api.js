import { supabase } from './supabase'

// ============================================
// FUNCIONES PARA EL RIDER
// ============================================

// Obtener perfil del rider
export const obtenerPerfilRider = async (riderId) => {
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('id', riderId)
    .single()
  
  if (error) throw error
  return data
}

// Obtener pedidos disponibles para el rider
export const obtenerPedidosDisponibles = async () => {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      comercio:comercios(nombre, direccion, latitud, longitud),
      cliente:clientes(nombre_completo, telefono)
    `)
    .eq('estado', 'pendiente')
    .is('rider_id', null)
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

// Obtener pedidos asignados al rider
export const obtenerPedidosAsignados = async (riderId) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      comercio:comercios(nombre, direccion, latitud, longitud, telefono),
      cliente:clientes(nombre_completo, telefono),
      direccion:direcciones_cliente(direccion, latitud, longitud, referencia)
    `)
    .eq('rider_id', riderId)
    .in('estado', ['asignado', 'en_camino', 'en_comercio', 'recogido'])
    .order('created_at', { ascending: true })
  
  if (error) throw error
  return data
}

// Aceptar pedido
export const aceptarPedido = async (pedidoId, riderId) => {
  const { data, error } = await supabase
    .from('pedidos')
    .update({
      rider_id: riderId,
      estado: 'asignado',
      asignado_at: new Date().toISOString()
    })
    .eq('id', pedidoId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Actualizar estado del pedido
export const actualizarEstadoPedido = async (pedidoId, nuevoEstado, datosAdicionales = {}) => {
  const updateData = {
    estado: nuevoEstado,
    ...datosAdicionales
  }
  
  // Agregar timestamps según el estado
  if (nuevoEstado === 'en_comercio') updateData.en_comercio_at = new Date().toISOString()
  if (nuevoEstado === 'en_camino') updateData.en_camino_at = new Date().toISOString()
  if (nuevoEstado === 'llegada_cliente') updateData.llegada_cliente_at = new Date().toISOString()
  if (nuevoEstado === 'entregado') updateData.entregado_at = new Date().toISOString()
  
  const { data, error } = await supabase
    .from('pedidos')
    .update(updateData)
    .eq('id', pedidoId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Subir comprobante de compra
export const subirComprobante = async (pedidoId, archivo) => {
  const timestamp = Date.now()
  const fileName = `pedido-${pedidoId}-${timestamp}.${archivo.name.split('.').pop()}`
  const filePath = `comprobantes/${fileName}`
  
  // Subir archivo
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('comprobantes')
    .upload(filePath, archivo)
  
  if (uploadError) throw uploadError
  
  // Obtener URL pública
  const { data: urlData } = supabase.storage
    .from('comprobantes')
    .getPublicUrl(filePath)
  
  // Actualizar pedido con la URL
  const { data, error } = await supabase
    .from('pedidos')
    .update({ 
      comprobante_url: urlData.publicUrl,
      comprobante_subido_at: new Date().toISOString()
    })
    .eq('id', pedidoId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Actualizar efectivo en mano del rider
export const actualizarEfectivoRider = async (riderId, nuevoMonto) => {
  const { data, error } = await supabase
    .from('riders')
    .update({ saldo_efectivo: nuevoMonto })
    .eq('id', riderId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Obtener configuración global
export const obtenerConfiguracion = async () => {
  const { data, error } = await supabase
    .from('configuracion_global')
    .select('*')
    .single()
  
  if (error) throw error
  return data
}

// Suscribirse a cambios en pedidos del rider
export const suscribirPedidosRider = (riderId, callback) => {
  const channel = supabase
    .channel('pedidos-rider')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pedidos',
        filter: `rider_id=eq.${riderId}`
      },
      (payload) => {
        console.log('Cambio en pedido:', payload)
        callback(payload)
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'pedidos',
        filter: 'estado=eq.pendiente'
      },
      (payload) => {
        console.log('Nuevo pedido disponible:', payload)
        callback(payload)
      }
    )
    .subscribe()
  
  return channel
}

// Enviar mensaje en chat
export const enviarMensaje = async (pedidoId, riderId, mensaje, tipo = 'texto', archivoUrl = null) => {
  const { data, error } = await supabase
    .from('mensajes')
    .insert({
      pedido_id: pedidoId,
      remitente_id: riderId,
      remitente_tipo: 'rider',
      mensaje,
      tipo,
      archivo_url: archivoUrl
    })
    .select()
    .single()
  
  if (error) throw error
  return data
}

// Obtener mensajes del pedido
export const obtenerMensajesPedido = async (pedidoId) => {
  const { data, error } = await supabase
    .from('mensajes')
    .select('*')
    .eq('pedido_id', pedidoId)
    .order('created_at', { ascending: true })
  
  if (error) throw error
  return data
}

// Suscribirse a mensajes del pedido
export const suscribirMensajes = (pedidoId, callback) => {
  const channel = supabase
    .channel(`mensajes-${pedidoId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'mensajes',
        filter: `pedido_id=eq.${pedidoId}`
      },
      (payload) => {
        callback(payload.new)
      }
    )
    .subscribe()
  
  return channel
}

// Calcular estadísticas del rider
export const obtenerEstadisticasRider = async (riderId) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('ganancia_rider, propina, created_at')
    .eq('rider_id', riderId)
    .eq('estado', 'entregado')
  
  if (error) throw error
  
  const totalGanancia = data.reduce((sum, p) => sum + (parseFloat(p.ganancia_rider) || 0), 0)
  const totalPropinas = data.reduce((sum, p) => sum + (parseFloat(p.propina) || 0), 0)
  const totalPedidos = data.length
  
  // Pedidos de hoy
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const pedidosHoy = data.filter(p => new Date(p.created_at) >= hoy).length
  
  return {
    totalGanancia: totalGanancia + totalPropinas,
    totalPedidos,
    pedidosHoy,
    promedioGanancia: totalPedidos > 0 ? (totalGanancia + totalPropinas) / totalPedidos : 0
  }
}

// Obtener nivel del rider (gamificación)
export const calcularNivelRider = (totalPedidos) => {
  if (totalPedidos >= 500) return { nivel: 'Oro', siguiente: 1000, color: 'yellow' }
  if (totalPedidos >= 200) return { nivel: 'Plata', siguiente: 500, color: 'gray' }
  if (totalPedidos >= 50) return { nivel: 'Bronce', siguiente: 200, color: 'orange' }
  return { nivel: 'Novato', siguiente: 50, color: 'blue' }
}
