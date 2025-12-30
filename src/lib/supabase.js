import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const obtenerConfiguracion = async () => {
  const { data, error } = await supabase
    .from('configuracion_global')
    .select('*')
  
  if (error) throw error
  
  const config = {}
  data.forEach(item => {
    config[item.clave] = parseFloat(item.valor)
  })
  
  return config
}

export const obtenerClientesConDirecciones = async () => {
  const { data, error } = await supabase
    .from('vista_clientes_completo')
    .select('*')
    .order('nombre_completo')
  
  if (error) throw error
  return data
}

export const obtenerDireccionesCliente = async (clienteId) => {
  const { data, error } = await supabase
    .from('direcciones_cliente')
    .select('*')
    .eq('cliente_id', clienteId)
    .eq('activo', true)
    .order('es_principal', { ascending: false })
  
  if (error) throw error
  return data
}

export const insertarCliente = async (cliente) => {
  const { data, error } = await supabase
    .from('clientes')
    .insert([cliente])
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const insertarDireccionCliente = async (direccion) => {
  const { data, error } = await supabase
    .from('direcciones_cliente')
    .insert([direccion])
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const insertarPedido = async (pedido) => {
  const { data, error } = await supabase
    .from('pedidos')
    .insert([pedido])
    .select()
    .single()
  
  if (error) throw error
  return data
}

export const obtenerPedidosActivos = async () => {
  const { data, error } = await supabase
    .from('vista_pedidos_dashboard')
    .select('*')
    .in('estado', ['pendiente', 'asignado', 'en_camino'])
    .order('created_at', { ascending: false })
  
  if (error) throw error
  return data
}

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

export const obtenerComercios = async () => {
  const { data, error } = await supabase
    .from('comercios')
    .select('*')
    .eq('activo', true)
    .order('nombre')
  
  if (error) throw error
  return data
}

export const subirComprobante = async (pedidoId, archivo) => {
  try {
    const nombreArchivo = `${pedidoId}_${Date.now()}_${archivo.name}`
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(nombreArchivo, archivo, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) throw uploadError
    
    const { data: urlData } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(nombreArchivo)
    
    const transferUrl = urlData.publicUrl
    
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
