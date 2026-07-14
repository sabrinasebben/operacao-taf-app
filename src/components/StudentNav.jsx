import { Link } from 'react-router-dom'

export default function StudentNav({ profile, onLogout, hotmartUrl = '' }) {
  const isAdmin = profile?.role === 'admin' || profile?.email === 'sabrinasebben@sevbenoficial.com'

  return (
    <nav className="app-nav student-nav">
      <Link to="/area-do-aluno">Início</Link>
      <Link to="/area-do-aluno#meu-plano">Meu treino</Link>
      <Link to="/calculadora-premium">Calculadora</Link>
      <Link to="/configurar-edital">Meu edital</Link>
      <Link to="/perfil">Perfil</Link>
      <details className="student-nav-more">
        <summary>Mais</summary>
        <div className="student-nav-more-menu">
          <Link to="/historico">Histórico</Link>
          {hotmartUrl && <a href={hotmartUrl} target="_blank" rel="noreferrer">Aulas e materiais</a>}
          {isAdmin && <Link to="/admin">Painel admin</Link>}
        </div>
      </details>
      <button onClick={onLogout}>Sair</button>
    </nav>
  )
}
