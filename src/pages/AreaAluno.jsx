import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import StudentNav from '../components/StudentNav'

const HOTMART_COURSE_URL = import.meta.env.VITE_HOTMART_COURSE_URL || ''

export default function AreaAluno({ profile }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeExam, setActiveExam] = useState(null)
  const [summary, setSummary] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])
  const [recentResults, setRecentResults] = useState([])

  useEffect(() => {
    // The function declaration is intentionally hoisted; it uses the current profile.
    // eslint-disable-next-line react-hooks/immutability
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

  const weeklyProgress = useMemo(() => {
    return buildWeeklyProgress(recentResults)
  }, [recentResults])

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

        <StudentNav profile={profile} onLogout={handleLogout} hotmartUrl={HOTMART_COURSE_URL} />
      </header>

      <main className="dashboard">
        <section className={`student-command-hero level-${level}`} aria-label={`Situação atual: ${levelInfo.label}`}>
          <div className="student-hero-main">
            <div className="kicker">Seu painel hoje</div>
            <h1>Seu próximo treino</h1>
            <p>
              {getFirstName(profile.name) ? `${getFirstName(profile.name)}, ` : ''}{nextActions[0].text}
            </p>

            <div className="student-hero-actions">
              <Link className="btn btn-green" to={nextActions[0].href}>{nextActions[0].cta}</Link>
            </div>
          </div>

          <div className="student-hero-aside">
            <div className="student-countdown-card">
              <span>TAF</span>
              <strong>{dayInfo.value}</strong>
              <small>{dayInfo.label}</small>
            </div>
            <div className="student-week-card">
              <span>Progresso da semana</span>
              <strong>{weeklyProgress.value}</strong>
              <small>{weeklyProgress.label}</small>
            </div>
          </div>
        </section>

        {message && <div className="form-message">{message}</div>}

        {!activeExam ? (
          <section className="premium-panel onboarding-panel guided-onboarding">
            <div className="kicker">Comece por aqui</div>
            <h2>Organize sua preparação em quatro passos.</h2>
            <p>
              Complete esta sequência uma vez. Depois, o painel mostrará apenas o que você precisa fazer agora.
            </p>
            <ol className="guided-steps">
              <li className="done"><strong>1. Complete seu perfil</strong><span>Confira seus dados de acesso.</span></li>
              <li className="active"><strong>2. Informe seu edital</strong><span>Selecione as provas, mínimos e a data do TAF.</span></li>
              <li><strong>3. Veja seu plano</strong><span>Registre os resultados para liberar seu diagnóstico.</span></li>
              <li><strong>4. Comece o treino</strong><span>Siga a prioridade indicada e acompanhe a evolução.</span></li>
            </ol>
            <Link className="btn btn-green" to="/configurar-edital">Configurar meu edital</Link>
          </section>
        ) : (
          <>
            <section className="premium-panel student-status-summary">
              <div>
                <div className="kicker">Sua situação hoje</div>
                <h2>{buildStatusHeadline(minimumTests.length, diagnostics.length, safeTests.length)}</h2>
                <p>{buildStatusExplanation(minimumTests.length, diagnostics.length, safeTests.length, criticalTests.length)}</p>
              </div>

              <div className="student-status-metrics">
                <div className={`student-status-metric risk-${risk.key}`}>
                  <span>Risco</span>
                  <strong>{risk.label}</strong>
                  <small>{risk.description}</small>
                </div>
                <div className="student-status-metric">
                  <span>Margem segura</span>
                  <strong>{safeTests.length}/{diagnostics.length}</strong>
                  <small>provas acima da meta segura</small>
                </div>
                <div className="student-status-metric">
                  <span>Meu edital</span>
                  <strong>{formatDisplayText(activeExam.exam_name || summary?.exam_name || '—')}</strong>
                  <small>{formatDisplayText(activeExam.institution || summary?.institution || 'Instituição não informada')}</small>
                </div>
              </div>
            </section>

            <section id="meu-plano" className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Meu plano de treino</div>
                  <h2>O que fazer agora</h2>
                  <p className="muted">
                    Ordem prática de execução para a próxima semana de preparação.
                  </p>
                </div>
              </div>

              <div className="student-primary-action">
                <div className="action-number">1</div>
                <div>
                  <span className="action-label">Prioridade da semana</span>
                  <h3>{nextActions[0].title}</h3>
                  <p>{nextActions[0].text}</p>
                </div>
                <Link className="btn btn-green" to={nextActions[0].href}>{nextActions[0].cta}</Link>
              </div>
            </section>

            <section className="student-analysis-grid">
              <div className="premium-panel">
                <div className="panel-head">
                  <div>
                    <div className="kicker">Mapa do edital</div>
                    <h2>Leitura das provas</h2>
                    <p className="muted">Identifique o que está seguro, no limite ou exigindo correção imediata.</p>
                  </div>

                  <Link className="btn btn-dark" to="/calculadora-premium">Abrir calculadora</Link>
                </div>

                {diagnostics.length ? (
                  <div className="student-tests-list">
                    {diagnostics.map((test) => (
                      <div className={`student-test-row status-border-${test.taf_status || 'sem_resultado'}`} key={test.exam_test_id}>
                        <div>
                          <strong>{formatDisplayText(test.test_name)}</strong>
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
                    <Link className="btn btn-green" to="/calculadora-premium">Registrar primeiro teste</Link>
                  </div>
                )}
              </div>

              <div className="premium-panel">
                <div className="kicker">Últimos 30 dias</div>
                <h2>Ritmo de controle</h2>
                <p className="muted">
                  Frequência de registros recentes na calculadora.
                </p>

                <div className="recent-evolution-box">
                  <strong>{recentEvolution.total}</strong>
                  <span>resultado(s) registrados</span>
                  <small>{recentEvolution.label}</small>
                </div>

                <Link className="btn btn-green full-width-btn" to="/historico">Ver histórico completo</Link>
              </div>
            </section>

            <section className="premium-panel hotmart-reminder-panel">
              <div>
                <div className="kicker">Aulas e materiais</div>
                <h2>Continue pela Hotmart</h2>
                <p className="muted">
                  Use a Hotmart para assistir às aulas, acessar PDFs e materiais do curso. Use esta Área Premium para diagnóstico, evolução e controle do TAF.
                </p>
              </div>

              {HOTMART_COURSE_URL ? (
                <a className="btn btn-dark" href={HOTMART_COURSE_URL} target="_blank" rel="noreferrer">Abrir Hotmart</a>
              ) : (
                <Link className="btn btn-dark" to="/perfil">Ver no perfil</Link>
              )}
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

function buildStatusHeadline(minimumCount, totalTests, safeCount) {
  if (!totalTests) return 'Registre seus resultados para ver sua situação.'
  if (minimumCount < totalTests) return `Você atingiu o mínimo em ${minimumCount} de ${totalTests} provas.`
  if (safeCount < totalTests) return `Você atingiu o mínimo nas ${totalTests} provas, mas ainda precisa criar margem.`
  return `Você tem margem segura nas ${totalTests} provas do seu edital.`
}

function buildStatusExplanation(minimumCount, totalTests, safeCount, criticalCount) {
  if (!totalTests) return 'A calculadora transforma seus resultados em um diagnóstico simples e mostra o próximo passo.'
  if (criticalCount) return 'Há provas abaixo ou próximas do mínimo. Priorize a correção antes de buscar desempenho extra.'
  if (safeCount < totalTests) return `O mínimo foi alcançado em ${minimumCount} de ${totalTests}, mas apenas ${safeCount} prova(s) estão acima da meta segura.`
  return 'Mantenha a regularidade e registre novos resultados para confirmar que seu desempenho continua estável.'
}

// Esta rotina permanece pronta para uma próxima seção de foco tático.
// eslint-disable-next-line no-unused-vars
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
      title: 'Manter zona segura',
      text: 'Você já está em zona segura. A missão é manter desempenho, simular o edital e reduzir risco de lesão.',
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
    title: 'Criar margem segura',
    text: 'Você já avançou. Agora precisa transformar mínimo em margem segura e repetível.',
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
      label: 'Nenhum registro recente. Atualize a calculadora para manter o controle da evolução.',
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
      ? 'Controle ativo nos últimos 30 dias.'
      : 'Há resultados salvos, mas nenhum registro recente nos últimos 30 dias.',
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
      description: 'o diagnóstico aponta uma zona crítica. A missão agora é construir base, corrigir execução e recuperar desempenho com segurança.',
      long: 'Há prova em situação crítica ou desempenho insuficiente para o mínimo. Priorize regularidade, técnica e evolução progressiva.',
    },
    arranque: {
      label: 'Arranque',
      commercialLabel: 'Em recuperação',
      description: 'você já tem ponto de partida, mas ainda precisa sair da zona de risco. O foco é consistência e ganho controlado.',
      long: 'Você ainda não está seguro para o TAF. O objetivo é transformar treino em resultado medido, sem pular etapas.',
    },
    progressao: {
      label: 'Progressão',
      commercialLabel: 'Perto da aprovação',
      description: 'você está se aproximando do índice. Agora precisa criar margem para não depender de um dia perfeito.',
      long: 'Você está próximo do mínimo. A meta é sair do limite e construir segurança real para o dia da prova.',
    },
    performance: {
      label: 'Performance',
      commercialLabel: 'Apto com atenção',
      description: 'você já mostra desempenho competitivo. Agora o foco é consolidar margem, simular o edital e manter regularidade.',
      long: 'O mínimo foi atingido em pontos importantes. Continue criando margem e evitando queda de desempenho.',
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

function getFirstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || ''
}

function formatDisplayText(value) {
  const text = String(value || '').trim()

  if (!text || text === '—') return text || '—'

  const acronyms = new Set([
    'TAF', 'BM', 'PM', 'PRF', 'PF', 'PC', 'CBM', 'GCM', 'GM',
    'CFO', 'CTSP', 'ESA', 'EEAR', 'ESPCEX', 'BPM'
  ])

  return text
    .toLowerCase()
    .split(' ')
    .map((word) => {
      const clean = word.replace(/[^a-zA-ZÀ-ÿ0-9]/g, '').toUpperCase()

      if (acronyms.has(clean)) return clean

      if (word.length <= 2 && !/^\d+$/.test(word)) return word

      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
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

function buildWeeklyProgress(recentResults) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const total = recentResults.filter((item) => new Date(item.result_date).getTime() >= weekAgo).length

  return {
    value: total,
    label: total === 1 ? 'resultado registrado nesta semana' : 'resultados registrados nesta semana',
  }
}
