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
      .limit(12)

    setRecentResults(resultsData || [])
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const level = summary?.taf_level || 'sem_resultado'
  const levelInfo = getLevelInfo(level)
  const risk = getRisk(level)
  const daysToTaf = getDaysToDate(activeExam?.taf_date || summary?.taf_date)
  const dayInfo = formatDaysToTaf(daysToTaf)

  const criticalTests = useMemo(() => {
    return diagnostics.filter((test) =>
      ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(test.taf_status)
    )
  }, [diagnostics])

  const safeTests = useMemo(() => {
    return diagnostics.filter((test) => test.taf_status === 'atingiu_meta_segura')
  }, [diagnostics])

  const minimumTests = useMemo(() => {
    return diagnostics.filter((test) =>
      ['atingiu_minimo', 'atingiu_meta_segura'].includes(test.taf_status)
    )
  }, [diagnostics])

  const progress = useMemo(() => {
    return calculateGeneralProgress(diagnostics)
  }, [diagnostics])

  const trainingFocus = useMemo(() => {
    return buildTrainingFocus({
      level,
      daysToTaf,
      criticalTests,
      diagnostics,
    })
  }, [level, daysToTaf, criticalTests, diagnostics])

  const nextActions = useMemo(() => {
    return buildNextActions({
      hasExam: Boolean(activeExam),
      hasResults: diagnostics.some((item) => item.latest_result_value),
      level,
      criticalTests,
      daysToTaf,
    })
  }, [activeExam, diagnostics, level, criticalTests, daysToTaf])

  const recentEvolution = useMemo(() => {
    return buildRecentEvolution(recentResults)
  }, [recentResults])

  const isAdmin = profile?.role === 'admin' || profile?.email === 'sabrinasebben@sevbenoficial.com'

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
          <a href="/perfil">Perfil</a>
          {isAdmin && <a href="/admin">Admin</a>}
          <button onClick={handleLogout}>Sair</button>
        </nav>
      </header>

      <main className="dashboard">
        <section className={`student-command-hero level-${level}`}>
          <div className="student-hero-main">
            <div className="kicker">Painel de comando</div>
            <h1>{levelInfo.commercialLabel}</h1>
            <p>
              {profile.name ? `${profile.name}, ` : ''}{levelInfo.description}
            </p>

            <div className="student-hero-actions">
              <a className="btn btn-green" href="/calculadora-premium">Atualizar diagnóstico</a>
              <a className="btn btn-dark" href="/historico">Ver evolução</a>
            </div>
          </div>

          <div className="student-countdown-card">
            <span>TAF</span>
            <strong>{dayInfo.value}</strong>
            <small>{dayInfo.label}</small>
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
            <section className="student-top-grid">
              <div className="student-progress-card">
                <div className="student-card-head">
                  <span>Preparação geral</span>
                  <strong>{progress.value}%</strong>
                </div>

                <div className="progress-bar-shell">
                  <div className="progress-bar-fill" style={{ width: `${progress.value}%` }} />
                </div>

                <p>{progress.label}</p>
              </div>

              <div className={`student-risk-card risk-${risk.key}`}>
                <span>Risco atual</span>
                <strong>{risk.label}</strong>
                <small>{risk.description}</small>
              </div>

              <div className="student-risk-card">
                <span>Edital ativo</span>
                <strong>{activeExam.exam_name || summary?.exam_name || '—'}</strong>
                <small>{activeExam.institution || summary?.institution || 'Instituição não informada'}</small>
              </div>

              <div className="student-risk-card">
                <span>Provas seguras</span>
                <strong>{safeTests.length}/{diagnostics.length}</strong>
                <small>Acima da meta segura.</small>
              </div>
            </section>

            <section className="student-situation-grid">
              <div className="premium-panel student-focus-panel">
                <div className="panel-head">
                  <div>
                    <div className="kicker">Prioridade de treino</div>
                    <h2>{trainingFocus.title}</h2>
                    <p className="muted">{trainingFocus.text}</p>
                  </div>
                </div>

                <div className="focus-list">
                  {trainingFocus.items.map((item) => (
                    <div className="focus-item" key={item.title}>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div className="premium-panel student-readiness-panel">
                <div className="kicker">Status do aluno</div>
                <h2>{levelInfo.label}</h2>
                <p>{levelInfo.long}</p>

                <div className="readiness-tags">
                  <span>{minimumTests.length}/{diagnostics.length} no mínimo</span>
                  <span>{criticalTests.length} ponto(s) críticos</span>
                  <span>{recentResults.length} registro(s) recentes</span>
                </div>
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Próximos passos</div>
                  <h2>O que fazer agora</h2>
                  <p className="muted">
                    Ações recomendadas com base no seu edital, nos seus resultados e no prazo até o TAF.
                  </p>
                </div>
              </div>

              <div className="student-action-grid">
                {nextActions.map((action, index) => (
                  <div className={`student-action-card priority-${index + 1}`} key={action.title}>
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

            <section className="student-analysis-grid">
              <div className="premium-panel">
                <div className="panel-head">
                  <div>
                    <div className="kicker">Mapa do edital</div>
                    <h2>Situação das provas</h2>
                    <p className="muted">Veja rapidamente o que está seguro, no limite ou em risco.</p>
                  </div>

                  <a className="btn btn-dark" href="/calculadora-premium">Abrir calculadora</a>
                </div>

                {diagnostics.length ? (
                  <div className="student-tests-list">
                    {diagnostics.map((test) => (
                      <div className={`student-test-row status-border-${test.taf_status || 'sem_resultado'}`} key={test.exam_test_id}>
                        <div>
                          <strong>{test.test_name}</strong>
                          <small>
                            {test.latest_result_value
                              ? formatValueByUnit(test.latest_result_value, test.unit, test.calculation_type)
                              : 'Sem resultado'}
                          </small>
                        </div>

                        <div className="student-test-percent">
                          <strong>{test.percent_minimum ? `${formatDecimal(test.percent_minimum)}%` : '—'}</strong>
                          <span className={`taf-status-pill status-${test.taf_status || 'sem_resultado'}`}>
                            {formatStatus(test.taf_status)}
                          </span>
                        </div>
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
              </div>

              <div className="premium-panel">
                <div className="kicker">Últimos 30 dias</div>
                <h2>Evolução recente</h2>
                <p className="muted">
                  Resumo dos registros recentes salvos na calculadora.
                </p>

                <div className="recent-evolution-box">
                  <strong>{recentEvolution.total}</strong>
                  <span>resultado(s) registrados</span>
                  <small>{recentEvolution.label}</small>
                </div>

                <a className="btn btn-green full-width-btn" href="/historico">Ver histórico completo</a>
              </div>
            </section>

            <section className="premium-panel hotmart-reminder-panel">
              <div>
                <div className="kicker">Aulas e materiais</div>
                <h2>Curso completo na Hotmart</h2>
                <p className="muted">
                  Os vídeos, PDFs e planilhas ficam na Hotmart. Esta Área Premium é seu painel de diagnóstico, evolução e acompanhamento.
                </p>
              </div>

              <a className="btn btn-dark" href="/perfil">Acessar pelo perfil</a>
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

function calculateGeneralProgress(diagnostics) {
  if (!diagnostics.length) {
    return {
      value: 0,
      label: 'Configure o edital e registre seus primeiros resultados.',
    }
  }

  const valid = diagnostics.filter((item) => item.percent_minimum !== null && item.percent_minimum !== undefined)

  if (!valid.length) {
    return {
      value: 0,
      label: 'Registre seus resultados para calcular a preparação geral.',
    }
  }

  const average = valid.reduce((sum, item) => {
    const percent = Math.min(Number(item.percent_minimum) || 0, 120)
    return sum + percent
  }, 0) / valid.length

  const value = Math.max(0, Math.min(100, Math.round(average)))

  let label = 'Você está construindo sua preparação.'
  if (value < 70) label = 'Zona crítica: priorize base, técnica e regularidade.'
  else if (value < 90) label = 'Em evolução: ainda falta consistência para o mínimo.'
  else if (value < 100) label = 'Perto do índice: foco em margem de segurança.'
  else label = 'Mínimo atingido nas provas registradas. Agora busque margem segura.'

  return { value, label }
}

function buildTrainingFocus({ level, daysToTaf, criticalTests, diagnostics }) {
  if (!diagnostics.length) {
    return {
      title: 'Configurar edital',
      text: 'O primeiro passo é informar as provas cobradas e os índices mínimos.',
      items: [
        { title: 'Configurar edital', description: 'Selecione as provas e informe os mínimos.' },
        { title: 'Registrar teste base', description: 'Faça um teste inicial para liberar diagnóstico.' },
        { title: 'Começar com segurança', description: 'Evite treinos aleatórios antes do diagnóstico.' },
      ],
    }
  }

  if (criticalTests.length) {
    return {
      title: `Corrigir ${criticalTests[0].test_name}`,
      text: 'Existe pelo menos uma prova abaixo do mínimo ou sem margem. Esta deve ser a prioridade imediata.',
      items: [
        { title: criticalTests[0].test_name, description: 'Prioridade número 1 do momento.' },
        { title: 'Técnica correta', description: 'Corrija execução antes de aumentar intensidade.' },
        { title: 'Progressão semanal', description: 'Registre novos testes para confirmar evolução.' },
      ],
    }
  }

  if (level === 'blindagem') {
    return {
      title: 'Manter desempenho',
      text: 'Você está acima da meta segura. Agora o foco é chegar inteiro, consistente e confiante.',
      items: [
        { title: 'Simulado específico', description: 'Treine conforme a ordem e regras do edital.' },
        { title: 'Prevenção de lesões', description: 'Controle volume, sono, dor e recuperação.' },
        { title: 'Manutenção', description: 'Não arrisque excesso desnecessário.' },
      ],
    }
  }

  if (daysToTaf !== null && daysToTaf <= 30) {
    return {
      title: 'Reta final',
      text: 'Com pouco tempo até o TAF, a prioridade é simular prova, evitar lesão e consolidar desempenho.',
      items: [
        { title: 'Simulados controlados', description: 'Reproduza o edital sem exagerar no volume.' },
        { title: 'Recuperação', description: 'Chegar descansado é parte da estratégia.' },
        { title: 'Execução limpa', description: 'Evite perder repetições por erro técnico.' },
      ],
    }
  }

  return {
    title: 'Criar margem',
    text: 'Você já avançou, mas ainda precisa transformar mínimo em segurança.',
    items: [
      { title: 'Meta segura', description: 'Busque resultado acima do mínimo do edital.' },
      { title: 'Consistência', description: 'Treine com regularidade e registre evolução.' },
      { title: 'Controle de risco', description: 'Evite pular etapas ou forçar demais.' },
    ],
  }
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
        text: 'Mantenha foco: base, progressão, performance e segurança.',
        href: '/area-do-aluno',
        cta: 'Ver painel',
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

function buildRecentEvolution(recentResults) {
  if (!recentResults.length) {
    return {
      total: 0,
      label: 'Nenhum resultado recente. Registre seu primeiro teste.',
    }
  }

  const now = new Date()
  const last30 = recentResults.filter((item) => {
    const date = new Date(item.result_date)
    const diff = now.getTime() - date.getTime()
    return diff <= 30 * 24 * 60 * 60 * 1000
  })

  return {
    total: last30.length,
    label: last30.length
      ? 'Resultados registrados nos últimos 30 dias.'
      : 'Há resultados salvos, mas nenhum nos últimos 30 dias.',
  }
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
      commercialLabel: 'Risco de reprovação',
      description: 'sua preparação está em zona crítica. O foco agora é construir base, corrigir técnica e evitar treino aleatório.',
      long: 'Existe pelo menos uma prova em situação crítica. A prioridade é construir fundamento físico e técnico antes de aumentar intensidade.',
    },
    arranque: {
      label: 'Arranque',
      commercialLabel: 'Em recuperação',
      description: 'você já tem ponto de partida, mas ainda está abaixo do mínimo. A prioridade é evoluir com regularidade.',
      long: 'Você ainda não está seguro para o TAF. O foco é progressão controlada, técnica e constância.',
    },
    progressao: {
      label: 'Progressão',
      commercialLabel: 'Perto da aprovação',
      description: 'você está se aproximando do índice, mas ainda precisa criar margem para não depender de um dia perfeito.',
      long: 'Você está próximo do mínimo. Agora precisa transformar proximidade em segurança.',
    },
    performance: {
      label: 'Performance',
      commercialLabel: 'Apto com atenção',
      description: 'você já atingiu o mínimo em provas importantes. Agora o foco é consistência e margem.',
      long: 'O mínimo foi atingido, mas ainda é importante consolidar desempenho e evitar queda no dia da prova.',
    },
    blindagem: {
      label: 'Blindagem',
      commercialLabel: 'Zona segura',
      description: 'você está acima da meta segura. O foco agora é manter desempenho, simular o edital e evitar lesão.',
      long: 'Você já tem margem de segurança. A fase atual exige manutenção, controle de carga e recuperação inteligente.',
    },
    sem_resultado: {
      label: 'Sem resultado',
      commercialLabel: 'Diagnóstico pendente',
      description: 'registre seus resultados para desbloquear a leitura completa da preparação.',
      long: 'Ainda não há dados suficientes para avaliar seu nível atual.',
    },
  }

  return levels[level] || levels.sem_resultado
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
    value: `${days}`,
    label: 'dias restantes',
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
