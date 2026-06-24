import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function AreaAluno({ profile }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeExam, setActiveExam] = useState(null)
  const [summary, setSummary] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [recentResults, setRecentResults] = useState([])

  useEffect(() => {
    loadDashboard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  async function loadDashboard() {
    setLoading(true)
    setMessage('')

    const { data: examData, error: examError } = await supabase
      .from('student_exams')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (examError) {
      setMessage('Erro ao carregar edital ativo.')
      setLoading(false)
      return
    }

    if (!examData) {
      setActiveExam(null)
      setSummary(null)
      setDiagnostics([])
      setRecentResults([])
      setLoading(false)
      return
    }

    setActiveExam(examData)

    const { data: summaryData } = await supabase
      .from('v_taf_summary')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .limit(1)
      .maybeSingle()

    const finalSummary = summaryData || {
      student_exam_id: examData.id,
      exam_name: examData.exam_name,
      institution: examData.institution,
      taf_date: examData.taf_date,
      taf_level: 'sem_resultado',
      weakest_test: null,
      strongest_test: null,
      tests_below_minimum: 0,
      tests_reached_safe_goal: 0,
      total_tests: 0,
    }

    setSummary(finalSummary)

    const { data: diagnosticData } = await supabase
      .from('v_taf_diagnostic')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .order('percent_minimum', { ascending: true, nullsFirst: false })

    setDiagnostics(diagnosticData || [])

    const { data: resultsData } = await supabase
      .from('test_results')
      .select('id, result_date, result_value, exam_test_id, created_at')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .order('result_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(6)

    setRecentResults(resultsData || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const level = summary?.taf_level || 'sem_resultado'
  const risk = getRisk(level)
  const daysToTaf = getDaysToDate(activeExam?.taf_date || summary?.taf_date)
  const dayInfo = formatDaysToTaf(daysToTaf)
  const levelInfo = getLevelInfo(level)

  const criticalTests = useMemo(() => {
    return diagnostics.filter((test) =>
      ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(test.taf_status)
    )
  }, [diagnostics])

  const safeTests = useMemo(() => {
    return diagnostics.filter((test) => test.taf_status === 'atingiu_meta_segura')
  }, [diagnostics])

  const nextActions = useMemo(() => {
    return buildNextActions({
      hasExam: Boolean(activeExam),
      hasResults: diagnostics.some((item) => item.latest_result_value),
      level,
      criticalTests,
      daysToTaf,
    })
  }, [activeExam, diagnostics, level, criticalTests, daysToTaf])

  const modules = buildCourseModules(level, activeExam, diagnostics)

  if (loading) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Dashboard</div>
            <h1>Carregando painel...</h1>
            <p className="muted">Buscando seus dados da Área Premium.</p>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <span className="brand-mark">◎</span>
          <div>
            <strong>OPERAÇÃO TAF</strong>
            <small>Área Premium</small>
          </div>
        </div>

        <nav className="app-nav">
          <a href="/area-do-aluno">Dashboard</a>
          <a href="/configurar-edital">Configurar Edital</a>
          <a href="/calculadora-premium">Calculadora</a>
          <a href="/historico">Histórico</a>
          <button onClick={handleLogout}>Sair</button>
        </nav>
      </header>

      <main className="dashboard">
        <section className={`command-hero level-${level}`}>
          <div className="command-hero-content">
            <div className="kicker">Painel de comando</div>
            <h1>Bem-vindo, {profile.name || 'Aluno Operação TAF'}.</h1>
            <p>
              Este é seu painel principal para acompanhar edital, diagnóstico, evolução e próximos passos dentro do Método M60.
            </p>

            <div className="command-actions">
              <a className="btn btn-green" href="/calculadora-premium">Atualizar diagnóstico</a>
              <a className="btn btn-dark" href="/historico">Ver evolução</a>
            </div>
          </div>

          <div className="command-status">
            <span>Nível atual</span>
            <strong>{levelInfo.label}</strong>
            <small>{levelInfo.short}</small>
          </div>
        </section>

        {message && <div className="form-message">{message}</div>}

        {!activeExam ? (
          <section className="premium-panel onboarding-panel">
            <div className="kicker">Primeiro passo obrigatório</div>
            <h2>Configure seu edital para liberar o diagnóstico.</h2>
            <p>
              O sistema precisa saber quais provas seu concurso cobra, os índices mínimos e a data prevista do TAF.
            </p>
            <a className="btn btn-green" href="/configurar-edital">Configurar meu edital</a>
          </section>
        ) : (
          <>
            <section className="dashboard-command-grid">
              <div className="command-card">
                <span>Edital ativo</span>
                <strong>{activeExam.exam_name || summary?.exam_name || '—'}</strong>
                <small>{activeExam.institution || summary?.institution || 'Instituição não informada'}</small>
              </div>

              <div className={`command-card risk-${risk.key}`}>
                <span>Risco no TAF</span>
                <strong>{risk.label}</strong>
                <small>{risk.description}</small>
              </div>

              <div className="command-card">
                <span>Dias até o TAF</span>
                <strong>{dayInfo.value}</strong>
                <small>{dayInfo.label}</small>
              </div>

              <div className="command-card">
                <span>Meta segura</span>
                <strong>{safeTests.length}/{diagnostics.length || summary?.total_tests || 0}</strong>
                <small>Provas acima da margem de segurança.</small>
              </div>

              <div className="command-card">
                <span>Ponto de atenção</span>
                <strong>{getAttentionTest(summary, diagnostics)}</strong>
                <small>{criticalTests.length ? 'Prioridade imediata.' : 'Menor margem atual.'}</small>
              </div>

              <div className="command-card">
                <span>Últimos registros</span>
                <strong>{recentResults.length}</strong>
                <small>Resultados recentes salvos no histórico.</small>
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Próximos passos</div>
                  <h2>O que fazer agora</h2>
                  <p className="muted">
                    Ações recomendadas com base no seu edital e no diagnóstico atual.
                  </p>
                </div>
              </div>

              <div className="next-action-grid">
                {nextActions.map((action, index) => (
                  <div className={`next-action-card priority-${index + 1}`} key={action.title}>
                    <div className="action-number">{index + 1}</div>
                    <div>
                      <h3>{action.title}</h3>
                      <p>{action.text}</p>
                      <a href={action.href}>{action.cta}</a>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Diagnóstico rápido</div>
                  <h2>Situação das provas</h2>
                  <p className="muted">
                    Visão objetiva para saber onde acelerar, manter ou corrigir.
                  </p>
                </div>

                <a className="btn btn-dark" href="/calculadora-premium">Abrir calculadora</a>
              </div>

              {diagnostics.length ? (
                <div className="dashboard-tests-grid">
                  {diagnostics.map((test) => (
                    <div className={`dashboard-test-card status-border-${test.taf_status || 'sem_resultado'}`} key={test.exam_test_id}>
                      <span>{test.test_name}</span>
                      <strong>{test.percent_minimum ? `${formatDecimal(test.percent_minimum)}%` : '—'}</strong>
                      <small>
                        {test.latest_result_value
                          ? `${formatValueByUnit(test.latest_result_value, test.unit, test.calculation_type)}`
                          : 'Sem resultado'}
                      </small>
                      <em>{formatStatus(test.taf_status)}</em>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <h3>Nenhum resultado registrado.</h3>
                  <p>Abra a Calculadora Premium e registre seu primeiro teste.</p>
                  <a className="btn btn-green" href="/calculadora-premium">Registrar primeiro teste</a>
                </div>
              )}
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Método M60</div>
                  <h2>Módulos recomendados</h2>
                  <p className="muted">
                    Organização visual para a futura área de aulas, materiais e treinos.
                  </p>
                </div>
              </div>

              <div className="module-grid">
                {modules.map((module) => (
                  <div className={`module-card ${module.highlight ? 'highlight' : ''}`} key={module.title}>
                    <span>{module.tag}</span>
                    <h3>{module.title}</h3>
                    <p>{module.text}</p>
                    <small>{module.status}</small>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}

        <p className="disclaimer">
          O Operação TAF não promete aprovação automática. O resultado depende da dedicação, condição física, edital,
          execução correta, regularidade e evolução individual do aluno.
        </p>
      </main>
    </div>
  )
}

function buildNextActions({ hasExam, hasResults, level, criticalTests, daysToTaf }) {
  if (!hasExam) {
    return [
      {
        title: 'Configure seu edital',
        text: 'Selecione as provas cobradas, índices mínimos e data prevista do TAF.',
        href: '/configurar-edital',
        cta: 'Configurar agora',
      },
      {
        title: 'Registre seu primeiro teste',
        text: 'Depois do edital, informe seus resultados atuais para liberar o diagnóstico.',
        href: '/calculadora-premium',
        cta: 'Abrir calculadora',
      },
      {
        title: 'Comece pela base',
        text: 'Enquanto não há diagnóstico, priorize técnica correta, regularidade e segurança.',
        href: '/area-do-aluno',
        cta: 'Ver painel',
      },
    ]
  }

  if (!hasResults) {
    return [
      {
        title: 'Registre seu teste atual',
        text: 'A calculadora precisa dos seus resultados atuais para indicar nível, risco e prioridade.',
        href: '/calculadora-premium',
        cta: 'Registrar resultado',
      },
      {
        title: 'Revise os índices',
        text: 'Confira se mínimo e meta segura estão corretos conforme o edital.',
        href: '/configurar-edital',
        cta: 'Revisar edital',
      },
      {
        title: 'Faça um simulado base',
        text: 'Use um teste controlado para levantar sua situação real sem forçar além do necessário.',
        href: '/calculadora-premium',
        cta: 'Iniciar diagnóstico',
      },
    ]
  }

  if (criticalTests.length) {
    return [
      {
        title: `Corrigir ${criticalTests[0].test_name}`,
        text: 'Esta é a prova que mais ameaça sua aprovação agora. Priorize técnica e progressão.',
        href: '/historico',
        cta: 'Ver evolução',
      },
      {
        title: 'Atualizar resultados semanalmente',
        text: 'Registre pelo menos um teste por semana para acompanhar se a preparação está evoluindo.',
        href: '/calculadora-premium',
        cta: 'Atualizar diagnóstico',
      },
      {
        title: 'Evitar treino aleatório',
        text: 'Mantenha o foco no Método M60: base, progressão, performance e segurança.',
        href: '/area-do-aluno',
        cta: 'Ver módulos',
      },
    ]
  }

  if (level === 'blindagem') {
    return [
      {
        title: 'Manter margem segura',
        text: 'Você já está acima da meta. Agora o foco é consistência e prevenção de lesões.',
        href: '/historico',
        cta: 'Ver histórico',
      },
      {
        title: 'Fazer simulados específicos',
        text: 'Treine conforme a ordem, regras e exigências do seu edital.',
        href: '/calculadora-premium',
        cta: 'Registrar simulado',
      },
      {
        title: 'Controlar recuperação',
        text: 'Evite chegar no TAF cansado. A fase final exige inteligência, não exagero.',
        href: '/area-do-aluno',
        cta: 'Ver painel',
      },
    ]
  }

  return [
    {
      title: 'Criar margem de segurança',
      text: 'Você está aprovado ou próximo, mas ainda precisa consolidar desempenho.',
      href: '/calculadora-premium',
      cta: 'Atualizar resultado',
    },
    {
      title: 'Comparar evolução',
      text: 'Use o histórico para ver se a curva está subindo ou estagnada.',
      href: '/historico',
      cta: 'Ver evolução',
    },
    {
      title: daysToTaf && daysToTaf < 30 ? 'Fase final' : 'Manter progressão',
      text: daysToTaf && daysToTaf < 30
        ? 'Com menos de 30 dias, reduza riscos e simule o edital.'
        : 'Continue avançando de forma progressiva, sem pular etapas.',
      href: '/area-do-aluno',
      cta: 'Ver recomendação',
    },
  ]
}

function buildCourseModules(level, activeExam, diagnostics) {
  return [
    {
      tag: 'Módulo 01',
      title: 'Orientação inicial',
      text: 'Como usar a Área Premium, configurar edital e acompanhar evolução.',
      status: activeExam ? 'Liberado' : 'Configure o edital',
      highlight: !activeExam,
    },
    {
      tag: 'Módulo 02',
      title: 'Base física',
      text: 'Construção de resistência, força, técnica e segurança para quem está abaixo do índice.',
      status: level === 'base' || level === 'arranque' ? 'Prioridade atual' : 'Recomendado',
      highlight: level === 'base' || level === 'arranque',
    },
    {
      tag: 'Módulo 03',
      title: 'Progressão por prova',
      text: 'Estratégias específicas para corrida, barra, flexão, abdominal e demais testes.',
      status: diagnostics.length ? 'Usar conforme prova crítica' : 'Aguardando diagnóstico',
      highlight: level === 'progressao',
    },
    {
      tag: 'Módulo 04',
      title: 'Performance e simulados',
      text: 'Preparação para criar margem e executar bem mesmo sob pressão.',
      status: level === 'performance' || level === 'blindagem' ? 'Prioridade atual' : 'Liberado após base',
      highlight: level === 'performance',
    },
    {
      tag: 'Módulo 05',
      title: 'Blindagem final',
      text: 'Manutenção, prevenção de lesões, recuperação e ajustes para a reta final.',
      status: level === 'blindagem' ? 'Prioridade atual' : 'Liberado na fase final',
      highlight: level === 'blindagem',
    },
    {
      tag: 'Materiais',
      title: 'Planilhas e guias',
      text: 'Área reservada para PDF, cronograma, guias técnicos e materiais complementares.',
      status: 'Em preparação',
      highlight: false,
    },
  ]
}

function getRisk(level) {
  if (level === 'base' || level === 'arranque') {
    return {
      key: 'alto',
      label: 'Alto',
      description: 'Existe risco real se o TAF fosse hoje.',
    }
  }

  if (level === 'progressao') {
    return {
      key: 'medio',
      label: 'Médio',
      description: 'Você está perto, mas ainda sem margem.',
    }
  }

  if (level === 'performance' || level === 'blindagem') {
    return {
      key: 'baixo',
      label: 'Baixo',
      description: 'O foco agora é manter e consolidar.',
    }
  }

  return {
    key: 'aguardando',
    label: 'Aguardando',
    description: 'Registre seus resultados para calcular.',
  }
}

function getLevelInfo(level) {
  const levels = {
    base: {
      label: 'Base',
      short: 'Zona crítica. Construir fundamento antes de acelerar.',
    },
    arranque: {
      label: 'Arranque',
      short: 'Abaixo do mínimo, mas com ponto de partida.',
    },
    progressao: {
      label: 'Progressão',
      short: 'Perto do índice. Falta criar margem.',
    },
    performance: {
      label: 'Performance',
      short: 'Mínimo atingido. Agora é consistência.',
    },
    blindagem: {
      label: 'Blindagem',
      short: 'Acima da meta segura. Manter, simular e prevenir lesões.',
    },
    sem_resultado: {
      label: 'Sem resultado',
      short: 'Registre seu teste para liberar diagnóstico.',
    },
  }

  return levels[level] || levels.sem_resultado
}

function getAttentionTest(summary, diagnostics) {
  const valid = (diagnostics || [])
    .filter((item) => item.percent_minimum !== null && item.percent_minimum !== undefined)
    .sort((a, b) => Number(a.percent_minimum) - Number(b.percent_minimum))

  return summary?.weakest_test || valid[0]?.test_name || '—'
}

function parseLocalDate(dateValue) {
  if (!dateValue) return null

  const text = String(dateValue)

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function getDaysToDate(date) {
  const tafDate = parseLocalDate(date)
  if (!tafDate) return null

  const todayDate = new Date()
  todayDate.setHours(0, 0, 0, 0)
  tafDate.setHours(0, 0, 0, 0)

  const diff = tafDate.getTime() - todayDate.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function formatDaysToTaf(days) {
  if (days === null || days === undefined) {
    return {
      value: '—',
      label: 'Data do TAF não informada.',
    }
  }

  if (days < 0) {
    return {
      value: 'TAF vencido',
      label: 'Revise a data em Configurar Edital.',
    }
  }

  if (days === 0) {
    return {
      value: 'Hoje',
      label: 'O TAF está marcado para hoje.',
    }
  }

  return {
    value: String(days),
    label: 'Dias restantes para ajustar sua preparação.',
  }
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Number(Number(value).toFixed(2))).replace('.', ',')
}

function formatStatus(status) {
  const labels = {
    critico: 'Crítico',
    abaixo_do_minimo: 'Abaixo',
    proximo_do_minimo: 'Próximo',
    atingiu_minimo: 'Mínimo',
    atingiu_meta_segura: 'Meta segura',
    sem_resultado: 'Sem resultado',
  }

  return labels[status] || 'Sem resultado'
}

function formatTimeValue(value) {
  const absolute = Math.abs(Math.round(Number(value)))
  const minutes = Math.floor(absolute / 60)
  const seconds = String(absolute % 60).padStart(2, '0')
  return minutes > 0 ? `${minutes}:${seconds}` : `${seconds}s`
}

function formatValueByUnit(value, unit, calculationType) {
  if (value === null || value === undefined) return '—'

  if (calculationType === 'lower_is_better' && unit === 'segundos') {
    return formatTimeValue(value)
  }

  return `${formatDecimal(value)} ${unit || ''}`.trim()
}
