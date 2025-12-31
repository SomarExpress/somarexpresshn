import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import L from 'leaflet'
import {
  Package, MapPin, TruckIcon, CheckCircle, Camera, Clock, DollarSign,
  Navigation, Phone, MessageSquare, AlertCircle, Menu, X, Wallet
} from 'lucide-react'
import {
  obtenerPerfilRider, obtenerPedidosDisponibles, obtenerPedidosAsignados,
  aceptarPedido, actualizarEstadoPedido, subirComprobante, obtenerConfiguracion,
  suscribirPedidosRider, actualizarEfectivoRider, obtenerEstadisticasRider,
  calcularNivelRider, calcularDistanciaPedido
} from '../lib/rider-api'

// Configurar íconos de Leaflet
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
})

// Íconos personalizados
const createCustomIcon = (color) => new L.Icon({
  iconUrl: `data:image/svg+xml;base64,${btoa(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
    </svg>
  `)}`,
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32]
})

const riderIcon = createCustomIcon('#3b82f6')
const comercioIcon = createCustomIcon('#10b981')
const clienteIcon = createCustomIcon('#f59e0b')

// Componente para centrar el mapa
const MapController = ({ center, zoom }) => {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, zoom || 15)
    }
  }, [center, zoom, map])
  return null
}

export default function RiderApp() {
  // Estados existentes
  const [rider, setRider] = useState(null)
  const [pedidosDisponibles, setPedidosDisponibles] = useState([])
  const [pedidoActivo, setPedidoActivo] = useState(null)
  const [config, setConfig] = useState(null)
  const [estadisticas, setEstadisticas] = useState(null)
  const [modoOscuro, setModoOscuro] = useState(true)
  const [facturaInput, setFacturaInput] = useState('')
  const [archivoComprobante, setArchivoComprobante] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(false)
  
  // Nuevos estados para el mapa y rutas
  const [ubicacionRider, setUbicacionRider] = useState(null)
  const [rutaActual, setRutaActual] = useState(null)
  const [infoRuta, setInfoRuta] = useState(null) // { distancia, duracion }
  const [vistaActual, setVistaActual] = useState('mapa') // 'mapa' o 'lista'
  const [pedidosEnMapa, setPedidosEnMapa] = useState([])
  const [cargandoRuta, setCargandoRuta] = useState(false)
  
  // Swipe
  const [swipeOffset, setSwipeOffset] = useState(0)
  const isDragging = useRef(false)
  const startX = useRef(0)
  const swipeRef = useRef(null)

  // ============================================
  // INICIALIZACIÓN
  // ============================================

  useEffect(() => {
    inicializarApp()
    obtenerUbicacionRider()
    const watchId = navigator.geolocation?.watchPosition(
      (pos) => {
        setUbicacionRider({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        })
      },
      (error) => console.error('Error tracking location:', error),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    )
    
    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId)
    }
  }, [])

  const inicializarApp = async () => {
    try {
      const [perfilData, configData, statsData] = await Promise.all([
        obtenerPerfilRider(),
        obtenerConfiguracion(),
        obtenerEstadisticasRider()
      ])
      setRider(perfilData)
      setConfig(configData)
      setEstadisticas(statsData)
      
      await cargarPedidos()
      
      // Suscribirse a cambios en tiempo real
      const unsub = suscribirPedidosRider((payload) => {
        console.log('🔔 Cambio en tiempo real:', payload)
        cargarPedidos()
      })
      
      return () => unsub?.()
    } catch (error) {
      console.error('Error inicializando:', error)
    }
  }

  const obtenerUbicacionRider = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUbicacionRider({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude
          })
        },
        (error) => console.error('Error obteniendo ubicación:', error),
        { enableHighAccuracy: true }
      )
    }
  }

  const cargarPedidos = async () => {
    try {
      const [disponibles, asignados] = await Promise.all([
        obtenerPedidosDisponibles(),
        obtenerPedidosAsignados()
      ])
      
      setPedidosDisponibles(disponibles || [])
      setPedidosEnMapa(disponibles || [])
      
      if (asignados && asignados.length > 0) {
        setPedidoActivo(asignados[0])
        if (asignados[0] && ubicacionRider) {
          await calcularRuta(asignados[0])
        }
      } else {
        setPedidoActivo(null)
        setRutaActual(null)
        setInfoRuta(null)
      }
    } catch (error) {
      console.error('Error cargando pedidos:', error)
    }
  }

  // ============================================
  // CÁLCULO DE RUTAS CON OPENROUTESERVICE (GRATIS)
  // ============================================

  const calcularRuta = async (pedido) => {
    if (!ubicacionRider || !pedido) return

    setCargandoRuta(true)
    try {
      // Determinar origen y destino según el estado
      let origen, destino
      
      if (pedido.estado === 'asignado' || pedido.estado === 'en_comercio') {
        // Ruta: Rider → Comercio
        origen = [ubicacionRider.lng, ubicacionRider.lat]
        destino = [pedido.comercio?.longitud, pedido.comercio?.latitud]
      } else if (pedido.estado === 'recogido' || pedido.estado === 'en_camino' || pedido.estado === 'llegada_cliente') {
        // Ruta: Rider → Cliente
        origen = [ubicacionRider.lng, ubicacionRider.lat]
        destino = [pedido.longitud_entrega, pedido.latitud_entrega]
      }

      if (!origen || !destino || destino.includes(null)) {
        console.log('Coordenadas incompletas para calcular ruta')
        return
      }

      // Usar OpenRouteService (API gratuita)
      const ORS_API_KEY = '5b3ce3597851110001cf62484c8fe7dd4ee34fc0959cb088e67f53c1'
      
      const response = await fetch(
        `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${origen[0]},${origen[1]}&end=${destino[0]},${destino[1]}`,
        {
          headers: {
            'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8'
          }
        }
      )

      if (!response.ok) {
        throw new Error('Error calculando ruta')
      }

      const data = await response.json()
      
      if (data.features && data.features[0]) {
        const coordinates = data.features[0].geometry.coordinates
        const properties = data.features[0].properties
        
        // Convertir coordenadas de [lng, lat] a [lat, lng] para Leaflet
        const rutaLeaflet = coordinates.map(coord => [coord[1], coord[0]])
        
        setRutaActual(rutaLeaflet)
        setInfoRuta({
          distancia: (properties.segments[0].distance / 1000).toFixed(1), // km
          duracion: Math.round(properties.segments[0].duration / 60) // minutos
        })
      }
    } catch (error) {
      console.error('Error calculando ruta:', error)
      // Fallback: línea recta
      calcularRutaLineal(pedido)
    } finally {
      setCargandoRuta(false)
    }
  }

  const calcularRutaLineal = (pedido) => {
    if (!ubicacionRider || !pedido) return

    let destino
    if (pedido.estado === 'asignado' || pedido.estado === 'en_comercio') {
      destino = { lat: pedido.comercio?.latitud, lng: pedido.comercio?.longitud }
    } else {
      destino = { lat: pedido.latitud_entrega, lng: pedido.longitud_entrega }
    }

    if (destino.lat && destino.lng) {
      setRutaActual([
        [ubicacionRider.lat, ubicacionRider.lng],
        [destino.lat, destino.lng]
      ])
      
      // Calcular distancia lineal aproximada
      const distancia = calcularDistanciaLineal(
        ubicacionRider.lat, ubicacionRider.lng,
        destino.lat, destino.lng
      )
      setInfoRuta({
        distancia: distancia.toFixed(1),
        duracion: Math.round(distancia * 3) // Aprox 3 min por km
      })
    }
  }

  const calcularDistanciaLineal = (lat1, lon1, lat2, lon2) => {
    const R = 6371
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    return R * c
  }

  // ============================================
  // MANEJO DE PEDIDOS
  // ============================================

  const handleAceptarPedido = async (pedido) => {
    try {
      await aceptarPedido(pedido.id)
      await cargarPedidos()
      setVistaActual('detalles')
    } catch (error) {
      console.error('Error aceptando pedido:', error)
      alert('Error al aceptar el pedido')
    }
  }

  const handleCambiarEstado = async (nuevoEstado) => {
    try {
      let data = { estado: nuevoEstado }
      
      if (nuevoEstado === 'recogido' && pedidoActivo.tipo === 'compra') {
        if (!facturaInput || !archivoComprobante) {
          alert('Debes ingresar el monto y subir la foto de la factura')
          return
        }
        data.monto_factura = parseFloat(facturaInput)
      }
      
      await actualizarEstadoPedido(pedidoActivo.id, data)
      
      if (nuevoEstado === 'recogido' && pedidoActivo.tipo === 'compra' && archivoComprobante) {
        await subirComprobante(pedidoActivo.id, archivoComprobante, 'factura')
      }
      
      if (nuevoEstado === 'entregado') {
        if (pedidoActivo.metodo_pago === 'efectivo') {
          const nuevoSaldo = parseFloat(rider.saldo_efectivo || 0) + parseFloat(pedidoActivo.monto_cobrar_rider || 0)
          await actualizarEfectivoRider(nuevoSaldo)
        }
        setFacturaInput('')
        setArchivoComprobante(null)
      }
      
      await cargarPedidos()
    } catch (error) {
      console.error('Error cambiando estado:', error)
      alert('Error al actualizar el estado')
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) setArchivoComprobante(file)
  }

  // Swipe handlers
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

  // ============================================
  // RENDERIZADO DE BOTONES SEGÚN ESTADO
  // ============================================

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

  // ============================================
  // RENDERIZADO DE DETALLES COMPLETOS DEL PEDIDO
  // ============================================

  const renderDetallesPedido = () => {
    if (!pedidoActivo) return null

    return (
      <div className="space-y-4">
        {/* Encabezado con estado */}
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

        {/* Información de ruta */}
        {infoRuta && (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">Distancia</p>
              <p className="text-2xl font-bold text-white">{infoRuta.distancia} km</p>
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-400 mb-1">Tiempo est.</p>
              <p className="text-2xl font-bold text-white">{infoRuta.duracion} min</p>
            </div>
          </div>
        )}

        {/* Información del comercio */}
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
            </div>
          </div>
        </div>

        {/* Información del cliente */}
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
            </div>
          </div>
        </div>

        {/* Detalles del pedido */}
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

        {/* Información de pago */}
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

        {/* Notas especiales */}
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

        {/* Botones de acción */}
        <div className="pt-4">
          {renderBotonesEstado()}
        </div>
      </div>
    )
  }

  // ============================================
  // UTILIDADES
  // ============================================
  
  const formatearMoneda = (valor) => `L ${parseFloat(valor || 0).toFixed(2)}`
  
  const calcularProgresGuaca = () => {
    const porcentaje = (parseFloat(rider?.saldo_efectivo || 0) / config?.limite_guaca) * 100
    return Math.min(porcentaje, 100)
  }

  // ============================================
  // RENDER PRINCIPAL
  // ============================================

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
    <div className={`min-h-screen ${modoOscuro ? 'bg-slate-900' : 'bg-gray-100'}`}>
      {/* Header */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-blue-600 to-purple-600 text-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuAbierto(!menuAbierto)} className="p-2">
              {menuAbierto ? <X size={24} /> : <Menu size={24} />}
            </button>
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
      </div>

      {/* VISTA PRINCIPAL: MAPA O DETALLES */}
      {pedidoActivo ? (
        // Vista con pedido activo
        <div className="h-screen flex flex-col">
          {/* Mapa */}
          <div className="flex-1 relative">
            {ubicacionRider && (
              <MapContainer
                center={[ubicacionRider.lat, ubicacionRider.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                
                <MapController center={[ubicacionRider.lat, ubicacionRider.lng]} zoom={14} />
                
                {/* Marcador del rider */}
                <Marker position={[ubicacionRider.lat, ubicacionRider.lng]} icon={riderIcon}>
                  <Popup>📍 Tu ubicación</Popup>
                </Marker>
                
                {/* Marcador del comercio */}
                {pedidoActivo.comercio?.latitud && pedidoActivo.comercio?.longitud && (
                  <Marker 
                    position={[pedidoActivo.comercio.latitud, pedidoActivo.comercio.longitud]} 
                    icon={comercioIcon}
                  >
                    <Popup>🏪 {pedidoActivo.comercio.nombre}</Popup>
                  </Marker>
                )}
                
                {/* Marcador del cliente */}
                {pedidoActivo.latitud_entrega && pedidoActivo.longitud_entrega && (
                  <Marker 
                    position={[pedidoActivo.latitud_entrega, pedidoActivo.longitud_entrega]} 
                    icon={clienteIcon}
                  >
                    <Popup>👤 Cliente</Popup>
                  </Marker>
                )}
                
                {/* Ruta */}
                {rutaActual && (
                  <Polyline 
                    positions={rutaActual} 
                    color="#3b82f6" 
                    weight={4} 
                    opacity={0.7}
                  />
                )}
              </MapContainer>
            )}
            
            {cargandoRuta && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-white rounded-lg shadow-lg px-4 py-2">
                <p className="text-sm text-gray-700">Calculando ruta...</p>
              </div>
            )}
          </div>
          
          {/* Panel de detalles deslizable */}
          <div className="bg-slate-900 rounded-t-3xl shadow-2xl p-6 max-h-[50vh] overflow-y-auto">
            {renderDetallesPedido()}
          </div>
        </div>
      ) : (
        // Vista sin pedido activo - Mapa con pedidos disponibles
        <div className="h-screen flex flex-col">
          <div className="flex-1 relative">
            {ubicacionRider && (
              <MapContainer
                center={[ubicacionRider.lat, ubicacionRider.lng]}
                zoom={13}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; OpenStreetMap contributors'
                />
                
                <MapController center={[ubicacionRider.lat, ubicacionRider.lng]} zoom={13} />
                
                {/* Marcador del rider */}
                <Marker position={[ubicacionRider.lat, ubicacionRider.lng]} icon={riderIcon}>
                  <Popup>📍 Tu ubicación</Popup>
                </Marker>
                
                {/* Marcadores de pedidos disponibles */}
                {pedidosEnMapa.map(pedido => {
                  if (pedido.comercio?.latitud && pedido.comercio?.longitud) {
                    return (
                      <Marker 
                        key={pedido.id}
                        position={[pedido.comercio.latitud, pedido.comercio.longitud]} 
                        icon={comercioIcon}
                      >
                        <Popup>
                          <div className="text-sm">
                            <p className="font-bold">{pedido.comercio.nombre}</p>
                            <p className="text-green-600 font-semibold">{formatearMoneda(pedido.ganancia_rider)}</p>
                          </div>
                        </Popup>
                      </Marker>
                    )
                  }
                  return null
                })}
                
                {/* Círculos de calor (zonas con más pedidos) */}
                {pedidosEnMapa.length > 3 && (
                  <Circle
                    center={[ubicacionRider.lat, ubicacionRider.lng]}
                    radius={2000}
                    pathOptions={{ color: 'blue', fillColor: 'blue', fillOpacity: 0.1 }}
                  />
                )}
              </MapContainer>
            )}
          </div>
          
          {/* Panel de pedidos disponibles */}
          <div className="bg-slate-900 rounded-t-3xl shadow-2xl p-6 max-h-[45vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              Pedidos Disponibles ({pedidosDisponibles.length})
            </h2>
            
            {pedidosDisponibles.length === 0 ? (
              <div className="bg-slate-800 rounded-xl p-6 text-center">
                <Package size={48} className="mx-auto mb-3 text-slate-500" />
                <p className="text-slate-400">No hay pedidos disponibles</p>
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
                      style={{ transform: `translateX(${swipeOffset}px)`, transition: isDragging.current ? 'none' : 'transform 0.3s' }}
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
  )
}
