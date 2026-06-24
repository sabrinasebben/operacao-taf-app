import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function redirectIfLogged() {
      const { data } = await supabase.auth.getSession()
      if (data?.session) navigate('/area-do-aluno')
    }
    redirectIfLogged()
  }, [navigate])

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)

    if (error) {
      setMessage('E-mail ou senha inválidos. Verifique os dados e tente novamente.')
      return
    }

    navigate('/area-do-aluno')
  }

  async function handlePasswordReset() {
    if (!email) {
      setMessage('Digite seu e-mail para receber o link de recuperação de senha.')
      return
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/login',
    })

    setMessage(error ? 'Não foi possível enviar o e-mail de recuperação.' : 'Enviamos um link de recuperação para o seu e-mail.')
  }

  return (
    <div className="auth-shell">
      <main className="login-grid">
        <section className="login-copy">
          <div className="brand-row">
            <span className="brand-mark">◎</span>
            <div>
              <strong>OPERAÇÃO TAF</strong>
              <small>Do zero à aprovação</small>
            </div>
          </div>

          <div className="kicker">Área Premium</div>
          <h1>Método M60 Operação TAF</h1>
          <p>
            Acesse sua área premium, acompanhe sua evolução e veja sua situação real em relação ao TAF.
          </p>

          <div className="premium-points">
            <div>Diagnóstico por edital</div>
            <div>Controle de evolução</div>
            <div>Calculadora Premium</div>
          </div>
        </section>

        <section className="login-card">
          <div className="card-label">Login do aluno</div>
          <h2>Entrar na Área Premium</h2>
          <p className="muted">Use o e-mail e senha cadastrados para acessar sua calculadora e acompanhamento.</p>

          <form onSubmit={handleLogin} className="form">
            <label>
              E-mail
              <input type="email" placeholder="seuemail@exemplo.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>

            <label>
              Senha
              <input type="password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </label>

            {message && <div className="form-message">{message}</div>}

            <button className="btn btn-green" type="submit" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar na Área do Aluno'}
            </button>

            <button className="link-button" type="button" onClick={handlePasswordReset}>Esqueci minha senha</button>
          </form>
        </section>
      </main>
    </div>
  )
}
