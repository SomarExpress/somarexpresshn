import { supabase } from './supabase'

// Obtener perfil del rider
export const obtenerPerfilRider = async (userId) => {
  try {
    console.log('🔍 Buscando rider con user_id:', userId)
    
    const { data, error } = await supabase
      .from('riders')
      .select('*')
      .eq('user_id', userId)
      .limit(1)
    
    if (error) {
      console.error('❌ Error en query de rider:', error)
      throw error
    }
    
    console.log('📊 Resultado de query riders:', data)
    
    // Si no existe el rider, crear uno básico
    if (!data || data.length === 0) {
      console.log('⚠️ No existe rider, creando uno nuevo...')
      
      const { data: user } = await supabase.auth.getUser()
      const nuevoRider = {
        user_id: userId,
        nombre_completo: user.user.email?.split('@')[0] || 'Rider',
        email: user.user.email,
        telefono: '',
        saldo_efectivo: 0,
        activo: true,
        verificado: false
      }
      
      const { data: riderCreado, error: errorCrear } = await supabase
        .from('riders')
        .insert(nuevoRider)
        .select('*')
      
      if (errorCrear) {
        console.error('❌ Error creando rider:', errorCrear)
        throw errorCrear
      }
      
      console.log('✅ Rider creado:', riderCreado[0])
      return riderCreado[0]
    }
    
    const rider = data[0]
    console.log('✅ Rider encontrado - user_id:', rider.user_id)
    console.log('✅ Rider completo:', rider)
    
    return rider
    
  } catch (error) {
    console.error('❌ Error en obtenerPerfilRider:', error)
    throw error
  }
}

// Obtener pedidos disponibles para el rider
export const obtenerPedidosDisponibles = async () => {
  try {
    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        comercio:comercios(nombre, direccion, latitud, longitud)
      `)
      .eq('estado', 'pendiente')
      .is('rider_id', null)
      .order('created_at', { ascending: false })
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error en obtenerPedidosDisponibles:', error)
    return []
  }
}

// Obtener pedidos asignados al rider
export const obtenerPedidosAsignados = async (riderUserId) => {
  try {
    if (!riderUserId) return []
    
    console.log('📦 Obteniendo pedidos asignados a user_id:', riderUserId)
    
    const { data, error } = await supabase
      .from('pedidos')
      .select(`
        *,
        comercio:comercios(nombre, direccion, latitud, longitud, telefono)
      `)
      .eq('rider_id', riderUserId)
      .in('estado', ['asignado', 'en_camino', 'en_comercio', 'recogido'])
      .order('created_at', { ascending: true })
    
    if (error) throw error
    return data || []
  } catch (error) {
    console.error('Error en obtenerPedidosAsignados:', error)
    return []
  }
}

// Aceptar pedido
export const aceptarPedido = async (pedidoId, riderUserId) => {
  try {
    if (!pedidoId) {
      throw new Error('pedidoId es requerido')
    }
    if (!riderUserId) {
      throw new Error('riderUserId es requerido')
    }
    
    console.log('🚀 Intentando aceptar pedido:', { pedidoId, riderUserId })
    
    // Verificar que el rider existe
    const { data: riderExiste, error: errorRider } = await supabase
      .from('riders')
      .select('user_id, nombre_completo')
      .eq('user_id', riderUserId)
      .limit(1)
    
    if (errorRider) {
      console.error('❌ Error verificando rider:', errorRider)
      throw errorRider
    }
    
    if (!riderExiste || riderExiste.length === 0) {
      throw new Error(`Rider con user_id ${riderUserId} no existe en la base de datos`)
    }
    
    console.log('✅ Rider verificado:', riderExiste[0])
    
    // Verificar que el pedido existe y está disponible
    const { data: pedidoExiste, error: errorPedido } = await supabase
      .from('pedidos')
      .select('id, numero_pedido, estado, rider_id')
      .eq('id', pedidoId)
      .limit(1)
    
    if (errorPedido) {
      console.error('❌ Error verificando pedido:', errorPedido)
      throw errorPedido
    }
    
    if (!pedidoExiste || pedidoExiste.length === 0) {
      throw new Error(`Pedido con ID ${pedidoId} no existe`)
    }
    
    if (pedidoExiste[0].rider_id) {
      throw new Error(`Pedido ${pedidoExiste[0].numero_pedido} ya está asignado a otro rider`)
    }
    
    console.log('✅ Pedido disponible:', pedidoExiste[0])
    
    // Actualizar el pedido
    const { data, error } = await supabase
      .from('pedidos')
      .update({
        rider_id: riderUserId,
        estado: 'asignado',
        asignado_at: new Date().toISOString()
      })
      .eq('id', pedidoId)
      .select()
    
    if (error) {
      console.error('❌ Error asignando pedido:', error)
      throw error
    }
    
    console.log('✅ Pedido asignado exitosamente:', data[0])
    return data[0]
    
  } catch (error) {
    console.error('❌ Error en aceptarPedido:', error)
    throw error
  }
}

// Actualizar estado del pedido
export const actualizarEstadoPedido = async (pedidoId, nuevoEstado, datosAdicionales = {}) => {
  try {
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
    
    if (error) throw error
    return data[0]
  } catch (error) {
    console.error('Error en actualizarEstadoPedido:', error)
    throw error
  }
}

// Subir comprobante de compra
export const subirComprobante = async (pedidoId, archivo) => {
  try {
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
    
    if (error) throw error
    return data[0]
  } catch (error) {
    console.error('Error en subirComprobante:', error)
    throw error
  }
}

// Actualizar efectivo en mano del rider
export const actualizarEfectivoRider = async (riderUserId, nuevoMonto) => {
  try {
    const { data, error } = await supabase
      .from('riders')
      .update({ saldo_efectivo: nuevoMonto })
      .eq('user_id', riderUserId)
      .select()
    
    if (error) throw error
    return data[0]
  } catch (error) {
    console.error('Error en actualizarEfectivoRider:', error)
    throw error
  }
}

// Obtener configuración global
export const obtenerConfiguracion = async () => {
  try {
    const { data, error } = await supabase
      .from('configuracion_global')
      .select('*')
      .limit(1)
    
    if (error) {
      console.warn('Error obteniendo configuración, usando valores por defecto:', error)
      return {
        porcentaje_rider: 66.66,
        porcentaje_somar: 33.34,
        limite_guaca: 300
      }
    }
    
    if (!data || data.length === 0) {
      return {
        porcentaje_rider: 66.66,
        porcentaje_somar: 33.34,
        limite_guaca: 300
      }
    }
    
    return data[0]
  } catch (error) {
    console.error('Error en obtenerConfiguracion:', error)
    return {
      porcentaje_rider: 66.66,
      porcentaje_somar: 33.34,
      limite_guaca: 300
    }
  }
}

// Suscribirse a cambios en pedidos del rider
export const suscribirPedidosRider = (riderUserId, callback) => {
  const channel = supabase
    .channel('pedidos-rider')
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'pedidos',
        filter: `rider_id=eq.${riderUserId}`
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
export const obtenerEstadisticasRider = async (riderUserId) => {
  try {
    if (!riderUserId) {
      return {
        totalGanancia: 0,
        totalPedidos: 0,
        pedidosHoy: 0,
        promedioGanancia: 0
      }
    }
    
    const { data, error } = await supabase
      .from('pedidos')
      .select('ganancia_rider, propina, created_at')
      .eq('rider_id', riderUserId)
      .eq('estado', 'entregado')
    
    if (error) {
      console.warn('Error obteniendo estadísticas:', error)
      return {
        totalGanancia: 0,
        totalPedidos: 0,
        pedidosHoy: 0,
        promedioGanancia: 0
      }
    }
    
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
  } catch (error) {
    console.error('Error en obtenerEstadisticasRider:', error)
    return {
      totalGanancia: 0,
      totalPedidos: 0,
      pedidosHoy: 0,
      promedioGanancia: 0
    }
  }
}

// Obtener nivel del rider (gamificación)
export const calcularNivelRider = (totalPedidos) => {
  if (totalPedidos >= 500) return { nivel: 'Oro', siguiente: 1000, color: 'yellow' }
  if (totalPedidos >= 200) return { nivel: 'Plata', siguiente: 500, color: 'gray' }
  if (totalPedidos >= 50) return { nivel: 'Bronce', siguiente: 200, color: 'orange' }
  return { nivel: 'Novato', siguiente: 50, color: 'blue' }
}


// Función auxiliar para convertir grados a radianes
const toRad = (valor) => {
  return valor * Math.PI / 180
}

/**
 * Calcula la distancia entre dos puntos usando la fórmula Haversine
 * @param {number} lat1 - Latitud del punto 1
 * @param {number} lon1 - Longitud del punto 1
 * @param {number} lat2 - Latitud del punto 2
 * @param {number} lon2 - Longitud del punto 2
 * @returns {number} Distancia en kilómetros
 */
export const calcularDistancia = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) {
    return null
  }

  const R = 6371 // Radio de la Tierra en km
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  const distancia = R * c
  
  return distancia
}

/**
 * Calcula la distancia de un pedido (comercio -> cliente)
 * @param {object} pedido - Objeto del pedido con coordenadas
 * @returns {number|null} Distancia en km o null si no hay coordenadas
 */
export const calcularDistanciaPedido = (pedido) => {
  try {
    // Si el pedido tiene comercio y dirección de entrega
    if (pedido.comercio?.latitud && pedido.comercio?.longitud && 
        pedido.latitud_entrega && pedido.longitud_entrega) {
      return calcularDistancia(
        pedido.comercio.latitud,
        pedido.comercio.longitud,
        pedido.latitud_entrega,
        pedido.longitud_entrega
      )
    }
    
    return null
  } catch (error) {
    console.error('Error calculando distancia:', error)
    return null
  }
}
