import { Navigate, Route, Routes } from 'react-router-dom'
import Login from './pages/Login'
import ConfigurarEdital from './pages/ConfigurarEdital'
import CalculadoraPremium from './pages/CalculadoraPremium'
import Historico from './pages/Historico'
import PerfilAluno from './pages/PerfilAluno'
import Admin from './pages/Admin'
import ProtectedRoute from './components/ProtectedRoute'
import './App.css'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<Login />} />

      <Route
        path="/area-do-aluno"
        element={<Navigate to="/calculadora-premium" replace />}
      />

      <Route
        path="/dashboard"
        element={<Navigate to="/calculadora-premium" replace />}
      />

      <Route
        path="/configurar-edital"
        element={
          <ProtectedRoute>
            {(profile) => <ConfigurarEdital profile={profile} />}
          </ProtectedRoute>
        }
      />

      <Route
        path="/calculadora-premium"
        element={
          <ProtectedRoute>
            {(profile) => <CalculadoraPremium profile={profile} />}
          </ProtectedRoute>
        }
      />

      <Route
        path="/historico"
        element={
          <ProtectedRoute>
            {(profile) => <Historico profile={profile} mode="history" />}
          </ProtectedRoute>
        }
      />

      <Route
        path="/evolucao"
        element={
          <ProtectedRoute>
            {(profile) => <Historico profile={profile} mode="evolution" />}
          </ProtectedRoute>
        }
      />

      <Route
        path="/perfil"
        element={
          <ProtectedRoute>
            {(profile) => <PerfilAluno profile={profile} />}
          </ProtectedRoute>
        }
      />

      <Route
        path="/admin"
        element={
          <ProtectedRoute>
            {(profile) => <Admin profile={profile} />}
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  )
}
