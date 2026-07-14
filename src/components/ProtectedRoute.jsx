import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ProtectedRoute({ children }) {
  const [loading, setLoading] = useState(true)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    async function checkAccess() {
      setLoading(true)

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !sessionData?.session) {
        setSession(null)
        setLoading(false)
        return
      }

      const currentSession = sessionData.session
      setSession(currentSession)

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, user_id, name, email, role, target_exam, is_active')
        .eq('user_id', currentSession.user.id)
        .maybeSingle()

      if (profileError || !profileData || profileData.is_active !== true) {
        setBlocked(true)
        setLoading(false)
        return
      }

      setProfile(profileData)
      setBlocked(false)
      setLoading(false)
    }

    checkAccess()

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      checkAccess()
    })

    return () => {
      authListener?.subscription?.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="loading-card">
          <div className="brand-mark">◎</div>
          <h1>Carregando Área Premium</h1>
          <p>Verificando seu acesso ao Operação TAF...</p>
        </div>
      </div>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (blocked) {
    return (
      <div className="auth-shell">
        <div className="blocked-card">
          <div className="danger-icon">!</div>
          <h1>Acesso não liberado</h1>
          <p>
            Seu acesso premium ainda não está liberado. Entre em contato com o suporte da Operação TAF.
          </p>
          <button
            className="btn btn-dark"
            onClick={async () => {
              await supabase.auth.signOut()
              window.location.href = '/login'
            }}
          >
            Voltar para login
          </button>
        </div>
      </div>
    )
  }

  return children(profile)
}
