import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// =====================================================
// FUNCIONES DE API
// =====================================================

/**
 * Obtener configuración global del sistema
 */
export const obtenerConfiguracion = async () => {
  const { data, error } = await supabase
    .from('configuracion_global')
    .select('*')
  
  if (error) throw error
  
  // Convertir a objeto clave-valor
  const config = {}
  data.forEach(item => {
    config[item.clave] = parseFloat(item.valor)
  })
  
  return config
}

/**
 * Insertar nuevo pedido
 */
export const insertarPedido = async (pedido) => {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([pedido])
    .select()
    .single()
  
  if (error) throw error
  return data
}

/**
 * Obtener todos los pedidos activos
 */
export const obtenerPedidosActivos = async () => {
  const { data, error } = await supabase
    .from('vista_pedidos_dashboard')
    .select('*')
    .in('estado', ['pendiente', 'asignado', 'en_camino'])
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

/**
 * Obtener lista de riders disponibles
 */
export const obtenerRidersDisponibles = async () => {
  const { data, error } = await supabase
    .from('perfiles')
    .select('*')
    .eq('rol', 'rider')
    .in('estado', ['disponible', 'ocupado'])
    .order('nombre_completo')
  
  if (error) throw error
  return data
}

/**
 * Obtener lista de comercios
 */
export const obtenerComercios = async () => {
  const { data, error } = await supabase
    .from('comercios')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  
  if (error) throw error
  return data
}

/**
 * Subir comprobante de transferencia
 */
export const subirComprobante = async (pedidoId, archivo) => {
  try {
    // 1. Subir archivo al Storage
    const nombreArchivo = `${pedidoId}_${Date.now()}_${archivo.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, archivo, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) throw uploadError
    
    // 2. Obtener URL pública
    const { data: urlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(nombreArchivo)
    
    const transferUrl = urlData.publicUrl
    
    // 3. Actualizar pedido con URL y validar transferencia
    const { data: pedidoData, error: updateError } = await supabase
      .from('pedidos')
      .update({
        transfer_url: transferUrl,
        transfer_status: 'validada',
        transfer_validado_at: new Date().toISOString()
      })
      .eq('id', pedidoId)
      .select()
      .single()
    
    if (updateError) throw updateError
    
    // 4. Registrar en historial
    await supabase
      .from('historial_transferencias')
      .insert([{
        pedido_id: pedidoId,
        estado_anterior: 'pendiente',
        estado_nuevo: 'validada',
        comprobante_url: transferUrl
      }])
    
    return pedidoData
  } catch (error) {
    console.error('Error al subir comprobante:', error)
    throw error
  }
}

/**
 * Actualizar estado del pedido
 */
export const actualizarEstadoPedido = async (pedidoId, nuevoEstado) => {
  const { data, error } = await supabase
    .from('pedidos')
    .update({ estado: nuevoEstado })
    .eq('id', pedidoId)
    .select()
    .single()
  
  if (error) throw error
  return data
}

/**
 * Asignar rider a pedido
 */
export const asignarRider = async (pedidoId, riderId) => {
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

/**
 * Suscribirse a cambios en tiempo real de pedidos
 */
export const suscribirPedidos = (callback) => {
  return supabase
    .channel('pedidos-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'pedidos' },
      (payload) => {
        callback(payload)
      }
    )
    .subscribe()
}
