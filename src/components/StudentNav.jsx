import { Link } from 'react-router-dom'

export default function StudentNav({ profile, onLogout, hotmartUrl = '' }) {
  const isAdmin = profile?.role === 'admin' || profile?.email === 'sabrinasebben@sevbenoficial.com'

  if (isAdmin) {
    return (
      <nav className="app-nav admin-only-nav">
        <Link to="/admin">Painel admin</Link>
        <button onClick={onLogout}>Sair</button>
      </nav>
    )
  }

  return (
    <nav className="app-nav student-nav">
      <Link to="/calculadora-premium">Calculadora</Link>
      <Link to="/historico">Histórico de testes</Link>
      <Link to="/evolucao">Evolução</Link>
      <details className="student-nav-more">
        <summary>Mais</summary>
        <div className="student-nav-more-menu">
          <Link to="/configurar-edital">Meu edital</Link>
          <Link to="/perfil">Perfil</Link>
          {hotmartUrl && <a href={hotmartUrl} target="_blank" rel="noreferrer">Aulas e materiais</a>}
        </div>
      </details>
      <button onClick={onLogout}>Sair</button>
    </nav>
  )
}
