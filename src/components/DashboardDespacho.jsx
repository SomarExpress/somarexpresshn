import React, { useState, useEffect } from 'react'
import { 
  Package, 
  TruckIcon, 
  DollarSign, 
  Upload, 
  CheckCircle, 
  Clock, 
  XCircle,
  User,
  Phone,
  MapPin,
  AlertCircle,
  Calendar,
  CreditCard,
  Banknote,
  Menu,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import {
  supabase,
  obtenerConfiguracion,
  insertarPedido,
  obtenerPedidosActivos,
  obtenerRidersDisponibles,
  obtenerComercios,
  subirComprobante,
  actualizarEstadoPedido,
  asignarRider,
  suscribirPedidos
} from '../lib/supabase'

const DashboardDespacho = () => {
  // =====================================================
  // ESTADO
  // =====================================================
  const [config, setConfig] = useState({
    porcentaje_rider: 66.66,
    porcentaje_somar: 33.34,
    limite_guaca: 300
  })
  
  const [pedidos, setPedidos] = useState([])
  const [riders, setRiders] = useState([])
  const [comercios, setComercios] = useState([])
  
  // Formulario de nuevo pedido
  const [formData, setFormData] = useState({
    tipo: 'compra',
    cliente_nombre: '',
    cliente_telefono: '',
    direccion_entrega: '',
    comercio_id: '',
    rider_id: '',
    costo_envio: '',
    total_compra: '',
    propina: '',
    metodo_pago: 'efectivo',
    notas: ''
  })
  
  // Cálculos en tiempo real
  const [calculosActuales, setCalculosActuales] = useState({
    ganancia_rider: 0,
    utilidad_somar: 0,
    monto_cobrar_rider: 0
  })
  
  // UI States
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null)
  const [mostrarFormulario, setMostrarFormulario] = useState(false)
  const [pedidosExpandidos, setPedidosExpandidos] = useState({})

  // =====================================================
  // EFFECTS
  // =====================================================
  
  useEffect(() => {
    cargarDatosIniciales()
    
    // Suscripción a cambios en tiempo real
    const subscription = suscribirPedidos((payload) => {
      console.log('Cambio detectado en pedidos:', payload)
      cargarPedidos()
    })
    
    return () => {
      subscription.unsubscribe()
    }
  }, [])
  
  useEffect(() => {
    calcularValores()
  }, [formData.costo_envio, formData.total_compra, formData.propina, formData.metodo_pago, config])

  // =====================================================
  // FUNCIONES DE CARGA
  // =====================================================
  
  const cargarDatosIniciales = async () => {
    try {
      setLoading(true)
      const [configData, pedidosData, ridersData, comerciosData] = await Promise.all([
        obtenerConfiguracion(),
        obtenerPedidosActivos(),
        obtenerRidersDisponibles(),
        obtenerComercios()
      ])
      
      setConfig(configData)
      setPedidos(pedidosData)
      setRiders(ridersData)
      setComercios(comerciosData)
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
      console.error('Error al cargar pedidos:', err)
    }
  }

  // =====================================================
  // CÁLCULOS FINANCIEROS
  // =====================================================
  
  const calcularValores = () => {
    const costoEnvio = parseFloat(formData.costo_envio) || 0
    const totalCompra = parseFloat(formData.total_compra) || 0
    const propina = parseFloat(formData.propina) || 0
    
    const gananciaRider = (costoEnvio * config.porcentaje_rider / 100) + propina
    const utilidadSomar = costoEnvio * config.porcentaje_somar / 100
    
    let montoCobrarRider = 0
    if (formData.metodo_pago === 'efectivo') {
      montoCobrarRider = totalCompra + costoEnvio + propina
    }
    
    setCalculosActuales({
      ganancia_rider: gananciaRider.toFixed(2),
      utilidad_somar: utilidadSomar.toFixed(2),
      monto_cobrar_rider: montoCobrarRider.toFixed(2)
    })
  }

  // =====================================================
  // HANDLERS
  // =====================================================
  
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }
  
  const handleSubmitPedido = async (e) => {
    e.preventDefault()
    
    try {
      setLoading(true)
      setError(null)
      
      // Validaciones
      if (!formData.cliente_nombre || !formData.direccion_entrega) {
        throw new Error('Faltan campos obligatorios')
      }
      
      const nuevoPedido = {
        tipo: formData.tipo,
        cliente_nombre: formData.cliente_nombre,
        cliente_telefono: formData.cliente_telefono,
        direccion_entrega: formData.direccion_entrega,
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
      
      setSuccess(`✅ Pedido ${pedidoCreado.numero_pedido} creado exitosamente`)
      
      // Limpiar formulario
      setFormData({
        tipo: 'compra',
        cliente_nombre: '',
        cliente_telefono: '',
        direccion_entrega: '',
        comercio_id: '',
        rider_id: '',
        costo_envio: '',
        total_compra: '',
        propina: '',
        metodo_pago: 'efectivo',
        notas: ''
      })
      
      // Recargar pedidos y ocultar formulario en móvil
      await cargarPedidos()
      setMostrarFormulario(false)
      
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }
  
  const handleSubirComprobante = async (pedidoId, archivo) => {
    try {
      setLoading(true)
      await subirComprobante(pedidoId, archivo)
      setSuccess('✅ Comprobante subido y validado')
      await cargarPedidos()
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError('Error al subir comprobante: ' + err.message)
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

  const togglePedidoExpandido = (pedidoId) => {
    setPedidosExpandidos(prev => ({
      ...prev,
      [pedidoId]: !prev[pedidoId]
    }))
  }

  // =====================================================
  // RENDER HELPERS
  // =====================================================
  
  const getEstadoBadge = (estado) => {
    const badges = {
      pendiente: { color: 'bg-yellow-100 text-yellow-800', icon: Clock, text: 'Pendiente' },
      asignado: { color: 'bg-blue-100 text-blue-800', icon: User, text: 'Asignado' },
      en_camino: { color: 'bg-purple-100 text-purple-800', icon: TruckIcon, text: 'En Camino' },
      entregado: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Entregado' },
      cancelado: { color: 'bg-red-100 text-red-800', icon: XCircle, text: 'Cancelado' }
    }
    
    const badge = badges[estado] || badges.pendiente
    const Icon = badge.icon
    
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs sm:text-sm font-medium ${badge.color}`}>
        <Icon size={12} className="sm:w-4 sm:h-4" />
        <span className="hidden sm:inline">{badge.text}</span>
      </span>
    )
  }
  
  const formatearMoneda = (valor) => {
    return `L ${parseFloat(valor || 0).toFixed(2)}`
  }

  // =====================================================
  // RENDER PRINCIPAL
  // =====================================================
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-4 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="p-1.5 sm:p-2 bg-blue-600 rounded-lg">
                <TruckIcon className="text-white w-5 h-5 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h1 className="text-base sm:text-xl lg:text-2xl font-bold text-slate-900">Somar Express</h1>
                <p className="text-xs sm:text-sm text-slate-600 hidden sm:block">Dashboard de Despacho</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-600 hidden sm:block">Límite Guaca</p>
                <p className="text-sm sm:text-lg font-bold text-blue-600">{formatearMoneda(config.limite_guaca)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-600 hidden sm:block">Activos</p>
                <p className="text-sm sm:text-lg font-bold text-green-600">{pedidos.length}</p>
              </div>
              <button
                onClick={() => setMostrarFormulario(!mostrarFormulario)}
                className="lg:hidden p-2 bg-blue-600 text-white rounded-lg"
              >
                {mostrarFormulario ? <X size={20} /> : <Menu size={20} />}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Alertas */}
      {error && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-3 sm:mt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
            <AlertCircle className="text-red-600 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" />
            <div className="flex-1">
              <p className="font-medium text-red-900 text-sm sm:text-base">Error</p>
              <p className="text-xs sm:text-sm text-red-700">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-600 hover:text-red-800">
              <XCircle size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      )}
      
      {success && (
        <div className="max-w-7xl mx-auto px-3 sm:px-4 mt-3 sm:mt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 sm:p-4 flex items-start gap-2 sm:gap-3">
            <CheckCircle className="text-green-600 flex-shrink-0 w-4 h-4 sm:w-5 sm:h-5" />
            <p className="text-xs sm:text-sm text-green-800 flex-1">{success}</p>
            <button onClick={() => setSuccess(null)} className="text-green-600 hover:text-green-800">
              <XCircle size={16} className="sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-3 sm:py-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-6">
          
          {/* ===== FORMULARIO DE INGRESO RÁPIDO ===== */}
          <div className={`lg:col-span-1 ${mostrarFormulario ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Package size={20} className="text-blue-600 sm:w-6 sm:h-6" />
                Nuevo Pedido
              </h2>
              
              <form onSubmit={handleSubmitPedido} className="space-y-3 sm:space-y-4">
                {/* Tipo de Pedido */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Tipo de Pedido
                  </label>
                  <select
                    name="tipo"
                    value={formData.tipo}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="compra">Compra</option>
                    <option value="recolecta">Recolecta</option>
                  </select>
                </div>

                {/* Cliente */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Nombre del Cliente *
                  </label>
                  <input
                    type="text"
                    name="cliente_nombre"
                    value={formData.cliente_nombre}
                    onChange={handleInputChange}
                    required
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Juan Pérez"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    name="cliente_telefono"
                    value={formData.cliente_telefono}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="9999-9999"
                  />
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Dirección de Entrega *
                  </label>
                  <textarea
                    name="direccion_entrega"
                    value={formData.direccion_entrega}
                    onChange={handleInputChange}
                    required
                    rows={2}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Col. Palmira, Ave. República..."
                  />
                </div>

                {/* Comercio */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Comercio (opcional)
                  </label>
                  <select
                    name="comercio_id"
                    value={formData.comercio_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Seleccionar --</option>
                    {comercios.map(comercio => (
                      <option key={comercio.id} value={comercio.id}>
                        {comercio.nombre}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Rider */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Asignar Rider (opcional)
                  </label>
                  <select
                    name="rider_id"
                    value={formData.rider_id}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">-- Sin asignar --</option>
                    {riders.map(rider => (
                      <option key={rider.id} value={rider.id}>
                        {rider.nombre_completo} ({formatearMoneda(rider.saldo_efectivo)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Financiero */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                      Costo Envío *
                    </label>
                    <input
                      type="number"
                      name="costo_envio"
                      value={formData.costo_envio}
                      onChange={handleInputChange}
                      required
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                      Total Compra
                    </label>
                    <input
                      type="number"
                      name="total_compra"
                      value={formData.total_compra}
                      onChange={handleInputChange}
                      step="0.01"
                      min="0"
                      className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Propina
                  </label>
                  <input
                    type="number"
                    name="propina"
                    value={formData.propina}
                    onChange={handleInputChange}
                    step="0.01"
                    min="0"
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                </div>

                {/* Método de Pago */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Método de Pago
                  </label>
                  <select
                    name="metodo_pago"
                    value={formData.metodo_pago}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="efectivo">💵 Efectivo</option>
                    <option value="transferencia">🏦 Transferencia</option>
                  </select>
                </div>

                {/* Notas */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-slate-700 mb-1">
                    Notas
                  </label>
                  <textarea
                    name="notas"
                    value={formData.notas}
                    onChange={handleInputChange}
                    rows={2}
                    className="w-full px-3 py-2 text-sm sm:text-base border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Instrucciones especiales..."
                  />
                </div>

                {/* CÁLCULOS EN TIEMPO REAL */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-3 sm:p-4 space-y-2 border border-blue-200">
                  <h3 className="font-semibold text-slate-900 text-xs sm:text-sm mb-2 sm:mb-3 flex items-center gap-2">
                    <DollarSign size={14} className="text-blue-600 sm:w-4 sm:h-4" />
                    Desglose Financiero
                  </h3>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-slate-600">Ganancia Rider:</span>
                    <span className="font-bold text-green-600 text-sm sm:text-base">
                      {formatearMoneda(calculosActuales.ganancia_rider)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between items-center">
                    <span className="text-xs sm:text-sm text-slate-600">Utilidad Somar:</span>
                    <span className="font-bold text-blue-600 text-sm sm:text-base">
                      {formatearMoneda(calculosActuales.utilidad_somar)}
                    </span>
                  </div>
                  
                  <div className="border-t border-blue-300 pt-2 mt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-xs sm:text-sm font-medium text-slate-700">
                        Monto a Cobrar:
                      </span>
                      <span className="font-bold text-base sm:text-lg text-slate-900">
                        {formatearMoneda(calculosActuales.monto_cobrar_rider)}
                      </span>
                    </div>
                    {formData.metodo_pago === 'transferencia' && (
                      <p className="text-xs text-slate-500 mt-1">
                        ✅ El cliente pagará por transferencia
                      </p>
                    )}
                  </div>
                </div>

                {/* Botón Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 sm:py-3 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base"
                >
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Package size={16} className="sm:w-5 sm:h-5" />
                      Crear Pedido
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* VISTA PREVIA DEL RIDER - Solo desktop */}
            <div className="hidden lg:block bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl shadow-sm border border-green-200 p-6 mt-6">
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <User size={20} className="text-green-600" />
                Vista Previa del Rider
              </h3>
              <div className="bg-white rounded-lg p-4 space-y-2 border border-green-100">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Ganancia:</span>
                  <span className="font-bold text-green-600">
                    + {formatearMoneda(calculosActuales.ganancia_rider)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Monto a Cobrar:</span>
                  <span className="font-bold text-slate-900">
                    {formatearMoneda(calculosActuales.monto_cobrar_rider)}
                  </span>
                </div>
                {formData.metodo_pago === 'transferencia' && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2">
                    <p className="text-xs text-blue-800 flex items-center gap-1">
                      <CheckCircle size={14} />
                      ✅ Pago Confirmado (Transferencia)
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ===== LISTA DE PEDIDOS ACTIVOS ===== */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="p-4 sm:p-6 border-b border-slate-200">
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
                  <TruckIcon size={20} className="text-blue-600 sm:w-6 sm:h-6" />
                  Pedidos Activos ({pedidos.length})
                </h2>
              </div>

              <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-200px)] overflow-y-auto">
                {pedidos.length === 0 ? (
                  <div className="text-center py-12">
                    <Package size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 text-sm sm:text-base">No hay pedidos activos</p>
                  </div>
                ) : (
                  pedidos.map(pedido => {
                    const expandido = pedidosExpandidos[pedido.id]
                    return (
                      <div
                        key={pedido.id}
                        className="bg-slate-50 rounded-lg p-3 sm:p-4 border border-slate-200 hover:shadow-md transition-shadow"
                      >
                        {/* Header del Pedido */}
                        <div className="flex items-start justify-between mb-2 sm:mb-3">
                          <div className="flex-1">
                            <h3 className="font-bold text-base sm:text-lg text-slate-900">
                              {pedido.numero_pedido}
                            </h3>
                            <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1 mt-1">
                              <Calendar size={12} className="sm:w-3.5 sm:h-3.5" />
                              {new Date(pedido.created_at).toLocaleString('es-HN', {
                                day: '2-digit',
                                month: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          </div>
                          {getEstadoBadge(pedido.estado)}
                        </div>

                        {/* Info Compacta Siempre Visible */}
                        <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3 text-xs sm:text-sm">
                          <div>
                            <p className="text-slate-500 text-xs">Cliente</p>
                            <p className="font-medium text-slate-900 truncate">{pedido.cliente_nombre}</p>
                          </div>
                          <div>
                            <p className="text-slate-500 text-xs">Rider</p>
                            <p className="font-medium text-slate-900 truncate">
                              {pedido.rider_nombre || 'Sin asignar'}
                            </p>
                          </div>
                        </div>

                        {/* Desglose Financiero Compacto */}
                        <div className="bg-white rounded-lg p-2 sm:p-3 border border-slate-200 mb-3">
                          <div className="grid grid-cols-3 gap-2 text-xs sm:text-sm">
                            <div>
                              <p className="text-xs text-slate-500">Envío</p>
                              <p className="font-bold text-slate-900 text-xs sm:text-sm">
                                {formatearMoneda(pedido.costo_envio)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Compra</p>
                              <p className="font-bold text-slate-900 text-xs sm:text-sm">
                                {formatearMoneda(pedido.total_compra)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Cobrar</p>
                              <p className="font-bold text-blue-600 text-xs sm:text-sm">
                                {formatearMoneda(pedido.monto_cobrar_rider)}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Sección Expandible */}
                        {expandido && (
                          <div className="space-y-3 mb-3 border-t pt-3">
                            {/* Dirección */}
                            <div>
                              <p className="text-xs text-slate-500 mb-1">Dirección</p>
                              <p className="text-xs sm:text-sm text-slate-700 flex items-start gap-1">
                                <MapPin size={12} className="flex-shrink-0 mt-0.5 sm:w-3.5 sm:h-3.5" />
                                {pedido.direccion_entrega}
                              </p>
                            </div>

                            {/* Desglose Detallado */}
                            <div className="bg-blue-50 rounded-lg p-2 sm:p-3 border border-blue-100">
                              <div className="grid grid-cols-2 gap-2 text-xs sm:text-sm">
                                <div>
                                  <p className="text-xs text-slate-500">Gana Rider</p>
                                  <p className="font-bold text-green-600">
                                    {formatearMoneda(pedido.ganancia_rider)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs text-slate-500">Gana Somar</p>
                                  <p className="font-bold text-blue-600">
                                    {formatearMoneda(pedido.utilidad_somar)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            {/* Módulo de Transferencias */}
                            {pedido.metodo_pago === 'transferencia' && (
                              <div className="bg-blue-50 border border-blue-200 rounded-lg p-2 sm:p-3">
                                <h4 className="text-xs sm:text-sm font-semibold text-blue-900 mb-2 flex items-center gap-2">
                                  <Upload size={14} className="sm:w-4 sm:h-4" />
                                  Comprobante
                                </h4>
                                
                                {pedido.transfer_status === 'validada' && pedido.transfer_url ? (
                                  <div className="flex items-center gap-2">
                                    <CheckCircle size={16} className="text-green-600 sm:w-5 sm:h-5" />
                                    <div className="flex-1">
                                      <p className="text-xs sm:text-sm font-medium text-green-800">
                                        ✅ Pago Confirmado
                                      </p>
                                      <a
                                        href={pedido.transfer_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs text-blue-600 hover:underline"
                                      >
                                        Ver comprobante
                                      </a>
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          handleSubirComprobante(pedido.id, file)
                                        }
                                      }}
                                      className="text-xs sm:text-sm w-full"
                                    />
                                    <p className="text-xs text-slate-600 mt-1">
                                      Sube el comprobante para validar
                                    </p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Acciones */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => togglePedidoExpandido(pedido.id)}
                            className="flex-1 bg-slate-600 hover:bg-slate-700 text-white text-xs sm:text-sm font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-1"
                          >
                            {expandido ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            {expandido ? 'Menos' : 'Más'}
                          </button>
                          
                          {pedido.estado === 'pendiente' && (
                            <button
                              onClick={() => handleCambiarEstado(pedido.id, 'en_camino')}
                              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                              Iniciar
                            </button>
                          )}
                          
                          {pedido.estado === 'en_camino' && (
                            <button
                              onClick={() => handleCambiarEstado(pedido.id, 'entregado')}
                              className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs sm:text-sm font-medium py-2 rounded-lg transition-colors"
                            >
                              Entregar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DashboardDespacho
