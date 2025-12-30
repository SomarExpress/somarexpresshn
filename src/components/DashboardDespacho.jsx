import React, { useState, useEffect } from 'react'
import { 
  Package, TruckIcon, CheckCircle, Clock, XCircle, User, MapPin, 
  AlertCircle, Calendar, Menu, X, Plus, Home, Users, History,
  Navigation, Phone, DollarSign, Map, Briefcase
} from 'lucide-react'
import {
  obtenerConfiguracion, obtenerClientesConDirecciones, obtenerDireccionesCliente,
  insertarCliente, insertarDireccionCliente, insertarPedido, obtenerPedidosActivos,
  obtenerRidersDisponibles, obtenerComercios, subirComprobante,
  actualizarEstadoPedido, suscribirPedidos
} from '../lib/supabase'

const DashboardDespacho = () => {
  const [config, setConfig] = useState({ porcentaje_rider: 66.66, porcentaje_somar: 33.34, limite_guaca: 300 })
  const [pedidos, setPedidos] = useState([])
  const [riders, setRiders] = useState([])
  const [comercios, setComercios] = useState([])
  const [clientes, setClientes] = useState([])
  
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null)
  const [direccionesCliente, setDireccionesCliente] = useState([])
  const [direccionSeleccionada, setDireccionSeleccionada] = useState(null)
  const [comercioSeleccionado, setComercioSeleccionado] = useState(null)
  const [mostrarNuevoCliente, setMostrarNuevoCliente] = useState(false)
  const [mostrarNuevaDireccion, setMostrarNuevaDireccion] = useState(false)
  
  const [formData, setFormData] = useState({
    tipo: 'compra', cliente_id: '', direccion_cliente_id: '', cliente_nombre: '',
    cliente_telefono: '', direccion_entrega: '', latitud_entrega: '', longitud_entrega: '',
    referencia_entrega: '', comercio_id: '', rider_id: '', costo_envio: '',
    total_compra: '', propina: '', metodo_pago: 'efectivo', notas: ''
  })
  
  const [nuevoCliente, setNuevoCliente] = useState({ nombre_completo: '', telefono: '', email: '' })
  const [nuevaDireccion, setNuevaDireccion] = useState({ alias: '', direccion: '', latitud: '', longitud: '', referencia: '', es_principal: false })
  const [calculosActuales, setCalculosActuales] = useState({ ganancia_rider: 0, utilidad_somar: 0, monto_cobrar_rider: 0 })
  
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [mostrarSidebar, setMostrarSidebar] = useState(false)
  const [vistaActual, setVistaActual] = useState('despacho')

  useEffect(() => {
    cargarDatosIniciales()
    const subscription = suscribirPedidos(() => cargarPedidos())
    return () => subscription.unsubscribe()
  }, [])
  
  useEffect(() => {
    calcularValores()
  }, [formData.costo_envio, formData.total_compra, formData.propina, formData.metodo_pago, config])

  // Inicializar mapa
  useEffect(() => {
    if (pedidosEnCurso.length === 0) return
    
    const contenedor = document.getElementById('mapa-deliveries')
    if (!contenedor) return
    
    contenedor.innerHTML = ''
    
    const centroTegus = [14.0723, -87.1921]
    
    const mapa = window.L.map('mapa-deliveries').setView(centroTegus, 13)
    
    window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(mapa)
    
    const bounds = []
    
    pedidosEnCurso.forEach(pedido => {
      if (pedido.latitud_entrega && pedido.longitud_entrega) {
        const coords = [pedido.latitud_entrega, pedido.longitud_entrega]
        bounds.push(coords)
        
        const iconoColor = pedido.estado === 'asignado' ? 'blue' : 'purple'
        
        const marker = window.L.marker(coords, {
          icon: window.L.divIcon({
            className: 'custom-marker',
            html: `<div style="background: ${iconoColor === 'blue' ? '#3B82F6' : '#8B5CF6'}; width: 30px; height: 30px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 12px;">${pedido.numero_pedido?.split('-')[1] || '?'}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          })
        }).addTo(mapa)
        
        marker.bindPopup(`
          <div style="padding: 8px; min-width: 200px;">
            <h4 style="font-weight: bold; margin-bottom: 8px; color: #1e293b;">${pedido.numero_pedido}</h4>
            <p style="font-size: 13px; margin: 4px 0;"><strong>Cliente:</strong> ${pedido.cliente_nombre}</p>
            <p style="font-size: 12px; margin: 4px 0; color: #64748b;">${pedido.direccion_entrega}</p>
            ${pedido.rider_nombre ? `<p style="font-size: 12px; margin: 4px 0;"><strong>Rider:</strong> ${pedido.rider_nombre}</p>` : ''}
            <p style="font-size: 12px; margin-top: 8px; padding: 4px 8px; background: ${iconoColor === 'blue' ? '#DBEAFE' : '#E9D5FF'}; border-radius: 4px; text-align: center; font-weight: 600; color: ${iconoColor === 'blue' ? '#1E40AF' : '#6B21A8'};">
              ${pedido.estado === 'asignado' ? 'ASIGNADO' : 'EN RUTA'}
            </p>
          </div>
        `)
      }
    })
    
    if (bounds.length > 0) {
      mapa.fitBounds(bounds, { padding: [50, 50] })
    }
    
    return () => {
      mapa.remove()
    }
  }, [pedidosEnCurso])

  const cargarDatosIniciales = async () => {
    try {
      setLoading(true)
      const [configData, pedidosData, ridersData, comerciosData, clientesData] = await Promise.all([
        obtenerConfiguracion(), obtenerPedidosActivos(), obtenerRidersDisponibles(),
        obtenerComercios(), obtenerClientesConDirecciones()
      ])
      setConfig(configData)
      setPedidos(pedidosData)
      setRiders(ridersData)
      setComercios(comerciosData)
      setClientes(clientesData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  const cargarPedidos = async () => {
    try {
      const data = await obtenerPedidosActivos()
      setPedidos(data)
    } catch (err) {
      console.error('Error:', err)
    }
  }

  const calcularValores = () => {
    const costoEnvio = parseFloat(formData.costo_envio) || 0
    const totalCompra = parseFloat(formData.total_compra) || 0
    const propina = parseFloat(formData.propina) || 0
    const gananciaRider = (costoEnvio * config.porcentaje_rider / 100) + propina
    const utilidadSomar = costoEnvio * config.porcentaje_somar / 100
    const montoCobrarRider = formData.metodo_pago === 'efectivo' ? totalCompra + costoEnvio + propina : 0
    setCalculosActuales({
      ganancia_rider: gananciaRider.toFixed(2),
      utilidad_somar: utilidadSomar.toFixed(2),
      monto_cobrar_rider: montoCobrarRider.toFixed(2)
    })
  }

  const handleInputChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSeleccionarCliente = async (clienteId) => {
    if (clienteId === 'nuevo') {
      setMostrarNuevoCliente(true)
      setClienteSeleccionado(null)
      setDireccionesCliente([])
      setDireccionSeleccionada(null)
      setFormData(prev => ({ ...prev, cliente_id: '', direccion_cliente_id: '', direccion_entrega: '', latitud_entrega: '', longitud_entrega: '' }))
      return
    }
    const cliente = clientes.find(c => c.cliente_id === clienteId)
    setClienteSeleccionado(cliente)
    setDireccionesCliente(cliente?.direcciones || [])
    setMostrarNuevoCliente(false)
    setMostrarNuevaDireccion(false)
    setFormData(prev => ({ ...prev, cliente_id: clienteId, cliente_nombre: cliente?.nombre_completo || '', cliente_telefono: cliente?.telefono || '' }))
    const direccionPrincipal = cliente?.direcciones?.find(d => d.es_principal)
    if (direccionPrincipal) handleSeleccionarDireccion(direccionPrincipal)
  }

  const handleSeleccionarDireccion = (direccion) => {
    if (direccion === 'nueva') {
      setMostrarNuevaDireccion(true)
      setDireccionSeleccionada(null)
      setFormData(prev => ({ ...prev, direccion_cliente_id: '', direccion_entrega: '', latitud_entrega: '', longitud_entrega: '' }))
      return
    }
    setDireccionSeleccionada(direccion)
    setMostrarNuevaDireccion(false)
    setFormData(prev => ({
      ...prev, direccion_cliente_id: direccion.id, direccion_entrega: direccion.direccion,
      latitud_entrega: direccion.latitud, longitud_entrega: direccion.longitud, referencia_entrega: direccion.referencia || ''
    }))
  }

  const handleSeleccionarComercio = (comercioId) => {
    const comercio = comercios.find(c => c.id === comercioId)
    setComercioSeleccionado(comercio)
    setFormData(prev => ({ ...prev, comercio_id: comercioId }))
  }

  const handleCrearNuevaDireccion = async () => {
    try {
      if (!clienteSeleccionado || !nuevaDireccion.direccion) {
        setError('Faltan datos obligatorios')
        return
      }
      await insertarDireccionCliente({ cliente_id: clienteSeleccionado.cliente_id, ...nuevaDireccion })
      const direccionesActualizadas = await obtenerDireccionesCliente(clienteSeleccionado.cliente_id)
      setDireccionesCliente(direccionesActualizadas)
      setMostrarNuevaDireccion(false)
      setNuevaDireccion({ alias: '', direccion: '', latitud: '', longitud: '', referencia: '', es_principal: false })
      setSuccess('✅ Dirección agregada')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Error: ' + err.message)
    }
  }

  const handleSubmitPedido = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      setError(null)
      
      if (mostrarNuevoCliente && nuevoCliente.nombre_completo) {
        const clienteCreado = await insertarCliente(nuevoCliente)
        if (nuevaDireccion.direccion) {
          await insertarDireccionCliente({
            cliente_id: clienteCreado.id,
            ...nuevaDireccion,
            es_principal: true
          })
        }
        await cargarDatosIniciales()
        setFormData(prev => ({
          ...prev,
          cliente_id: clienteCreado.id,
          cliente_nombre: nuevoCliente.nombre_completo,
          cliente_telefono: nuevoCliente.telefono,
          direccion_entrega: nuevaDireccion.direccion,
          latitud_entrega: nuevaDireccion.latitud,
          longitud_entrega: nuevaDireccion.longitud
        }))
      }
      
      const nuevoPedido = {
        tipo: formData.tipo, cliente_id: formData.cliente_id || null,
        direccion_cliente_id: formData.direccion_cliente_id || null,
        cliente_nombre: formData.cliente_nombre || nuevoCliente.nombre_completo,
        cliente_telefono: formData.cliente_telefono || nuevoCliente.telefono,
        direccion_entrega: formData.direccion_entrega,
        latitud_entrega: parseFloat(formData.latitud_entrega) || null,
        longitud_entrega: parseFloat(formData.longitud_entrega) || null,
        comercio_id: formData.comercio_id || null,
        rider_id: formData.rider_id || null,
        costo_envio: parseFloat(formData.costo_envio) || 0,
        total_compra: parseFloat(formData.total_compra) || 0,
        propina: parseFloat(formData.propina) || 0,
        metodo_pago: formData.metodo_pago,
        notas: formData.notas,
        estado: formData.rider_id ? 'asignado' : 'pendiente',
        asignado_at: formData.rider_id ? new Date().toISOString() : null
      }
      
      const pedidoCreado = await insertarPedido(nuevoPedido)
      setSuccess(`✅ Pedido ${pedidoCreado.numero_pedido} creado`)
      
      setFormData({ tipo: 'compra', cliente_id: '', direccion_cliente_id: '', cliente_nombre: '', cliente_telefono: '', direccion_entrega: '', latitud_entrega: '', longitud_entrega: '', referencia_entrega: '', comercio_id: '', rider_id: '', costo_envio: '', total_compra: '', propina: '', metodo_pago: 'efectivo', notas: '' })
      setClienteSeleccionado(null)
      setDireccionSeleccionada(null)
      setDireccionesCliente([])
      setComercioSeleccionado(null)
      setMostrarNuevoCliente(false)
      setMostrarNuevaDireccion(false)
      setNuevoCliente({ nombre_completo: '', telefono: '', email: '' })
      setNuevaDireccion({ alias: '', direccion: '', latitud: '', longitud: '', referencia: '', es_principal: false })
      
      await cargarPedidos()
      setMostrarFormulario(false)
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleCambiarEstado = async (pedidoId, nuevoEstado) => {
    try {
      await actualizarEstadoPedido(pedidoId, nuevoEstado)
      setSuccess('✅ Estado actualizado')
      await cargarPedidos()
      setTimeout(() => setSuccess(null), 2000)
    } catch (err) {
      setError(err.message)
    }
  }

  const formatearMoneda = (valor) => `L ${parseFloat(valor || 0).toFixed(2)}`
  const getIconoDireccion = (alias) => {
    if (alias?.toLowerCase().includes('casa')) return <Home size={14} />
    if (alias?.toLowerCase().includes('trabajo') || alias?.toLowerCase().includes('oficina')) return <Briefcase size={14} />
    return <MapPin size={14} />
  }
  
  const pedidosSinAsignar = pedidos.filter(p => p.estado === 'pendiente')
  const pedidosEnCurso = pedidos.filter(p => ['asignado', 'en_camino'].includes(p.estado))
  const pedidosFinalizados = pedidos.filter(p => p.estado === 'entregado')


  const TarjetaPedido = ({ pedido }) => (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-base text-slate-900">{pedido.numero_pedido}</h3>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <Clock size={12} />
            {new Date(pedido.created_at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        {pedido.estado === 'asignado' && (
          <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full font-medium">ASIGNADO</span>
        )}
        {pedido.estado === 'en_camino' && (
          <span className="bg-purple-100 text-purple-800 text-xs px-2 py-1 rounded-full font-medium flex items-center gap-1">
            <TruckIcon size={12} /> EN RUTA
          </span>
        )}
      </div>

      <div className="space-y-2 text-sm mb-3">
        <div className="flex items-center gap-2">
          <User size={14} className="text-slate-400" />
          <span className="font-medium text-slate-700">{pedido.cliente_nombre}</span>
        </div>
        <div className="flex items-start gap-2">
          <MapPin size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
          <span className="text-slate-600 text-xs line-clamp-2">{pedido.direccion_entrega}</span>
        </div>
        {pedido.comercio_nombre && (
          <div className="flex items-center gap-2">
            <Package size={14} className="text-slate-400" />
            <span className="text-slate-600 text-xs">{pedido.comercio_nombre}</span>
          </div>
        )}
        {pedido.rider_nombre && (
          <div className="flex items-center gap-2">
            <TruckIcon size={14} className="text-slate-400" />
            <span className="text-slate-600 text-xs">{pedido.rider_nombre}</span>
          </div>
        )}
      </div>

      <div className="border-t pt-3 mb-3">
        <div className="flex justify-between text-sm">
          <span className="text-slate-600">Total:</span>
          <span className="font-bold text-blue-600">{formatearMoneda(pedido.monto_cobrar_rider)}</span>
        </div>
      </div>

      <div className="flex gap-2">
        {pedido.estado === 'pendiente' && (
          <button
            onClick={() => handleCambiarEstado(pedido.id, 'en_camino')}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1"
          >
            <TruckIcon size={14} /> Iniciar Entrega
          </button>
        )}
        {pedido.estado === 'asignado' && (
          <button
            onClick={() => handleCambiarEstado(pedido.id, 'en_camino')}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1"
          >
            <TruckIcon size={14} /> Iniciar Ruta
          </button>
        )}
        {pedido.estado === 'en_camino' && (
          <button
            onClick={() => handleCambiarEstado(pedido.id, 'entregado')}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-2 rounded-lg flex items-center justify-center gap-1"
          >
            <CheckCircle size={14} /> Marcar Entregado
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 transform transition-transform duration-300 ${mostrarSidebar ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <TruckIcon className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Somar Express</h1>
              <p className="text-xs text-slate-600">Dashboard</p>
            </div>
          </div>
        </div>

        <nav className="p-4 space-y-2">
          <button
            onClick={() => { setVistaActual('despacho'); setMostrarSidebar(false) }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${vistaActual === 'despacho' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <Home size={20} /> Despacho
          </button>
          <button
            onClick={() => { setVistaActual('historial'); setMostrarSidebar(false) }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${vistaActual === 'historial' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <History size={20} /> Historial Completos
          </button>
          <button
            onClick={() => { setVistaActual('cancelados'); setMostrarSidebar(false) }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${vistaActual === 'cancelados' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <XCircle size={20} /> Cancelados
          </button>
          <button
            onClick={() => { setVistaActual('clientes'); setMostrarSidebar(false) }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${vistaActual === 'clientes' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <Users size={20} /> Clientes
          </button>
          <button
            onClick={() => { setVistaActual('riders'); setMostrarSidebar(false) }}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${vistaActual === 'riders' ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
          >
            <TruckIcon size={20} /> Deliveries
          </button>
        </nav>
      </div>

      {/* Main Content */}
      <div className="flex-1 lg:ml-64">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
          <div className="px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={() => setMostrarSidebar(!mostrarSidebar)} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
                <Menu size={24} />
              </button>
              <h2 className="text-xl font-bold text-slate-900">Despacho</h2>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-600">Límite Guaca</p>
                <p className="text-sm font-bold text-blue-600">{formatearMoneda(config.limite_guaca)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-600">Activos</p>
                <p className="text-sm font-bold text-green-600">{pedidos.length}</p>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div className="mx-4 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
            <div className="flex-1">
              <p className="font-medium text-red-900 text-sm">Error</p>
              <p className="text-sm text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600"><XCircle size={20} /></button>
          </div>
        )}
        
        {success && (
          <div className="mx-4 mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircle className="text-green-600 flex-shrink-0" size={20} />
            <p className="text-sm text-green-800 flex-1">{success}</p>
            <button onClick={() => setSuccess(null)} className="text-green-600"><XCircle size={20} /></button>
          </div>
        )}

        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
            <div className="bg-slate-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  Sin Asignar
                  <span className="bg-yellow-100 text-yellow-800 text-xs px-2 py-0.5 rounded-full ml-2">{pedidosSinAsignar.length}</span>
                </h3>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                {pedidosSinAsignar.map(pedido => <TarjetaPedido key={pedido.id} pedido={pedido} />)}
                {pedidosSinAsignar.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay pedidos</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  En Curso
                  <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full ml-2">{pedidosEnCurso.length}</span>
                </h3>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                {pedidosEnCurso.map(pedido => <TarjetaPedido key={pedido.id} pedido={pedido} />)}
                {pedidosEnCurso.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <TruckIcon size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay pedidos</p>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-100 rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  Finalizados Hoy
                  <span className="bg-green-100 text-green-800 text-xs px-2 py-0.5 rounded-full ml-2">{pedidosFinalizados.length}</span>
                </h3>
              </div>
              <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                {pedidosFinalizados.map(pedido => <TarjetaPedido key={pedido.id} pedido={pedido} />)}
                {pedidosFinalizados.length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <CheckCircle size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No hay pedidos</p>
                  </div>
                )}
              </div>
            </div>
          </div>

<div className="bg-white rounded-lg border border-slate-200 p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Map size={20} className="text-blue-600" />
              Mapa de Deliveries Activos ({pedidosEnCurso.length})
            </h3>
            <div className="relative">
              <div 
                id="mapa-deliveries" 
                className="rounded-lg h-96 border border-slate-300"
                style={{ minHeight: '400px' }}
              ></div>
              {pedidosEnCurso.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center bg-slate-50 bg-opacity-90 rounded-lg">
                  <div className="text-center">
                    <TruckIcon size={48} className="mx-auto text-slate-300 mb-2" />
                    <p className="text-slate-500 text-sm">No hay deliveries activos</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={() => setMostrarFormulario(true)}
        className="fixed bottom-6 right-6 w-16 h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg flex items-center justify-center z-50 transition-transform hover:scale-110"
      >
        <Plus size={28} />
      </button>


      {mostrarFormulario && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Nuevo Pedido</h2>
              <button onClick={() => setMostrarFormulario(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={24} />
              </button>
            </div>
            
            <form onSubmit={handleSubmitPedido} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Pedido</label>
                <select
                  name="tipo"
                  value={formData.tipo}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="compra">Compra</option>
                  <option value="recolecta">Recolecta</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Cliente *</label>
                <select
                  value={clienteSeleccionado?.cliente_id || ''}
                  onChange={(e) => handleSeleccionarCliente(e.target.value)}
                  required={!mostrarNuevoCliente}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar Cliente --</option>
                  {clientes.map(cliente => (
                    <option key={cliente.cliente_id} value={cliente.cliente_id}>
                      {cliente.nombre_completo} {cliente.telefono ? `(${cliente.telefono})` : ''}
                    </option>
                  ))}
                  <option value="nuevo">➕ Nuevo Cliente</option>
                </select>
              </div>

              {mostrarNuevoCliente && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-yellow-900">Nuevo Cliente</h4>
                    <button
                      type="button"
                      onClick={() => setMostrarNuevoCliente(false)}
                      className="text-yellow-600 hover:text-yellow-800"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Nombre completo *"
                    value={nuevoCliente.nombre_completo}
                    onChange={(e) => setNuevoCliente(prev => ({ ...prev, nombre_completo: e.target.value }))}
                    required
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Teléfono"
                    value={nuevoCliente.telefono}
                    onChange={(e) => setNuevoCliente(prev => ({ ...prev, telefono: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <input
                    type="email"
                    placeholder="Email (opcional)"
                    value={nuevoCliente.email}
                    onChange={(e) => setNuevoCliente(prev => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  
                  <div className="border-t border-yellow-300 pt-3">
                    <p className="text-xs font-medium text-yellow-900 mb-2">Dirección Principal</p>
                    <input
                      type="text"
                      placeholder="Alias (ej: Casa, Trabajo)"
                      value={nuevaDireccion.alias}
                      onChange={(e) => setNuevaDireccion(prev => ({ ...prev, alias: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg mb-2"
                    />
                    <textarea
                      placeholder="Dirección completa *"
                      value={nuevaDireccion.direccion}
                      onChange={(e) => setNuevaDireccion(prev => ({ ...prev, direccion: e.target.value }))}
                      required
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg mb-2"
                    />
                    <div>
                      <input
                        type="text"
                        placeholder="Coordenadas: 15.6742, -87.9416"
                        value={`${nuevaDireccion.latitud || ''}${nuevaDireccion.latitud && nuevaDireccion.longitud ? ', ' : ''}${nuevaDireccion.longitud || ''}`}
                        onChange={(e) => {
                          const coords = e.target.value.split(',').map(c => c.trim())
                          setNuevaDireccion(prev => ({
                            ...prev,
                            latitud: coords[0] || '',
                            longitud: coords[1] || ''
                          }))
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                      />
                      <p className="text-xs text-slate-500 mt-1">Pega las coordenadas de Google Maps (lat, lon)</p>
                    </div>
                    <textarea
                      placeholder="Referencia"
                      value={nuevaDireccion.referencia}
                      onChange={(e) => setNuevaDireccion(prev => ({ ...prev, referencia: e.target.value }))}
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg mt-2"
                    />
                  </div>
                </div>
              )}

              {clienteSeleccionado && direccionesCliente.length > 0 && !mostrarNuevoCliente && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección de Entrega *</label>
                  <select
                    value={direccionSeleccionada?.id || ''}
                    onChange={(e) => {
                      const dir = direccionesCliente.find(d => d.id === e.target.value)
                      handleSeleccionarDireccion(dir || 'nueva')
                    }}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">-- Seleccionar Dirección --</option>
                    {direccionesCliente.map(direccion => (
                      <option key={direccion.id} value={direccion.id}>
                        {direccion.alias ? `${direccion.alias} - ` : ''}{direccion.direccion}
                      </option>
                    ))}
                    <option value="nueva">➕ Nueva Dirección</option>
                  </select>
                  
                  {direccionSeleccionada && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-100">
                      <div className="flex items-start gap-2">
                        {getIconoDireccion(direccionSeleccionada.alias)}
                        <div className="flex-1">
                          <p className="font-medium text-sm">{direccionSeleccionada.direccion}</p>
                          {direccionSeleccionada.referencia && (
                            <p className="text-slate-600 text-xs mt-1">📝 {direccionSeleccionada.referencia}</p>
                          )}
                          {direccionSeleccionada.latitud && direccionSeleccionada.longitud && (
                            <p className="text-slate-500 text-xs mt-1 flex items-center gap-1">
                              <Navigation size={12} />
                              {direccionSeleccionada.latitud}, {direccionSeleccionada.longitud}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {mostrarNuevaDireccion && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm text-blue-900">Nueva Dirección</h4>
                    <button
                      type="button"
                      onClick={() => setMostrarNuevaDireccion(false)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <XCircle size={16} />
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="Alias (ej: Casa, Trabajo)"
                    value={nuevaDireccion.alias}
                    onChange={(e) => setNuevaDireccion(prev => ({ ...prev, alias: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <textarea
                    placeholder="Dirección completa *"
                    value={nuevaDireccion.direccion}
                    onChange={(e) => setNuevaDireccion(prev => ({ ...prev, direccion: e.target.value }))}
                    required
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <div>
                    <input
                      type="text"
                      placeholder="Coordenadas: 15.6742, -87.9416"
                      value={`${nuevaDireccion.latitud || ''}${nuevaDireccion.latitud && nuevaDireccion.longitud ? ', ' : ''}${nuevaDireccion.longitud || ''}`}
                      onChange={(e) => {
                        const coords = e.target.value.split(',').map(c => c.trim())
                        setNuevaDireccion(prev => ({
                          ...prev,
                          latitud: coords[0] || '',
                          longitud: coords[1] || ''
                        }))
                      }}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                    />
                    <p className="text-xs text-slate-500 mt-1">Pega las coordenadas de Google Maps (lat, lon)</p>
                  </div>
                  <textarea
                    placeholder="Referencia"
                    value={nuevaDireccion.referencia}
                    onChange={(e) => setNuevaDireccion(prev => ({ ...prev, referencia: e.target.value }))}
                    rows={2}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleCrearNuevaDireccion}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg"
                  >
                    Guardar Dirección
                  </button>
                </div>
              )}

              {!clienteSeleccionado && !mostrarNuevoCliente && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Dirección de Entrega *</label>
                  <textarea
                    name="direccion_entrega"
                    value={formData.direccion_entrega}
                    onChange={handleInputChange}
                    required
                    rows={2}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Col. Palmira, Ave. República..."
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Comercio (opcional)</label>
                <select
                  name="comercio_id"
                  value={formData.comercio_id}
                  onChange={(e) => handleSeleccionarComercio(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Seleccionar --</option>
                  {comercios.map(comercio => (
                    <option key={comercio.id} value={comercio.id}>
                      {comercio.nombre}
                    </option>
                  ))}
                </select>
                {comercioSeleccionado && comercioSeleccionado.latitud && (
                  <div className="mt-2 p-2 bg-green-50 rounded text-xs border border-green-100">
                    <p className="font-medium">{comercioSeleccionado.direccion}</p>
                    {comercioSeleccionado.referencia && (
                      <p className="text-slate-600 mt-1">📝 {comercioSeleccionado.referencia}</p>
                    )}
                    <p className="text-slate-500 mt-1 flex items-center gap-1">
                      <Navigation size={12} />
                      {comercioSeleccionado.latitud}, {comercioSeleccionado.longitud}
                    </p>
                  </div>
                )}
              </div>


              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Asignar Rider (opcional)</label>
                <select
                  name="rider_id"
                  value={formData.rider_id}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Sin asignar --</option>
                  {riders.map(rider => (
                    <option key={rider.id} value={rider.id}>
                      {rider.nombre_completo} ({formatearMoneda(rider.saldo_efectivo)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Costo Envío *</label>
                  <input
                    type="number"
                    name="costo_envio"
                    value={formData.costo_envio}
                    onChange={handleInputChange}
                    required
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Total Compra</label>
                  <input
                    type="number"
                    name="total_compra"
                    value={formData.total_compra}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Propina</label>
                <input
                  type="number"
                  name="propina"
                  value={formData.propina}
                  onChange={handleInputChange}
                  step="0.01"
                  min="0"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Método de Pago</label>
                <select
                  name="metodo_pago"
                  value={formData.metodo_pago}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="efectivo">💵 Efectivo</option>
                  <option value="transferencia">🏦 Transferencia</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notas</label>
                <textarea
                  name="notas"
                  value={formData.notas}
                  onChange={handleInputChange}
                  rows={2}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Instrucciones especiales..."
                />
              </div>

              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-4 space-y-2 border border-blue-200">
                <h3 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
                  <DollarSign size={16} className="text-blue-600" />
                  Desglose Financiero
                </h3>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Ganancia Rider:</span>
                  <span className="font-bold text-green-600">
                    {formatearMoneda(calculosActuales.ganancia_rider)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm text-slate-600">Utilidad Somar:</span>
                  <span className="font-bold text-blue-600">
                    {formatearMoneda(calculosActuales.utilidad_somar)}
                  </span>
                </div>
                
                <div className="border-t border-blue-300 pt-2 mt-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">Monto a Cobrar:</span>
                    <span className="font-bold text-lg text-slate-900">
                      {formatearMoneda(calculosActuales.monto_cobrar_rider)}
                    </span>
                  </div>
                  {formData.metodo_pago === 'transferencia' && (
                    <p className="text-xs text-slate-500 mt-1">✅ El cliente pagará por transferencia</p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setMostrarFormulario(false)}
                  className="flex-1 px-4 py-3 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      Creando...
                    </>
                  ) : (
                    <>
                      <Package size={18} />
                      Crear Pedido
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DashboardDespacho
