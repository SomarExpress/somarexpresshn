import React, { useState, useEffect } from 'react'
import RiderLogin from './RiderLogin'
import RiderApp from './RiderApp'
import { supabase } from '../lib/supabase'

const RiderWrapper = () => {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Verificar si hay una sesión activa
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Escuchar cambios en la autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-300">Cargando...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return <RiderLogin onLoginSuccess={setUser} />
  }

  return <RiderApp />
}

export default RiderWrapper
