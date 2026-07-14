import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const MASTER_ADMIN_EMAIL = 'sabrinasebben@sevbenoficial.com'

export default function Admin({ profile }) {
  const [checkingAdmin, setCheckingAdmin] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingUserId, setSavingUserId] = useState(null)
  const [message, setMessage] = useState('')

  const [profiles, setProfiles] = useState([])
  const [studentExams, setStudentExams] = useState([])
  const [testResults, setTestResults] = useState([])
  const [summaries, setSummaries] = useState([])
  const [adminEmails, setAdminEmails] = useState([])
  const [hotmartAccesses, setHotmartAccesses] = useState([])

  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  const [newAdminEmail, setNewAdminEmail] = useState('')
  const [newAdminName, setNewAdminName] = useState('')
  const [savingAdminEmail, setSavingAdminEmail] = useState(false)

  useEffect(() => {
    // The function declaration is intentionally hoisted; it uses the current profile.
    // eslint-disable-next-line react-hooks/immutability
    checkAdminAccess()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  async function checkAdminAccess() {
    setCheckingAdmin(true)
    setMessage('')

    const masterByEmail = normalizeEmail(profile?.email) === MASTER_ADMIN_EMAIL

    if (masterByEmail || profile?.role === 'admin') {
      setIsAdmin(true)
      setCheckingAdmin(false)
      await loadAdminData()
      return
    }

    const { data, error } = await supabase
      .from('admin_emails')
      .select('id')
      .eq('email', normalizeEmail(profile?.email))
      .eq('active', true)
      .limit(1)
      .maybeSingle()

    if (error) {
      setIsAdmin(false)
      setCheckingAdmin(false)
      setLoading(false)
      setMessage('Não foi possível verificar permissão administrativa. Execute o SQL da Fase 8.3 no Supabase.')
      return
    }

    const allowed = Boolean(data?.id)
    setIsAdmin(allowed)
    setCheckingAdmin(false)

    if (allowed) {
      await loadAdminData()
    } else {
      setLoading(false)
    }
  }

  async function loadAdminData() {
    setLoading(true)
    setMessage('')

    const [profilesResponse, adminsResponse, examsResponse, resultsResponse, summariesResponse, hotmartResponse] = await Promise.all([
      supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('admin_emails')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('student_exams')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('test_results')
        .select('*')
        .order('result_date', { ascending: false })
        .limit(1000),

      supabase
        .from('v_taf_summary')
        .select('*'),

      supabase
        .from('hotmart_accesses')
        .select('email, status, last_event, updated_at')
        .order('updated_at', { ascending: false })
        .limit(1000),
    ])

    if (profilesResponse.error) {
      setMessage('Erro ao carregar perfis. Verifique as políticas da tabela profiles.')
      setLoading(false)
      return
    }

    if (adminsResponse.error) {
      setMessage('Erro ao carregar administradores. Verifique a tabela admin_emails.')
      setLoading(false)
      return
    }

    setProfiles(profilesResponse.data || [])
    setAdminEmails(adminsResponse.data || [])
    setStudentExams(examsResponse.data || [])
    setTestResults(resultsResponse.data || [])
    setSummaries(summariesResponse.data || [])
    setHotmartAccesses(hotmartResponse.data || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function toggleAccess(user) {
    const nextStatus = !user.is_active

    setSavingUserId(user.user_id)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        is_active: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.user_id)

    setSavingUserId(null)

    if (error) {
      setMessage('Erro ao alterar acesso do aluno.')
      return
    }

    setProfiles((current) =>
      current.map((item) =>
        item.user_id === user.user_id
          ? { ...item, is_active: nextStatus, updated_at: new Date().toISOString() }
          : item
      )
    )

    setMessage(nextStatus ? 'Aluno liberado com sucesso.' : 'Aluno bloqueado com sucesso.')
  }

  async function addAdminEmail(event) {
    event.preventDefault()
    setSavingAdminEmail(true)
    setMessage('')

    const email = normalizeEmail(newAdminEmail)

    if (!isValidEmail(email)) {
      setMessage('Informe um e-mail válido para adicionar como administrador.')
      setSavingAdminEmail(false)
      return
    }

    const { error } = await supabase
      .from('admin_emails')
      .upsert(
        {
          email,
          name: newAdminName.trim() || null,
          active: true,
          created_by: profile.user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'email' }
      )

    setSavingAdminEmail(false)

    if (error) {
      setMessage('Erro ao adicionar administrador. Verifique as permissões da tabela admin_emails.')
      return
    }

    setNewAdminEmail('')
    setNewAdminName('')
    setMessage('Administrador autorizado com sucesso.')
    await loadAdminData()
  }

  async function toggleAdminEmail(adminEmail) {
    if (normalizeEmail(adminEmail.email) === MASTER_ADMIN_EMAIL) {
      setMessage('O admin master não pode ser removido por aqui.')
      return
    }

    const nextStatus = !adminEmail.active

    const confirmed = window.confirm(
      nextStatus
        ? `Deseja reativar o acesso administrativo de ${adminEmail.email}?`
        : `Deseja remover o acesso administrativo de ${adminEmail.email}?`
    )

    if (!confirmed) return

    setSavingAdminEmail(true)
    setMessage('')

    const { error } = await supabase
      .from('admin_emails')
      .update({
        active: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', adminEmail.id)

    setSavingAdminEmail(false)

    if (error) {
      setMessage('Erro ao alterar administrador autorizado.')
      return
    }

    setMessage(nextStatus ? 'Administrador reativado.' : 'Administrador removido.')
    await loadAdminData()
  }

  const studentRows = useMemo(() => {
    return profiles.map((user) => {
      const exams = studentExams.filter((exam) => exam.user_id === user.user_id)
      const activeExam =
        exams.find((exam) => exam.is_active) ||
        exams.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))[0] ||
        null

      const userResults = testResults.filter((result) => result.user_id === user.user_id)
      const latestResult = userResults
        .slice()
        .sort((a, b) => new Date(b.result_date) - new Date(a.result_date))[0] || null

      const summary = summaries.find((item) => item.user_id === user.user_id && (!activeExam || item.student_exam_id === activeExam.id)) ||
        summaries.find((item) => item.user_id === user.user_id) ||
        null

      const adminUser = isAdminEmail(user.email, adminEmails) || user.role === 'admin'
      const daysToTaf = getDaysToDate(activeExam?.taf_date)

      return {
        user,
        activeExam,
        resultsCount: userResults.length,
        latestResult,
        summary,
        adminUser,
        daysToTaf,
        level: summary?.taf_level || 'sem_resultado',
        risk: getRisk(summary?.taf_level),
        attentionTest: summary?.weakest_test || '—',
        hasExam: Boolean(activeExam),
        hasResults: userResults.length > 0,
      }
    })
  }, [profiles, studentExams, testResults, summaries, adminEmails])

  const filteredStudents = useMemo(() => {
    const term = search.trim().toLowerCase()

    if (!term) return studentRows

    return studentRows.filter((row) => {
      const searchable = [
        row.user.name,
        row.user.email,
        row.user.target_exam,
        row.activeExam?.exam_name,
        row.activeExam?.institution,
        row.level,
        row.risk.label,
        row.attentionTest,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(term)
    })
  }, [studentRows, search])

  const stats = useMemo(() => {
    const total = studentRows.length
    const active = studentRows.filter((row) => row.user.is_active).length
    const blocked = studentRows.filter((row) => !row.user.is_active).length
    const admins = adminEmails.filter((item) => item.active).length
    const withExam = studentRows.filter((row) => row.hasExam).length
    const withResults = studentRows.filter((row) => row.hasResults).length
    const highRisk = studentRows.filter((row) => row.risk.key === 'alto').length
    const safe = studentRows.filter((row) => row.level === 'blindagem' || row.level === 'performance').length
    const withoutDiagnosis = studentRows.filter((row) => !row.hasExam || !row.hasResults).length
    const latestActivityTime = testResults.reduce((latest, result) => {
      return Math.max(latest, new Date(result.result_date || result.created_at || 0).getTime())
    }, 0)
    const activeLast30Days = studentRows.filter((row) => {
      if (!row.latestResult?.result_date) return false
      return latestActivityTime - new Date(row.latestResult.result_date).getTime() <= 30 * 24 * 60 * 60 * 1000
    }).length
    const hotmartActive = hotmartAccesses.filter((item) => item.status === 'active').length
    const hotmartRevoked = hotmartAccesses.filter((item) => item.status === 'revoked').length

    return { total, active, blocked, admins, withExam, withResults, highRisk, safe, withoutDiagnosis, activeLast30Days, hotmartActive, hotmartRevoked }
  }, [studentRows, adminEmails, hotmartAccesses, testResults])

  const recentActivity = useMemo(() => {
    return testResults
      .slice()
      .sort((a, b) => {
        const byCreated = new Date(b.created_at || b.result_date) - new Date(a.created_at || a.result_date)
        if (byCreated !== 0) return byCreated
        return new Date(b.result_date) - new Date(a.result_date)
      })
      .slice(0, 8)
      .map((result) => {
        const user = profiles.find((profileItem) => profileItem.user_id === result.user_id)
        return { result, user }
      })
  }, [testResults, profiles])

  if (checkingAdmin) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <section className="premium-panel">
            <div className="kicker">Área administrativa</div>
            <h1>Verificando permissão...</h1>
            <p className="muted">Confirmando se este usuário tem acesso ao painel administrativo.</p>
          </section>
        </main>
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand-row">
            <span className="brand-mark">◎</span>
            <div>
              <strong>OPERAÇÃO TAF</strong>
              <small>Acesso restrito</small>
            </div>
          </div>

          <nav className="app-nav">
            <a href="/area-do-aluno">Dashboard</a>
            <a href="/perfil">Perfil</a>
            <button onClick={handleLogout}>Sair</button>
          </nav>
        </header>

        <main className="dashboard">
          <section className="premium-panel">
            <div className="kicker">Área administrativa</div>
            <h1>Acesso negado</h1>
            <p className="muted">
              Esta área é restrita ao admin master e aos e-mails autorizados no painel administrativo.
            </p>
            <a className="btn btn-dark" href="/area-do-aluno">Voltar ao dashboard</a>
          </section>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header admin-header">
        <div className="brand-row">
          <span className="brand-mark">◎</span>
          <div>
            <strong>OPERAÇÃO TAF</strong>
            <small>Painel administrativo</small>
          </div>
        </div>

        <nav className="app-nav">
          <a href="/admin">Painel admin</a>
          <button onClick={handleLogout}>Sair</button>
        </nav>
      </header>

      <main className="dashboard">
        <section className="admin-command-hero">
          <div>
            <div className="kicker">Controle operacional</div>
            <h1>Painel Admin</h1>
            <p>
              Visão gerencial dos alunos, acessos, diagnósticos e administradores autorizados do Operação TAF.
            </p>
          </div>

          <div className="admin-hero-badge">
            <span>Admin logado</span>
            <strong>{profile.name || 'Administrador'}</strong>
            <small>{profile.email}</small>
          </div>
        </section>

        {message && <div className="form-message">{message}</div>}

        <section className="admin-kpi-grid">
          <div className="admin-kpi-card">
            <span>Total de usuários</span>
            <strong>{stats.total}</strong>
            <small>Perfis cadastrados.</small>
          </div>

          <div className="admin-kpi-card good">
            <span>Alunos ativos</span>
            <strong>{stats.active}</strong>
            <small>Com acesso liberado.</small>
          </div>

          <div className="admin-kpi-card danger">
            <span>Bloqueados</span>
            <strong>{stats.blocked}</strong>
            <small>Sem acesso à Área Premium.</small>
          </div>

          <div className="admin-kpi-card">
            <span>Com edital</span>
            <strong>{stats.withExam}</strong>
            <small>Já configuraram concurso.</small>
          </div>

          <div className="admin-kpi-card">
            <span>Com resultado</span>
            <strong>{stats.withResults}</strong>
            <small>Já usaram a calculadora.</small>
          </div>

          <div className="admin-kpi-card danger">
            <span>Risco alto</span>
            <strong>{stats.highRisk}</strong>
            <small>Precisam de atenção.</small>
          </div>

          <div className="admin-kpi-card good">
            <span>Performance/Blindagem</span>
            <strong>{stats.safe}</strong>
            <small>Em zona mais segura.</small>
          </div>

          <div className="admin-kpi-card danger">
            <span>Sem diagnóstico</span>
            <strong>{stats.withoutDiagnosis}</strong>
            <small>Sem edital ou sem resultado.</small>
          </div>

          <div className="admin-kpi-card good">
            <span>Ativos em 30 dias</span>
            <strong>{stats.activeLast30Days}</strong>
            <small>Registraram teste recentemente.</small>
          </div>

          <div className="admin-kpi-card good">
            <span>Acessos Hotmart</span>
            <strong>{stats.hotmartActive}</strong>
            <small>Compras ativas sincronizadas.</small>
          </div>

          <div className="admin-kpi-card danger">
            <span>Revogados Hotmart</span>
            <strong>{stats.hotmartRevoked}</strong>
            <small>Reembolso, cancelamento ou chargeback.</small>
          </div>

          <div className="admin-kpi-card">
            <span>Admins ativos</span>
            <strong>{stats.admins}</strong>
            <small>E-mails autorizados.</small>
          </div>
        </section>

        <section className="admin-tabs">
          <button className={activeTab === 'overview' ? 'active' : ''} onClick={() => setActiveTab('overview')}>
            Visão geral
          </button>
          <button className={activeTab === 'students' ? 'active' : ''} onClick={() => setActiveTab('students')}>
            Alunos
          </button>
          <button className={activeTab === 'admins' ? 'active' : ''} onClick={() => setActiveTab('admins')}>
            Administradores
          </button>
        </section>

        {activeTab === 'overview' && (
          <AdminOverview
            loading={loading}
            rows={studentRows}
            recentActivity={recentActivity}
          />
        )}

        {activeTab === 'students' && (
          <section className="premium-panel">
            <div className="panel-head">
              <div>
                <div className="kicker">Alunos</div>
                <h2>Gestão de acessos e diagnósticos</h2>
                <p className="muted">
                  Controle quem tem acesso, veja quem configurou edital, quem já fez testes e qual é a situação de risco.
                </p>
              </div>

              <button className="btn btn-green" type="button" onClick={loadAdminData}>
                Recarregar
              </button>
            </div>

            <div className="admin-toolbar">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por nome, e-mail, edital, risco ou prova crítica..."
              />

              <span>{filteredStudents.length} resultado(s)</span>
            </div>

            {loading ? (
              <div className="empty-state">
                <h3>Carregando usuários...</h3>
                <p>Buscando dados no Supabase.</p>
              </div>
            ) : (
              <div className="premium-tests-table-wrap">
                <table className="premium-tests-table admin-users-table">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th>Acesso</th>
                      <th>Edital</th>
                      <th>Diagnóstico</th>
                      <th>Resultados</th>
                      <th>TAF</th>
                      <th>Ações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {filteredStudents.length ? (
                      filteredStudents.map((row) => {
                        const user = row.user
                        const saving = savingUserId === user.user_id

                        return (
                          <tr key={user.user_id}>
                            <td>
                              <strong>{user.name || 'Sem nome'}</strong>
                              <small>{user.email || 'Sem e-mail'}</small>
                              {row.adminUser && <small className="admin-mini-label">Admin autorizado</small>}
                            </td>

                            <td>
                              <span className={`admin-status-pill ${user.is_active ? 'active' : 'blocked'}`}>
                                {user.is_active ? 'Ativo' : 'Bloqueado'}
                              </span>
                            </td>

                            <td>
                              <strong>{row.activeExam?.exam_name || user.target_exam || 'Sem edital'}</strong>
                              <small>{row.activeExam?.institution || 'Instituição não informada'}</small>
                            </td>

                            <td>
                              <span className={`admin-risk-pill risk-${row.risk.key}`}>
                                {row.risk.label}
                              </span>
                              <small>{formatLevel(row.level)} · {row.attentionTest}</small>
                            </td>

                            <td>
                              <strong>{row.resultsCount}</strong>
                              <small>{row.latestResult ? `Último: ${formatDate(row.latestResult.result_date)}` : 'Sem resultado'}</small>
                            </td>

                            <td>
                              <strong>{formatDays(row.daysToTaf)}</strong>
                              <small>{row.activeExam?.taf_date ? formatDate(row.activeExam.taf_date) : 'Sem data'}</small>
                            </td>

                            <td>
                              <div className="admin-actions">
                                <button
                                  type="button"
                                  className={user.is_active ? 'admin-btn danger' : 'admin-btn success'}
                                  onClick={() => toggleAccess(user)}
                                  disabled={saving || normalizeEmail(user.email) === MASTER_ADMIN_EMAIL}
                                >
                                  {saving ? 'Salvando...' : user.is_active ? 'Bloquear' : 'Liberar'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    ) : (
                      <tr>
                        <td colSpan="7">Nenhum aluno encontrado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {activeTab === 'admins' && (
          <section className="premium-panel">
            <div className="panel-head">
              <div>
                <div className="kicker">Administradores</div>
                <h2>E-mails autorizados</h2>
                <p className="muted">
                  O admin master é <strong>{MASTER_ADMIN_EMAIL}</strong>. Adicione aqui outros e-mails que poderão acessar este painel.
                </p>
              </div>
            </div>

            <form className="admin-add-grid" onSubmit={addAdminEmail}>
              <label>
                Nome do administrador
                <input
                  value={newAdminName}
                  onChange={(event) => setNewAdminName(event.target.value)}
                  placeholder="Ex.: Diego Severo"
                />
              </label>

              <label>
                E-mail autorizado
                <input
                  value={newAdminEmail}
                  onChange={(event) => setNewAdminEmail(event.target.value)}
                  placeholder="Ex.: nome@empresa.com"
                />
              </label>

              <div className="admin-add-action">
                <button className="btn btn-green" type="submit" disabled={savingAdminEmail}>
                  {savingAdminEmail ? 'Salvando...' : 'Adicionar admin'}
                </button>
              </div>
            </form>

            <div className="admin-email-grid">
              {adminEmails.length ? (
                adminEmails.map((item) => (
                  <div className={`admin-email-card ${item.active ? 'active' : 'blocked'}`} key={item.id}>
                    <div>
                      <span>{item.active ? 'Ativo' : 'Removido'}</span>
                      <strong>{item.email}</strong>
                      <small>{item.name || 'Sem nome'} {normalizeEmail(item.email) === MASTER_ADMIN_EMAIL ? '· Admin master' : ''}</small>
                    </div>

                    <button
                      type="button"
                      className={item.active ? 'admin-btn danger' : 'admin-btn success'}
                      onClick={() => toggleAdminEmail(item)}
                      disabled={savingAdminEmail || normalizeEmail(item.email) === MASTER_ADMIN_EMAIL}
                    >
                      {item.active ? 'Remover' : 'Reativar'}
                    </button>
                  </div>
                ))
              ) : (
                <div className="empty-state">
                  <h3>Nenhum administrador listado.</h3>
                  <p>Execute o SQL da Fase 8.3 para cadastrar o admin master.</p>
                </div>
              )}
            </div>
          </section>
        )}

        <p className="disclaimer">
          Área administrativa restrita. A liberação de alunos deve acompanhar as vendas confirmadas na Hotmart.
        </p>
      </main>
    </div>
  )
}

function AdminOverview({ loading, rows, recentActivity }) {
  const attentionRows = rows
    .filter((row) => row.risk.key === 'alto' || !row.hasExam || !row.hasResults)
    .slice(0, 6)

  return (
    <section className="admin-overview-grid">
      <div className="premium-panel">
        <div className="kicker">Atenção operacional</div>
        <h2>Alunos que precisam de acompanhamento</h2>
        <p className="muted">
          Lista automática com alunos sem edital, sem resultado ou com risco alto.
        </p>

        {loading ? (
          <p className="muted">Carregando...</p>
        ) : attentionRows.length ? (
          <div className="admin-attention-list">
            {attentionRows.map((row) => (
              <div className="admin-attention-item" key={row.user.user_id}>
                <div>
                  <strong>{row.user.name || row.user.email || 'Aluno sem nome'}</strong>
                  <small>{buildAttentionReason(row)}</small>
                </div>
                <span className={`admin-risk-pill risk-${row.risk.key}`}>{row.risk.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <h3>Nenhum alerta importante.</h3>
            <p>Os alunos cadastrados estão com situação regular.</p>
          </div>
        )}
      </div>

      <div className="premium-panel">
        <div className="kicker">Atividade recente</div>
        <h2>Últimos resultados lançados</h2>
        <p className="muted">
          Mostra os registros recentes da calculadora.
        </p>

        {recentActivity.length ? (
          <div className="admin-activity-list">
            {recentActivity.map(({ result, user }) => (
              <div className="admin-activity-item" key={result.id}>
                <div>
                  <strong>{user?.name || user?.email || 'Aluno'}</strong>
                  <small>{formatDate(result.result_date)} · Resultado: {formatDecimal(result.result_value)}</small>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state compact">
            <h3>Nenhum resultado recente.</h3>
            <p>Quando os alunos usarem a calculadora, aparecerá aqui.</p>
          </div>
        )}
      </div>
    </section>
  )
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function isAdminEmail(email, adminEmails) {
  const normalized = normalizeEmail(email)

  if (normalized === MASTER_ADMIN_EMAIL) return true

  return adminEmails.some((item) => normalizeEmail(item.email) === normalized && item.active)
}

function getRisk(level) {
  if (level === 'base' || level === 'arranque') {
    return { key: 'alto', label: 'Alto' }
  }

  if (level === 'progressao') {
    return { key: 'medio', label: 'Médio' }
  }

  if (level === 'performance' || level === 'blindagem') {
    return { key: 'baixo', label: 'Baixo' }
  }

  return { key: 'aguardando', label: 'Aguardando' }
}

function formatLevel(level) {
  const labels = {
    base: 'Base',
    arranque: 'Arranque',
    progressao: 'Progressão',
    performance: 'Performance',
    blindagem: 'Blindagem',
    sem_resultado: 'Sem resultado',
  }

  return labels[level] || 'Sem resultado'
}

function parseLocalDate(dateValue) {
  if (!dateValue) return null

  const text = String(dateValue)

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDaysToDate(date) {
  const tafDate = parseLocalDate(date)
  if (!tafDate) return null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  tafDate.setHours(0, 0, 0, 0)

  return Math.ceil((tafDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDays(days) {
  if (days === null || days === undefined) return '—'
  if (days < 0) return 'Vencido'
  if (days === 0) return 'Hoje'
  return `${days} dias`
}

function formatDate(value) {
  if (!value) return '—'
  const text = String(value)

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [year, month, day] = text.slice(0, 10).split('-')
    return `${day}/${month}/${year}`
  }

  return text
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Number(Number(value).toFixed(2))).replace('.', ',')
}

function buildAttentionReason(row) {
  if (!row.hasExam) return 'Ainda não configurou o edital.'
  if (!row.hasResults) return 'Ainda não registrou resultados.'
  if (row.risk.key === 'alto') return `Risco alto · atenção em ${row.attentionTest}.`
  return 'Acompanhamento recomendado.'
}
