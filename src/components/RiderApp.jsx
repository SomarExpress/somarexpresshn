import React, { useState, useEffect, useRef } from 'react'
import {
  TruckIcon, MapPin, DollarSign, Package, CheckCircle, Clock,
  Navigation, Phone, Camera, MessageCircle, AlertCircle, Star,
  Zap, Award, TrendingUp, LogOut, Menu, X, ArrowRight, Upload,
  ExternalLink, Shield, Wallet
} from 'lucide-react'
import {
  obtenerPerfilRider, obtenerPedidosDisponibles, obtenerPedidosAsignados,
  aceptarPedido, actualizarEstadoPedido, subirComprobante, obtenerConfiguracion,
  suscribirPedidosRider, actualizarEfectivoRider, obtenerEstadisticasRider,
  calcularNivelRider
} from '../lib/rider-api'
import { supabase } from '../lib/supabase'

const RiderApp = () => {
  // Estados principales
  const [rider, setRider] = useState(null)
  const [config, setConfig] = useState({ porcentaje_rider: 66.66, limite_guaca: 300 })
  const [pedidosDisponibles, setPedidosDisponibles] = useState([])
  const [pedidoActivo, setPedidoActivo] = useState(null)
  const [estadisticas, setEstadisticas] = useState(null)
  
  // UI States
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [mostrarMenu, setMostrarMenu] = useState(false)
  const [modoOscuro, setModoOscuro] = useState(true)
  const [swipeOffset, setSwipeOffset] = useState(0)
  const [facturaInput, setFacturaInput] = useState('')
  const [archivoComprobante, setArchivoComprobante] = useState(null)
  
  const swipeRef = useRef(null)
  const isDragging = useRef(false)
  const startX = useRef(0)

  // Auth: Obtener rider actual
  useEffect(() => {
    cargarDatosIniciales()
  }, [])

  // Suscripción en tiempo real
  useEffect(() => {
    if (!rider) return
    
    const channel = suscribirPedidosRider(rider.user_id, (payload) => {
      cargarPedidos()
    })
    
    return () => {
      supabase.removeChannel(channel)
    }
  }, [rider])

  const cargarDatosIniciales = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Obtener usuario autenticado
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError) throw authError
      if (!user) throw new Error('No autenticado')
      
      console.log('👤 Usuario autenticado:', user.email, user.id)
      
      // Obtener perfil del rider
      const perfilRider = await obtenerPerfilRider(user.id)
      if (!perfilRider) {
        throw new Error('No se encontró el perfil del rider. Por favor contacta al administrador.')
      }
      
      console.log('✅ Perfil del rider cargado:', perfilRider)
      setRider(perfilRider)
      
      // Obtener configuración
      const configData = await obtenerConfiguracion()
      console.log('⚙️ Configuración cargada:', configData)
      setConfig(configData)
      
      // Obtener estadísticas
      const stats = await obtenerEstadisticasRider(perfilRider.user_id)
      console.log('📊 Estadísticas cargadas:', stats)
      setEstadisticas(stats)
      
      // Cargar pedidos
      await cargarPedidos(perfilRider.user_id)
      
    } catch (err) {
      console.error('❌ Error en cargarDatosIniciales:', err)
      setError(err.message || 'Error al cargar datos iniciales')
    } finally {
      setLoading(false)
    }
  }

  const cargarPedidos = async (riderId = rider?.user_id) => {
    try {
      // Validar que tenemos un riderId
      if (!riderId) {
        console.warn('⚠️ No hay riderId para cargar pedidos')
        return
      }
      
      console.log('📦 Cargando pedidos para rider:', riderId)
      
      const [disponibles, asignados] = await Promise.all([
        obtenerPedidosDisponibles(),
        obtenerPedidosAsignados(riderId)
      ])
      
      console.log('✅ Pedidos disponibles:', disponibles?.length || 0)
      console.log('✅ Pedidos asignados:', asignados?.length || 0)
      
      setPedidosDisponibles(disponibles || [])
      setPedidoActivo(asignados?.[0] || null)
      
    } catch (err) {
      console.error('❌ Error cargando pedidos:', err)
      setPedidosDisponibles([])
      setPedidoActivo(null)
    }
  }

  
  const handleTouchStart = (e, pedido) => {
    if (pedidoActivo) return // Ya tiene un pedido activo
    isDragging.current = true
    startX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e) => {
    if (!isDragging.current) return
    const currentX = e.touches[0].clientX
    const diff = currentX - startX.current
    if (diff > 0 && diff < 250) {
      setSwipeOffset(diff)
    }
  }

  const handleTouchEnd = async (pedido) => {
    isDragging.current = false
    
    if (swipeOffset > 200) {
      // Aceptar pedido
      await handleAceptarPedido(pedido.id)
    }
    
    setSwipeOffset(0)
  }

  const handleAceptarPedido = async (pedidoId) => {
    try {
      setLoading(true)
      await aceptarPedido(pedidoId, rider.user_id)
      setSuccess('✅ Pedido aceptado')
      await cargarPedidos()
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  const handleCambiarEstado = async (nuevoEstado, datosExtra = {}) => {
    try {
      setLoading(true)
      
      // Si es compra y está llegando a comercio, validar factura
      if (nuevoEstado === 'recogido' && pedidoActivo.tipo === 'compra') {
        if (!facturaInput || !archivoComprobante) {
          throw new Error('Debes ingresar el monto y subir la foto de la factura')
        }
        datosExtra.total_compra = parseFloat(facturaInput)
      }
      
      // Actualizar estado
      await actualizarEstadoPedido(pedidoActivo.id, nuevoEstado, datosExtra)
      
      // Si hay comprobante, subirlo
      if (archivoComprobante && nuevoEstado === 'recogido') {
        await subirComprobante(pedidoActivo.id, archivoComprobante)
      }
      
      // Si finaliza el pedido, actualizar efectivo
      if (nuevoEstado === 'entregado' && pedidoActivo.metodo_pago === 'efectivo') {
        const nuevoEfectivo = parseFloat(rider.saldo_efectivo) + parseFloat(pedidoActivo.monto_cobrar_rider)
        await actualizarEfectivoRider(rider.user_id, nuevoEfectivo)
        setRider(prev => ({ ...prev, saldo_efectivo: nuevoEfectivo }))
      }
      
      setSuccess('✅ Estado actualizado')
      await cargarPedidos()
      setFacturaInput('')
      setArchivoComprobante(null)
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file && file.type.startsWith('image/')) {
      setArchivoComprobante(file)
    }
  }

  
  const renderBotonAccion = () => {
    if (!pedidoActivo) return null
    
    const { estado, tipo } = pedidoActivo
    
    switch (estado) {
      case 'asignado':
        return (
          <button
            onClick={() => handleCambiarEstado('en_comercio')}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            <MapPin size={24} />
            Llegué al Comercio
          </button>
        )
      
      case 'en_comercio':
        if (tipo === 'compra') {
          return (
            <div className="space-y-3">
              <input
                type="number"
                step="0.01"
                placeholder="Monto de la factura"
                value={facturaInput}
                onChange={(e) => setFacturaInput(e.target.value)}
                className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-xl text-white"
              />
              <label className="block">
                <div className="w-full bg-slate-800 border border-slate-600 rounded-xl p-4 cursor-pointer hover:bg-slate-700 transition-colors">
                  <div className="flex items-center justify-center gap-2 text-slate-300">
                    <Camera size={20} />
                    <span>{archivoComprobante ? archivoComprobante.name : 'Subir foto de factura'}</span>
                  </div>
                </div>
                <input type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
              </label>
              <button
                onClick={() => handleCambiarEstado('recogido')}
                disabled={!facturaInput || !archivoComprobante}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
              >
                <Package size={24} />
                Confirmar Compra y Salir
              </button>
            </div>
          )
        } else {
          return (
            <button
              onClick={() => handleCambiarEstado('recogido')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
            >
              <Package size={24} />
              Paquete Recogido
            </button>
          )
        }
      
      case 'recogido':
        return (
          <button
            onClick={() => handleCambiarEstado('en_camino')}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            <TruckIcon size={24} />
            En Camino al Cliente
          </button>
        )
      
      case 'en_camino':
        return (
          <button
            onClick={() => handleCambiarEstado('llegada_cliente')}
            className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
          >
            <MapPin size={24} />
            Llegué al Cliente
          </button>
        )
      
      case 'llegada_cliente':
        return (
          <div className="space-y-3">
            <div className={`p-4 rounded-xl ${pedidoActivo.metodo_pago === 'efectivo' ? 'bg-green-900/50 border border-green-500' : 'bg-blue-900/50 border border-blue-500'}`}>
              <p className="text-sm text-slate-300 mb-2">Monto a cobrar:</p>
              <p className="text-3xl font-bold text-white">
                {formatearMoneda(pedidoActivo.metodo_pago === 'efectivo' ? pedidoActivo.monto_cobrar_rider : 0)}
              </p>
              {pedidoActivo.metodo_pago === 'transferencia' && (
                <p className="text-xs text-blue-300 mt-2">
                  {pedidoActivo.transfer_confirmed ? '✅ Transferencia Confirmada' : '⏳ Esperando confirmación...'}
                </p>
              )}
            </div>
            <button
              onClick={() => handleCambiarEstado('entregado')}
              disabled={pedidoActivo.metodo_pago === 'transferencia' && !pedidoActivo.transfer_confirmed}
              className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg"
            >
              <CheckCircle size={24} />
              Finalizar Pedido
            </button>
          </div>
        )
      
      default:
        return null
    }
  }

  
  const formatearMoneda = (valor) => `L ${parseFloat(valor || 0).toFixed(2)}`
  
  const calcularProgresGuaca = () => {
    const porcentaje = (parseFloat(rider?.saldo_efectivo || 0) / config.limite_guaca) * 100
    return Math.min(porcentaje, 100)
  }
  
  const abrirNavegacion = (lat, lon, app = 'google') => {
    const url = app === 'google' 
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
      : `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`
    window.open(url, '_blank')
  }

  const nivel = estadisticas ? calcularNivelRider(estadisticas.totalPedidos) : { nivel: 'Novato', color: 'blue' }
  const guacaBloqueada = parseFloat(rider?.saldo_efectivo || 0) >= config.limite_guaca

  
  if (loading && !rider) {
    return (
      <div className={`min-h-screen ${modoOscuro ? 'bg-slate-900' : 'bg-slate-50'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className={`${modoOscuro ? 'text-slate-300' : 'text-slate-700'}`}>Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${modoOscuro ? 'bg-slate-900' : 'bg-slate-50'} pb-24`}>
      {/* Header */}
      <header className={`${modoOscuro ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'} border-b sticky top-0 z-40`}>
        <div className="px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <TruckIcon className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className={`text-lg font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                Hola, {rider?.nombre_completo?.split(' ')[0]}
              </h1>
              <p className={`text-xs ${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>
                Nivel {nivel.nivel}
              </p>
            </div>
          </div>
          <button onClick={() => setMostrarMenu(true)} className={`p-2 rounded-lg ${modoOscuro ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
            <Menu size={24} className={modoOscuro ? 'text-white' : 'text-slate-900'} />
          </button>
        </div>
      </header>

      {/* Alerta Guaca Bloqueada */}
      {guacaBloqueada && (
        <div className="mx-4 mt-4 bg-red-900/50 border border-red-500 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0" size={24} />
            <div>
              <p className="font-bold text-red-200">Guaca Llena - Liquidación Pendiente</p>
              <p className="text-sm text-red-300 mt-1">
                Has alcanzado el límite de {formatearMoneda(config.limite_guaca)}. Liquida tu efectivo para seguir recibiendo pedidos.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Barra de Progreso Guaca */}
      <div className="px-4 mt-4">
        <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-4 shadow-lg`}>
          <div className="flex items-center justify-between mb-2">
            <span className={`text-sm font-medium ${modoOscuro ? 'text-slate-300' : 'text-slate-700'}`}>
              💰 La Guaca
            </span>
            <span className={`text-sm font-bold ${modoOscuro ? 'text-blue-400' : 'text-blue-600'}`}>
              {formatearMoneda(rider?.saldo_efectivo || 0)} / {formatearMoneda(config.limite_guaca)}
            </span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-3 overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 ${calcularProgresGuaca() >= 90 ? 'bg-red-500' : calcularProgresGuaca() >= 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
              style={{ width: `${calcularProgresGuaca()}%` }}
            ></div>
          </div>
        </div>
      </div>

      {/* Estadísticas Rápidas */}
      <div className="px-4 mt-4 grid grid-cols-3 gap-3">
        <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-3 shadow-lg text-center`}>
          <Wallet className={`mx-auto mb-1 ${modoOscuro ? 'text-green-400' : 'text-green-600'}`} size={20} />
          <p className={`text-xs ${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>Balance</p>
          <p className={`text-sm font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
            {formatearMoneda(estadisticas?.totalGanancia || 0)}
          </p>
        </div>
        <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-3 shadow-lg text-center`}>
          <Package className={`mx-auto mb-1 ${modoOscuro ? 'text-blue-400' : 'text-blue-600'}`} size={20} />
          <p className={`text-xs ${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>Entregas</p>
          <p className={`text-sm font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
            {estadisticas?.totalPedidos || 0}
          </p>
        </div>
        <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-3 shadow-lg text-center`}>
          <Zap className={`mx-auto mb-1 ${modoOscuro ? 'text-yellow-400' : 'text-yellow-600'}`} size={20} />
          <p className={`text-xs ${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>Hoy</p>
          <p className={`text-sm font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
            {estadisticas?.pedidosHoy || 0}
          </p>
        </div>
      </div>

      <div className="px-4 mt-6">
        {pedidoActivo ? (
          /* Pedido Activo */
          <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 shadow-2xl`}>
            {/* Header del Pedido */}
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-xl font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                {pedidoActivo.numero_pedido}
              </h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                pedidoActivo.estado === 'asignado' ? 'bg-blue-500/20 text-blue-300' :
                pedidoActivo.estado === 'en_comercio' ? 'bg-yellow-500/20 text-yellow-300' :
                pedidoActivo.estado === 'recogido' ? 'bg-green-500/20 text-green-300' :
                pedidoActivo.estado === 'en_camino' ? 'bg-purple-500/20 text-purple-300' :
                'bg-orange-500/20 text-orange-300'
              }`}>
                {pedidoActivo.estado.toUpperCase().replace('_', ' ')}
              </span>
            </div>

            {/* Tipo de Pedido */}
            <div className={`mb-4 p-3 rounded-lg ${pedidoActivo.tipo === 'compra' ? 'bg-green-900/30' : 'bg-blue-900/30'}`}>
              <p className={`text-sm font-medium ${modoOscuro ? 'text-slate-300' : 'text-slate-700'}`}>
                {pedidoActivo.tipo === 'compra' ? '🛒 Compra + Entrega' : '📦 Solo Recolecta'}
              </p>
            </div>

            {/* Ganancia */}
            <div className="mb-6 p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 rounded-xl border border-green-500/30">
              <p className="text-sm text-slate-300 mb-1">Tu Ganancia</p>
              <p className="text-3xl font-bold text-green-400">
                {formatearMoneda(pedidoActivo.ganancia_rider)}
              </p>
              {pedidoActivo.propina > 0 && (
                <p className="text-xs text-green-300 mt-1">+ {formatearMoneda(pedidoActivo.propina)} propina</p>
              )}
            </div>

            {/* Detalles del Comercio */}
            {pedidoActivo.comercio && (
              <div className={`mb-4 p-4 ${modoOscuro ? 'bg-slate-700' : 'bg-slate-100'} rounded-lg`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-xs text-slate-400 mb-1">Comercio</p>
                    <p className={`font-medium ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                      {pedidoActivo.comercio.nombre}
                    </p>
                    <p className="text-sm text-slate-400 mt-1">{pedidoActivo.comercio.direccion}</p>
                    {pedidoActivo.tipo === 'recolecta' && pedidoActivo.referencia_comercio && (
                      <div className="mt-2 p-2 bg-yellow-500/20 rounded border border-yellow-500/30">
                        <p className="text-xs text-yellow-300">Orden: {pedidoActivo.referencia_comercio}</p>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 ml-3">
                    <button
                      onClick={() => abrirNavegacion(pedidoActivo.comercio.latitud, pedidoActivo.comercio.longitud, 'google')}
                      className="p-2 bg-blue-600 hover:bg-blue-700 rounded-lg"
                    >
                      <Navigation size={18} className="text-white" />
                    </button>
                    {pedidoActivo.comercio.telefono && (
                      <a href={`tel:${pedidoActivo.comercio.telefono}`} className="p-2 bg-green-600 hover:bg-green-700 rounded-lg">
                        <Phone size={18} className="text-white" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Detalles del Cliente */}
            <div className={`mb-6 p-4 ${modoOscuro ? 'bg-slate-700' : 'bg-slate-100'} rounded-lg`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-1">Cliente</p>
                  <p className={`font-medium ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                    {pedidoActivo.cliente_nombre}
                  </p>
                  <p className="text-sm text-slate-400 mt-1">{pedidoActivo.direccion_entrega}</p>
                  {pedidoActivo.referencia_entrega && (
                    <p className="text-xs text-slate-500 mt-1">📍 {pedidoActivo.referencia_entrega}</p>
                  )}
                </div>
                <div className="flex gap-2 ml-3">
                  <button
                    onClick={() => abrirNavegacion(pedidoActivo.latitud_entrega, pedidoActivo.longitud_entrega, 'google')}
                    className="p-2 bg-purple-600 hover:bg-purple-700 rounded-lg"
                  >
                    <Navigation size={18} className="text-white" />
                  </button>
                  {pedidoActivo.cliente_telefono && (
                    <a href={`tel:${pedidoActivo.cliente_telefono}`} className="p-2 bg-green-600 hover:bg-green-700 rounded-lg">
                      <Phone size={18} className="text-white" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Botón de Acción */}
            {renderBotonAccion()}
          </div>
        ) : (
          /* Ofertas de Pedidos Disponibles */
          <div className="space-y-4">
            <h2 className={`text-xl font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
              Pedidos Disponibles
            </h2>
            
            {guacaBloqueada ? (
              <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 text-center`}>
                <Shield size={48} className="mx-auto mb-3 text-slate-500" />
                <p className={`${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>
                  Liquida tu efectivo para recibir nuevos pedidos
                </p>
              </div>
            ) : pedidosDisponibles.length === 0 ? (
              <div className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl p-6 text-center`}>
                <Package size={48} className="mx-auto mb-3 text-slate-500" />
                <p className={`${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>
                  No hay pedidos disponibles por el momento
                </p>
              </div>
            ) : (
              pedidosDisponibles.map(pedido => {
                const gananciaTotal = parseFloat(pedido.ganancia_rider || 0) + parseFloat(pedido.propina || 0)
                
                return (
                  <div
                    key={pedido.id}
                    className={`${modoOscuro ? 'bg-slate-800' : 'bg-white'} rounded-xl shadow-lg overflow-hidden relative`}
                    ref={swipeRef}
                    onTouchStart={(e) => handleTouchStart(e, pedido)}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={() => handleTouchEnd(pedido)}
                    style={{ transform: `translateX(${swipeOffset}px)`, transition: isDragging.current ? 'none' : 'transform 0.3s' }}
                  >
                    {/* Indicador de Swipe */}
                    {swipeOffset > 0 && (
                      <div 
                        className="absolute inset-0 bg-green-500 flex items-center justify-center"
                        style={{ opacity: swipeOffset / 250 }}
                      >
                        <CheckCircle size={48} className="text-white" />
                      </div>
                    )}
                    
                    <div className="p-6 relative z-10">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          pedido.tipo === 'compra' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'
                        }`}>
                          {pedido.tipo === 'compra' ? '🛒 Compra' : '📦 Recolecta'}
                        </span>
                        <span className={`text-xs ${modoOscuro ? 'text-slate-400' : 'text-slate-600'}`}>
                          {pedido.distancia_km ? `${pedido.distancia_km.toFixed(1)} km` : 'Sin calcular'}
                        </span>
                      </div>

                      {/* Ganancia Destacada */}
                      <div className="mb-4">
                        <p className="text-sm text-slate-400 mb-1">Ganarás</p>
                        <p className="text-3xl font-bold text-green-400">
                          {formatearMoneda(gananciaTotal)}
                        </p>
                      </div>

                      {/* Origen y Destino */}
                      <div className="space-y-2 mb-4">
                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-slate-400">Comercio</p>
                            <p className={`text-sm ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                              {pedido.comercio?.nombre || 'Sin comercio'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <MapPin size={16} className="text-purple-400 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="text-xs text-slate-400">Cliente</p>
                            <p className={`text-sm ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>
                              {pedido.direccion_entrega?.substring(0, 40)}...
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Instrucción de Swipe */}
                      <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                        <ArrowRight size={16} />
                        <span>Desliza para aceptar</span>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Menu Lateral */}
      {mostrarMenu && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1" onClick={() => setMostrarMenu(false)}></div>
          <div className={`w-80 ${modoOscuro ? 'bg-slate-800' : 'bg-white'} shadow-2xl p-6 overflow-y-auto`}>
            <div className="flex items-center justify-between mb-6">
              <h2 className={`text-xl font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>Menú</h2>
              <button onClick={() => setMostrarMenu(false)} className="p-2 hover:bg-slate-700 rounded-lg">
                <X size={24} className={modoOscuro ? 'text-white' : 'text-slate-900'} />
              </button>
            </div>

            {/* Perfil */}
            <div className={`mb-6 p-4 ${modoOscuro ? 'bg-slate-700' : 'bg-slate-100'} rounded-xl`}>
              <p className={`font-bold ${modoOscuro ? 'text-white' : 'text-slate-900'}`}>{rider?.nombre_completo}</p>
              <p className="text-sm text-slate-400">{rider?.telefono}</p>
              <div className="mt-3 flex items-center gap-2">
                <Award className={`text-${nivel.color}-400`} size={20} />
                <span className={`text-sm font-medium text-${nivel.color}-400`}>{nivel.nivel}</span>
              </div>
            </div>

            {/* Opciones */}
            <div className="space-y-2">
              <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${modoOscuro ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <TrendingUp size={20} className={modoOscuro ? 'text-slate-400' : 'text-slate-600'} />
                <span className={modoOscuro ? 'text-white' : 'text-slate-900'}>Mis Estadísticas</span>
              </button>
              <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${modoOscuro ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}>
                <Wallet size={20} className={modoOscuro ? 'text-slate-400' : 'text-slate-600'} />
                <span className={modoOscuro ? 'text-white' : 'text-slate-900'}>Mi Billetera</span>
              </button>
              <button 
                onClick={() => setModoOscuro(!modoOscuro)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg ${modoOscuro ? 'hover:bg-slate-700' : 'hover:bg-slate-100'}`}
              >
                <span className={modoOscuro ? 'text-white' : 'text-slate-900'}>
                  {modoOscuro ? '☀️ Modo Claro' : '🌙 Modo Oscuro'}
                </span>
              </button>
              <button 
                onClick={() => supabase.auth.signOut()}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-red-900/20 text-red-400"
              >
                <LogOut size={20} />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alertas */}
      {error && (
        <div className="fixed bottom-24 left-4 right-4 bg-red-900/90 border border-red-500 rounded-xl p-4 shadow-2xl z-50">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-red-400 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="font-medium text-red-200">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-400">
              <X size={20} />
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="fixed bottom-24 left-4 right-4 bg-green-900/90 border border-green-500 rounded-xl p-4 shadow-2xl z-50">
          <div className="flex items-start gap-3">
            <CheckCircle className="text-green-400 flex-shrink-0" size={20} />
            <p className="flex-1 font-medium text-green-200">{success}</p>
            <button onClick={() => setSuccess(null)} className="text-green-400">
              <X size={20} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default RiderApp
