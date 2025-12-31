import React, { useState, useEffect, useRef } from 'react'
import {
  Package, MapPin, TruckIcon, CheckCircle, Camera, Clock, DollarSign,
  Navigation, Phone, MessageSquare, AlertCircle, Menu, X, Wallet, ArrowLeft
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import {
  obtenerPerfilRider, obtenerPedidosDisponibles, obtenerPedidosAsignados,
  aceptarPedido, actualizarEstadoPedido, subirComprobante, obtenerConfiguracion,
  suscribirPedidosRider, actualizarEfectivoRider, obtenerEstadisticasRider,
  calcularNivelRider, calcularDistanciaPedido
} from '../lib/rider-api'

export default function RiderApp() {
  const [rider, setRider] = useState(null)
  const [pedidosDisponibles, setPedidosDisponibles] = useState([])
  const [pedidoActivo, setPedidoActivo] = useState(null)
  const [config, setConfig] = useState(null)
  const [estadisticas, setEstadisticas] = useState(null)
  const [modoOscuro, setModoOscuro] = useState(true)
  const [facturaInput, setFacturaInput] = useState('')
  const [archivoComprobante, setArchivoComprobante] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  
  // Swipe
  const [swipeOffset, setSwipeOffset] = useState(0)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const swipeRef = useRef(null)

  useEffect(() => {
    inicializarApp()
  }, [])

  const inicializarApp = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      const [perfilData, configData, statsData] = await Promise.all([
        obtenerPerfilRider(user.id),
        obtenerConfiguracion(),
        obtenerEstadisticasRider(user.id)
      ])
      
      setRider(perfilData)
      setConfig(configData)
      setEstadisticas(statsData)
      
      await cargarPedidos(user.id)
      
      // Suscribirse a cambios en tiempo real
      const unsub = suscribirPedidosRider(user.id, () => {
        console.log('🔔 Cambio en tiempo real detectado')
        cargarPedidos(user.id)
      })
      
      return () => unsub?.()
    } catch (error) {
      console.error('Error inicializando:', error)
    }
  }

  const cargarPedidos = async (userId) => {
    try {
      const [disponibles, asignados] = await Promise.all([
        obtenerPedidosDisponibles(),
        obtenerPedidosAsignados(userId)
      ])
      
      console.log('📦 Pedidos disponibles:', disponibles)
      console.log('✅ Pedidos asignados:', asignados)
      
      setPedidosDisponibles(disponibles || [])
      
      if (asignados && asignados.length > 0) {
        setPedidoActivo(asignados[0])
      } else {
        setPedidoActivo(null)
      }
    } catch (error) {
      console.error('Error cargando pedidos:', error)
    }
  }

  const handleAceptarPedido = async (pedido) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      await aceptarPedido(pedido.id, user.id)
      await cargarPedidos(user.id)
    } catch (error) {
      console.error('Error aceptando pedido:', error)
      alert('Error al aceptar el pedido')
    }
  }

  const handleCambiarEstado = async (nuevoEstado) => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      
      let data = { estado: nuevoEstado }
      
      if (nuevoEstado === 'recogido' && pedidoActivo.tipo === 'compra') {
        if (!facturaInput || !archivoComprobante) {
          alert('Debes ingresar el monto y subir la foto de la factura')
          return
        }
        data.monto_factura = parseFloat(facturaInput)
      }
      
      await actualizarEstadoPedido(pedidoActivo.id, nuevoEstado, data)
      
      if (nuevoEstado === 'recogido' && pedidoActivo.tipo === 'compra' && archivoComprobante) {
        await subirComprobante(pedidoActivo.id, archivoComprobante)
      }
      
      if (nuevoEstado === 'entregado') {
        if (pedidoActivo.metodo_pago === 'efectivo') {
          const nuevoSaldo = parseFloat(rider.saldo_efectivo || 0) + parseFloat(pedidoActivo.monto_cobrar_rider || 0)
          await actualizarEfectivoRider(user.id, nuevoSaldo)
        }
        setFacturaInput('')
        setArchivoComprobante(null)
      }
      
      await cargarPedidos(user.id)
    } catch (error) {
      console.error('Error cambiando estado:', error)
      alert('Error al actualizar el estado')
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) setArchivoComprobante(file)
  }

  const handleTouchStart = (e, pedido) => {
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
    if (swipeOffset > 150) {
      await handleAceptarPedido(pedido)
    }
    setSwipeOffset(0)
    isDragging.current = false
  }

  const abrirNavegacion = (lat, lon) => {
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`
    window.open(url, '_blank')
  }

  const renderBotonesEstado = () => {
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

  const renderDetallesPedido = () => {
    if (!pedidoActivo) return null

    const distancia = calcularDistanciaPedido(pedidoActivo)

    return (
      <div className="space-y-4">
        {/* Encabezado */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Pedido #{pedidoActivo.numero_pedido}</h3>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${
              pedidoActivo.estado === 'asignado' ? 'bg-blue-500/20 text-blue-300' :
              pedidoActivo.estado === 'en_comercio' ? 'bg-yellow-500/20 text-yellow-300' :
              pedidoActivo.estado === 'recogido' ? 'bg-purple-500/20 text-purple-300' :
              pedidoActivo.estado === 'en_camino' ? 'bg-orange-500/20 text-orange-300' :
              pedidoActivo.estado === 'llegada_cliente' ? 'bg-pink-500/20 text-pink-300' :
              'bg-green-500/20 text-green-300'
            }`}>
              {pedidoActivo.estado.replace(/_/g, ' ').toUpperCase()}
            </span>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            pedidoActivo.tipo === 'compra' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'
          }`}>
            {pedidoActivo.tipo === 'compra' ? '🛒 Compra' : '📦 Recolecta'}
          </span>
        </div>

        {/* Distancia */}
        {distancia && (
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">Distancia estimada</p>
            <p className="text-2xl font-bold text-white">{distancia.toFixed(1)} km</p>
          </div>
        )}

        {/* Comercio */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <MapPin size={20} className="text-green-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">Comercio</p>
              <p className="text-white font-semibold">{pedidoActivo.comercio?.nombre || 'Sin comercio'}</p>
              <p className="text-sm text-slate-400 mt-1">{pedidoActivo.comercio?.direccion || 'Sin dirección'}</p>
              {pedidoActivo.comercio?.telefono && (
                <a href={`tel:${pedidoActivo.comercio.telefono}`} className="text-blue-400 text-sm mt-2 inline-flex items-center gap-1">
                  <Phone size={14} /> {pedidoActivo.comercio.telefono}
                </a>
              )}
              {pedidoActivo.comercio?.latitud && pedidoActivo.comercio?.longitud && (
                <button
                  onClick={() => abrirNavegacion(pedidoActivo.comercio.latitud, pedidoActivo.comercio.longitud)}
                  className="text-purple-400 text-sm mt-2 inline-flex items-center gap-1 ml-4"
                >
                  <Navigation size={14} /> Navegar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Cliente */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <MapPin size={20} className="text-orange-400 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <p className="text-xs text-slate-400 mb-1">Cliente</p>
              <p className="text-white font-semibold">{pedidoActivo.cliente_nombre || 'Cliente'}</p>
              <p className="text-sm text-slate-400 mt-1">{pedidoActivo.direccion_entrega}</p>
              {pedidoActivo.cliente_telefono && (
                <a href={`tel:${pedidoActivo.cliente_telefono}`} className="text-blue-400 text-sm mt-2 inline-flex items-center gap-1">
                  <Phone size={14} /> {pedidoActivo.cliente_telefono}
                </a>
              )}
              {pedidoActivo.latitud_entrega && pedidoActivo.longitud_entrega && (
                <button
                  onClick={() => abrirNavegacion(pedidoActivo.latitud_entrega, pedidoActivo.longitud_entrega)}
                  className="text-purple-400 text-sm mt-2 inline-flex items-center gap-1 ml-4"
                >
                  <Navigation size={14} /> Navegar
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Productos */}
        {pedidoActivo.tipo === 'compra' && pedidoActivo.productos && (
          <div className="bg-slate-800 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-2">Productos a comprar</p>
            <div className="space-y-2">
              {pedidoActivo.productos.map((prod, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-white">{prod.cantidad}x {prod.nombre}</span>
                  <span className="text-slate-400">{prod.precio ? formatearMoneda(prod.precio) : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pago */}
        <div className="bg-slate-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-slate-400">Método de pago</p>
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              pedidoActivo.metodo_pago === 'efectivo' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'
            }`}>
              {pedidoActivo.metodo_pago === 'efectivo' ? '💵 Efectivo' : '💳 Transferencia'}
            </span>
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Total del pedido</span>
              <span className="text-white font-semibold">{formatearMoneda(pedidoActivo.total || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Tu ganancia</span>
              <span className="text-green-400 font-semibold">{formatearMoneda(pedidoActivo.ganancia_rider || 0)}</span>
            </div>
            {pedidoActivo.propina > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Propina</span>
                <span className="text-green-400 font-semibold">{formatearMoneda(pedidoActivo.propina)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Notas */}
        {pedidoActivo.notas && (
          <div className="bg-yellow-900/20 border border-yellow-500/50 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-yellow-300 font-medium mb-1">Nota especial</p>
                <p className="text-sm text-white">{pedidoActivo.notas}</p>
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="pt-4">
          {renderBotonesEstado()}
        </div>
      </div>
    )
  }

  const formatearMoneda = (valor) => `L ${parseFloat(valor || 0).toFixed(2)}`
  
  const calcularProgresGuaca = () => {
    const porcentaje = (parseFloat(rider?.saldo_efectivo || 0) / config?.limite_guaca) * 100
    return Math.min(porcentaje, 100)
  }

  if (!rider || !config) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-white">Cargando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${modoOscuro ? 'bg-slate-900' : 'bg-gray-100'} pb-20`}>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {pedidoActivo && (
              <button 
                onClick={() => setPedidoActivo(null)}
                className="p-2 hover:bg-white/10 rounded-lg"
              >
                <ArrowLeft size={24} />
              </button>
            )}
            <div>
              <h1 className="font-bold text-lg">{rider.nombre_completo}</h1>
              <p className="text-xs text-blue-100">{calcularNivelRider(estadisticas?.total_pedidos || 0).nivel}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 bg-white/20 rounded-lg px-3 py-1">
              <Wallet size={18} />
              <span className="font-bold">{formatearMoneda(rider.saldo_efectivo)}</span>
            </div>
          </div>
        </div>

        {/* Barra de guaca */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span>💰 La Guaca</span>
            <span>{formatearMoneda(rider.saldo_efectivo)} / {formatearMoneda(config.limite_guaca)}</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div
              className="bg-green-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${calcularProgresGuaca()}%` }}
            />
          </div>
        </div>
      </div>

      {/* Contenido */}
      <div className="p-4">
        {pedidoActivo ? (
          // Vista de pedido activo
          <div>
            {renderDetallesPedido()}
          </div>
        ) : (
          // Vista de pedidos disponibles
          <div>
            {/* Estadísticas */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2">
                  <Wallet size={24} className="text-green-400" />
                </div>
                <p className="text-xs text-slate-400 mb-1">Balance</p>
                <p className="text-lg font-bold text-white">{formatearMoneda(rider.saldo_efectivo)}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2">
                  <Package size={24} className="text-blue-400" />
                </div>
                <p className="text-xs text-slate-400 mb-1">Entregas</p>
                <p className="text-lg font-bold text-white">{estadisticas?.totalPedidos || 0}</p>
              </div>
              <div className="bg-slate-800 rounded-xl p-4 text-center">
                <div className="flex justify-center mb-2">
                  <Clock size={24} className="text-yellow-400" />
                </div>
                <p className="text-xs text-slate-400 mb-1">Hoy</p>
                <p className="text-lg font-bold text-white">{estadisticas?.pedidosHoy || 0}</p>
              </div>
            </div>

            {/* Pedidos disponibles */}
            <div>
              <h2 className="text-xl font-bold text-white mb-4">
                Pedidos Disponibles ({pedidosDisponibles.length})
              </h2>

              {pedidosDisponibles.length === 0 ? (
                <div className="bg-slate-800 rounded-xl p-8 text-center">
                  <Package size={48} className="mx-auto mb-3 text-slate-500" />
                  <p className="text-slate-400">No hay pedidos disponibles</p>
                  <p className="text-xs text-slate-500 mt-2">Te notificaremos cuando haya nuevos pedidos</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pedidosDisponibles.map(pedido => {
                    const gananciaTotal = parseFloat(pedido.ganancia_rider || 0) + parseFloat(pedido.propina || 0)
                    const distancia = calcularDistanciaPedido(pedido)

                    return (
                      <div
                        key={pedido.id}
                        className="bg-slate-800 rounded-xl shadow-lg overflow-hidden relative"
                        ref={swipeRef}
                        onTouchStart={(e) => handleTouchStart(e, pedido)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={() => handleTouchEnd(pedido)}
                        style={{
                          transform: `translateX(${swipeOffset}px)`,
                          transition: isDragging.current ? 'none' : 'transform 0.3s'
                        }}
                      >
                        {swipeOffset > 0 && (
                          <div
                            className="absolute inset-0 bg-green-500 flex items-center justify-center"
                            style={{ opacity: swipeOffset / 250 }}
                          >
                            <CheckCircle size={48} className="text-white" />
                          </div>
                        )}

                        <div className="p-4 relative z-10">
                          <div className="flex items-center justify-between mb-3">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                              pedido.tipo === 'compra' ? 'bg-green-500/20 text-green-300' : 'bg-blue-500/20 text-blue-300'
                            }`}>
                              {pedido.tipo === 'compra' ? '🛒 Compra' : '📦 Recolecta'}
                            </span>
                            <span className="text-xs text-slate-400">
                              {distancia ? `${distancia.toFixed(1)} km` : 'Sin calcular'}
                            </span>
                          </div>

                          <div className="mb-3">
                            <p className="text-sm text-slate-400 mb-1">Ganarás</p>
                            <p className="text-2xl font-bold text-green-400">{formatearMoneda(gananciaTotal)}</p>
                          </div>

                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs text-slate-400">Comercio</p>
                                <p className="text-sm text-white">{pedido.comercio?.nombre || 'Sin comercio'}</p>
                              </div>
                            </div>
                            <div className="flex items-start gap-2">
                              <MapPin size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
                              <div className="flex-1">
                                <p className="text-xs text-slate-400">Cliente</p>
                                <p className="text-sm text-white">{pedido.direccion_entrega?.substring(0, 40)}...</p>
                              </div>
                            </div>
                          </div>

                          <p className="text-center text-xs text-slate-500 mt-3">👉 Desliza para aceptar</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
