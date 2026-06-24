import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const MASTER_ADMIN_EMAIL = 'sabrinasebben@sevbenoficial.com'

export default function Login() {
  const navigate = useNavigate()
  const [mode, setMode] = useState('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function redirectIfLogged() {
      const { data } = await supabase.auth.getSession()

      if (data?.session) {
        const userEmail = data.session.user?.email || ''
        const admin = await checkAdminEmail(userEmail)
        navigate(admin ? '/admin' : '/area-do-aluno')
      }
    }

    redirectIfLogged()
  }, [navigate])

  async function handleLogin(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const cleanEmail = normalizeEmail(email)

    const { error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    })

    if (error) {
      setLoading(false)
      setMessage('E-mail ou senha inválidos. Verifique os dados e tente novamente.')
      return
    }

    const admin = await checkAdminEmail(cleanEmail)
    setLoading(false)
    navigate(admin ? '/admin' : '/area-do-aluno')
  }

  async function handleAdminFirstAccess(event) {
    event.preventDefault()
    setLoading(true)
    setMessage('')

    const cleanEmail = normalizeEmail(email)

    if (!isValidEmail(cleanEmail)) {
      setLoading(false)
      setMessage('Informe um e-mail válido.')
      return
    }

    const adminAllowed = await checkAdminEmail(cleanEmail)

    if (!adminAllowed) {
      setLoading(false)
      setMessage('Este primeiro acesso é exclusivo para administradores autorizados. Alunos recebem acesso conforme a compra pela Hotmart.')
      return
    }

    if (password.length < 6) {
      setLoading(false)
      setMessage('A senha precisa ter pelo menos 6 caracteres.')
      return
    }

    if (password !== confirmPassword) {
      setLoading(false)
      setMessage('As senhas não conferem.')
      return
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        emailRedirectTo: window.location.origin + '/login',
        data: {
          name: name.trim() || null,
          admin_first_access: true,
        },
      },
    })

    setLoading(false)

    if (error) {
      if (String(error.message || '').toLowerCase().includes('already')) {
        setMessage('Este e-mail já possui cadastro. Use Entrar ou Esqueci minha senha.')
        return
      }

      setMessage('Não foi possível criar o acesso administrativo. Verifique os dados e tente novamente.')
      return
    }

    if (data?.session) {
      navigate('/admin')
      return
    }

    setMessage('Acesso administrativo criado. Verifique seu e-mail para confirmar o cadastro e depois faça login.')
  }

  async function handlePasswordReset(event) {
    event?.preventDefault?.()

    const cleanEmail = normalizeEmail(email)

    if (!isValidEmail(cleanEmail)) {
      setMessage('Digite seu e-mail para receber o link de recuperação de senha.')
      return
    }

    setLoading(true)
    setMessage('')

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      redirectTo: window.location.origin + '/login',
    })

    setLoading(false)

    setMessage(
      error
        ? 'Não foi possível enviar o e-mail de recuperação.'
        : 'Enviamos um link de recuperação para o seu e-mail.'
    )
  }

  function switchMode(nextMode) {
    setMode(nextMode)
    setMessage('')
    setPassword('')
    setConfirmPassword('')
  }

  const title =
    mode === 'login'
      ? 'Entrar na Área Premium'
      : mode === 'admin'
        ? 'Primeiro acesso admin'
        : 'Recuperar senha'

  const subtitle =
    mode === 'login'
      ? 'Alunos acessam com o e-mail liberado após a compra. Administradores acessam com e-mail autorizado.'
      : mode === 'admin'
        ? 'Uso exclusivo para administradores previamente autorizados no painel admin.'
        : 'Informe seu e-mail para receber um link de recuperação de senha.'

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
          <div className="card-label">
            {mode === 'login' ? 'Login' : mode === 'admin' ? 'Admin' : 'Recuperação'}
          </div>

          <h2>{title}</h2>
          <p className="muted">{subtitle}</p>

          <div className="login-mode-tabs">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => switchMode('login')}
            >
              Entrar
            </button>

            <button
              type="button"
              className={mode === 'admin' ? 'active' : ''}
              onClick={() => switchMode('admin')}
            >
              Primeiro acesso admin
            </button>

            <button
              type="button"
              className={mode === 'reset' ? 'active' : ''}
              onClick={() => switchMode('reset')}
            >
              Esqueci senha
            </button>
          </div>

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="form">
              <label>
                E-mail
                <input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                Senha
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {message && <div className="form-message">{message}</div>}

              <button className="btn btn-green" type="submit" disabled={loading}>
                {loading ? 'Entrando...' : 'Entrar'}
              </button>

              <div className="admin-access-note">
                <strong>Aluno:</strong> seu acesso é liberado conforme a compra pela Hotmart. Não crie cadastro por aqui.
              </div>
            </form>
          )}

          {mode === 'admin' && (
            <form onSubmit={handleAdminFirstAccess} className="form">
              <label>
                Nome
                <input
                  type="text"
                  placeholder="Seu nome"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <label>
                E-mail autorizado
                <input
                  type="email"
                  placeholder="admin@empresa.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label>
                Criar senha
                <input
                  type="password"
                  placeholder="Mínimo 6 caracteres"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              <label>
                Confirmar senha
                <input
                  type="password"
                  placeholder="Repita a senha"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
              </label>

              {message && <div className="form-message">{message}</div>}

              <button className="btn btn-green" type="submit" disabled={loading}>
                {loading ? 'Criando...' : 'Criar acesso admin'}
              </button>

              <div className="admin-access-note">
                <strong>Importante:</strong> este cadastro é bloqueado para alunos. O e-mail precisa estar autorizado no painel admin antes do primeiro acesso.
              </div>
            </form>
          )}

          {mode === 'reset' && (
            <form onSubmit={handlePasswordReset} className="form">
              <label>
                E-mail
                <input
                  type="email"
                  placeholder="seuemail@exemplo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              {message && <div className="form-message">{message}</div>}

              <button className="btn btn-green" type="submit" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviar link de recuperação'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  )
}

async function checkAdminEmail(email) {
  const cleanEmail = normalizeEmail(email)

  if (cleanEmail === MASTER_ADMIN_EMAIL) return true

  const { data } = await supabase
    .from('admin_emails')
    .select('id')
    .eq('email', cleanEmail)
    .eq('active', true)
    .limit(1)
    .maybeSingle()

  return Boolean(data?.id)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}
