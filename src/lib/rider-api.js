import { supabase } from './supabase'


// Obtener perfil del rider
export const obtenerPerfilRider = async (userId) => {
  const { data, error } = await supabase
    .from('riders')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle() // ← CAMBIO: usar maybeSingle() en vez de single()
  
  if (error) throw error
  
  // Si no existe el rider, crear uno básico
  if (!data) {
    const { data: user } = await supabase.auth.getUser()
    const nuevoRider = {
      user_id: userId,
      nombre_completo: user.user.email.split('@')[0],
      email: user.user.email,
      telefono: '',
      saldo_efectivo: 0,
      activo: true,
      verificado: false
    }
    
    const { data: riderCreado, error: errorCrear } = await supabase
      .from('riders')
      .insert(nuevoRider)
      .select()
      .single()
    
    if (errorCrear) throw errorCrear
    return riderCreado
  }
  
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
  return data || []
}

// Obtener pedidos asignados al rider
export const obtenerPedidosAsignados = async (riderId) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select(`
      *,
      comercio:comercios(nombre, direccion, latitud, longitud, telefono)
    `)
    .eq('rider_id', riderId)
    .in('estado', ['asignado', 'en_camino', 'en_comercio', 'recogido'])
    .order('created_at', { ascending: true })
  
  if (error) throw error
  return data || []
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
    .maybeSingle() // ← CAMBIO: usar maybeSingle()
  
  if (error) throw error
  
  // Si no existe configuración, retornar valores por defecto
  if (!data) {
    return {
      porcentaje_rider: 66.66,
      porcentaje_somar: 33.34,
      limite_guaca: 300
    }
  }
  
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

// Obtener estadísticas del rider
export const obtenerEstadisticasRider = async (riderId) => {
  const { data, error } = await supabase
    .from('pedidos')
    .select('ganancia_rider, propina, created_at')
    .eq('rider_id', riderId)
    .eq('estado', 'entregado')
  
  if (error) throw error
  
  const pedidos = data || []
  
  const totalGanancia = pedidos.reduce((sum, p) => sum + (parseFloat(p.ganancia_rider) || 0), 0)
  const totalPropinas = pedidos.reduce((sum, p) => sum + (parseFloat(p.propina) || 0), 0)
  const totalPedidos = pedidos.length
  
  // Pedidos de hoy
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const pedidosHoy = pedidos.filter(p => new Date(p.created_at) >= hoy).length
  
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
