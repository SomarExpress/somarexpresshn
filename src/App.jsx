import React, { useState } from 'react'
import DashboardDespacho from './components/DashboardDespacho'
import RiderWrapper from './components/RiderWrapper'
import { TruckIcon, Home } from 'lucide-react'

function App() {
  const [vista, setVista] = useState('despacho') // 'despacho' o 'rider'
  
  return (
    <div className="App">
      {/* Selector de Vista - Botones flotantes */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button 
          onClick={() => setVista('despacho')}
          className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-all flex items-center gap-2 ${
            vista === 'despacho' 
              ? 'bg-blue-600 text-white scale-105' 
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Home size={18} />
          Despacho
        </button>
        <button 
          onClick={() => setVista('rider')}
          className={`px-4 py-2 rounded-lg font-medium shadow-lg transition-all flex items-center gap-2 ${
            vista === 'rider' 
              ? 'bg-green-600 text-white scale-105' 
              : 'bg-white text-slate-700 hover:bg-slate-100'
          }`}
        >
          <TruckIcon size={18} />
          Rider
        </button>
      </div>
      
      {/* Renderizar vista seleccionada */}
      {vista === 'despacho' ? <DashboardDespacho /> : <RiderWrapper />}
    </div>
  )
}

export default App
