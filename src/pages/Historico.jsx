import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Historico({ profile }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeExam, setActiveExam] = useState(null)
  const [examTests, setExamTests] = useState([])
  const [results, setResults] = useState([])
  const [selectedTestId, setSelectedTestId] = useState('')

  useEffect(() => {
    loadHistory()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  async function loadHistory() {
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
      setExamTests([])
      setResults([])
      setLoading(false)
      return
    }

    setActiveExam(examData)

    const { data: testsData, error: testsError } = await supabase
      .from('exam_tests')
      .select('*')
      .eq('student_exam_id', examData.id)
      .order('test_name', { ascending: true })

    if (testsError) {
      setMessage('Erro ao carregar provas do edital.')
      setLoading(false)
      return
    }

    setExamTests(testsData || [])

    const { data: resultsData, error: resultsError } = await supabase
      .from('test_results')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .order('result_date', { ascending: true })
      .order('created_at', { ascending: true })

    if (resultsError) {
      setMessage('Erro ao carregar histórico de resultados.')
      setLoading(false)
      return
    }

    setResults(resultsData || [])

    const firstTestWithResult = (testsData || []).find((test) =>
      (resultsData || []).some((result) => result.exam_test_id === test.id)
    )

    setSelectedTestId((current) => current || firstTestWithResult?.id || testsData?.[0]?.id || '')
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const testStats = useMemo(() => {
    return examTests.map((test) => {
      const testResults = results
        .filter((result) => result.exam_test_id === test.id)
        .sort((a, b) => new Date(a.result_date) - new Date(b.result_date))

      const first = testResults[0] || null
      const latest = testResults[testResults.length - 1] || null

      const best = getBestResult(test, testResults)
      const firstPercent = first ? calculatePercent(test, first.result_value) : null
      const latestPercent = latest ? calculatePercent(test, latest.result_value) : null
      const bestPercent = best ? calculatePercent(test, best.result_value) : null
      const progress =
        first && latest
          ? getProgressValue(test, first.result_value, latest.result_value)
          : null

      return {
        test,
        results: testResults,
        first,
        latest,
        best,
        firstPercent,
        latestPercent,
        bestPercent,
        progress,
        status: latest ? getStatus(test, latest.result_value) : 'sem_resultado',
      }
    })
  }, [examTests, results])

  const selectedStats = testStats.find((item) => item.test.id === selectedTestId) || testStats[0] || null

  const totalSessions = useMemo(() => {
    const dates = new Set(results.map((result) => result.result_date))
    return dates.size
  }, [results])

  const recordsCount = results.length
  const latestDate = results.length ? results[results.length - 1].result_date : null
  const testsWithResults = testStats.filter((item) => item.latest).length
  const testsAtSafeGoal = testStats.filter((item) => item.status === 'atingiu_meta_segura').length
  const testsBelowMinimum = testStats.filter((item) =>
    ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(item.status)
  ).length

  if (loading) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Histórico</div>
            <h1>Carregando evolução...</h1>
            <p className="muted">Buscando seus testes registrados.</p>
          </div>
        </main>
      </div>
    )
  }

  if (!activeExam) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand-row">
            <span className="brand-mark">◎</span>
            <div>
              <strong>OPERAÇÃO TAF</strong>
              <small>Histórico</small>
            </div>
          </div>

          <nav className="app-nav">
            <a href="/area-do-aluno">Dashboard</a>
            <a href="/configurar-edital">Configurar Edital</a>
            <a href="/calculadora-premium">Calculadora</a>
            <button onClick={handleLogout}>Sair</button>
          </nav>
        </header>

        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Edital necessário</div>
            <h1>Configure seu edital primeiro</h1>
            <p className="muted">
              Para acompanhar a evolução, primeiro configure as provas do seu concurso.
            </p>
            <a className="btn btn-green" href="/configurar-edital">
              Configurar edital
            </a>
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
            <small>Histórico de evolução</small>
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
        <section className="welcome-card history-hero">
          <div>
            <div className="kicker">Evolução Operação TAF</div>
            <h1>Histórico por prova</h1>
            <p>
              Acompanhe cada teste registrado, compare marcas e veja se sua preparação está criando margem real para o TAF.
            </p>
          </div>

          <div className="status-badge">{activeExam.exam_name || 'Edital ativo'}</div>
        </section>

        {message && <div className="form-message">{message}</div>}

        <section className="profile-grid history-summary-grid">
          <div className="info-card">
            <span>Dias de teste</span>
            <strong>{totalSessions}</strong>
          </div>

          <div className="info-card">
            <span>Resultados salvos</span>
            <strong>{recordsCount}</strong>
          </div>

          <div className="info-card">
            <span>Provas com histórico</span>
            <strong>{testsWithResults}/{examTests.length}</strong>
          </div>

          <div className="info-card">
            <span>Meta segura</span>
            <strong>{testsAtSafeGoal}/{examTests.length}</strong>
          </div>

          <div className="info-card">
            <span>Abaixo ou sem margem</span>
            <strong>{testsBelowMinimum}</strong>
          </div>

          <div className="info-card">
            <span>Último teste</span>
            <strong>{latestDate ? formatDate(latestDate) : '—'}</strong>
          </div>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Selecionar prova</div>
              <h2>Evolução individual</h2>
              <p className="muted">
                Escolha uma prova para visualizar a linha de evolução e os registros detalhados.
              </p>
            </div>

            <a className="btn btn-green" href="/calculadora-premium">
              Registrar novo teste
            </a>
          </div>

          <div className="history-test-tabs">
            {testStats.map((item) => (
              <button
                type="button"
                key={item.test.id}
                className={`history-test-tab ${selectedStats?.test.id === item.test.id ? 'active' : ''}`}
                onClick={() => setSelectedTestId(item.test.id)}
              >
                <strong>{item.test.test_name}</strong>
                <span className={`taf-status-pill status-${item.status}`}>
                  {formatStatus(item.status)}
                </span>
              </button>
            ))}
          </div>
        </section>

        {selectedStats ? (
          <>
            <section className="profile-grid selected-test-grid">
              <div className="info-card">
                <span>Prova</span>
                <strong>{selectedStats.test.test_name}</strong>
              </div>

              <div className="info-card">
                <span>Primeiro resultado</span>
                <strong>{selectedStats.first ? formatValueByUnit(selectedStats.first.result_value, selectedStats.test.unit, selectedStats.test.calculation_type) : '—'}</strong>
              </div>

              <div className="info-card">
                <span>Último resultado</span>
                <strong>{selectedStats.latest ? formatValueByUnit(selectedStats.latest.result_value, selectedStats.test.unit, selectedStats.test.calculation_type) : '—'}</strong>
              </div>

              <div className="info-card">
                <span>Melhor marca</span>
                <strong>{selectedStats.best ? formatValueByUnit(selectedStats.best.result_value, selectedStats.test.unit, selectedStats.test.calculation_type) : '—'}</strong>
              </div>

              <div className="info-card">
                <span>Evolução</span>
                <strong>{selectedStats.progress !== null ? formatProgress(selectedStats.test, selectedStats.progress) : '—'}</strong>
              </div>

              <div className="info-card">
                <span>% do mínimo</span>
                <strong>{selectedStats.latestPercent !== null ? `${formatDecimal(selectedStats.latestPercent)}%` : '—'}</strong>
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Gráfico simples</div>
                  <h2>{selectedStats.test.test_name}</h2>
                  <p className="muted">
                    Linha de evolução considerando os testes registrados. A linha do mínimo e da meta segura aparecem como referência.
                  </p>
                </div>
              </div>

              {selectedStats.results.length >= 2 ? (
                <SimpleLineChart stats={selectedStats} />
              ) : (
                <div className="empty-state">
                  <h3>Ainda não há evolução suficiente.</h3>
                  <p>
                    Registre pelo menos dois testes dessa prova para visualizar a evolução.
                  </p>
                  <a className="btn btn-green" href="/calculadora-premium">
                    Registrar novo resultado
                  </a>
                </div>
              )}
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Linha do tempo</div>
                  <h2>Registros da prova</h2>
                </div>
              </div>

              <div className="premium-tests-table-wrap">
                <table className="premium-tests-table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Resultado</th>
                      <th>% mínimo</th>
                      <th>Status</th>
                      <th>Observações</th>
                    </tr>
                  </thead>

                  <tbody>
                    {selectedStats.results.length ? (
                      selectedStats.results
                        .slice()
                        .reverse()
                        .map((result) => {
                          const percent = calculatePercent(selectedStats.test, result.result_value)
                          const status = getStatus(selectedStats.test, result.result_value)

                          return (
                            <tr key={result.id || `${result.result_date}-${result.result_value}`}>
                              <td>{formatDate(result.result_date)}</td>
                              <td>{formatValueByUnit(result.result_value, selectedStats.test.unit, selectedStats.test.calculation_type)}</td>
                              <td>{formatDecimal(percent)}%</td>
                              <td>
                                <span className={`taf-status-pill status-${status}`}>
                                  {formatStatus(status)}
                                </span>
                              </td>
                              <td>{result.notes || '—'}</td>
                            </tr>
                          )
                        })
                    ) : (
                      <tr>
                        <td colSpan="5">Nenhum resultado registrado para esta prova.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : (
          <section className="premium-panel">
            <div className="empty-state">
              <h3>Nenhuma prova configurada.</h3>
              <p>Volte para Configurar Edital e selecione as provas cobradas no concurso.</p>
              <a className="btn btn-green" href="/configurar-edital">
                Configurar edital
              </a>
            </div>
          </section>
        )}

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Comparativo geral</div>
              <h2>Mapa das provas</h2>
              <p className="muted">
                Visão rápida da situação atual em cada prova do edital.
              </p>
            </div>
          </div>

          <div className="history-map-grid">
            {testStats.map((item) => (
              <div className={`history-map-card status-border-${item.status}`} key={item.test.id}>
                <span>{item.test.test_name}</span>
                <strong>{item.latestPercent !== null ? `${formatDecimal(item.latestPercent)}%` : '—'}</strong>
                <small>
                  {item.latest
                    ? formatValueByUnit(item.latest.result_value, item.test.unit, item.test.calculation_type)
                    : 'Sem resultado'}
                </small>
                <em>{formatStatus(item.status)}</em>
              </div>
            ))}
          </div>
        </section>

        <p className="disclaimer">
          O histórico serve como ferramenta de acompanhamento. Resultado final depende de regularidade, recuperação,
          execução correta, condição física e regras específicas do edital.
        </p>
      </main>
    </div>
  )
}

function SimpleLineChart({ stats }) {
  const width = 760
  const height = 280
  const padding = 34

  const values = stats.results.map((result) => Number(result.result_value))
  const referenceValues = [Number(stats.test.minimum_value), Number(stats.test.safe_goal_value)].filter(Number.isFinite)
  const allValues = [...values, ...referenceValues]

  const minValue = Math.min(...allValues)
  const maxValue = Math.max(...allValues)
  const range = maxValue - minValue || 1

  const normalized = stats.results.map((result, index) => {
    const x =
      stats.results.length === 1
        ? width / 2
        : padding + (index / (stats.results.length - 1)) * (width - padding * 2)

    const y = height - padding - ((Number(result.result_value) - minValue) / range) * (height - padding * 2)

    return { x, y, result }
  })

  const points = normalized.map((point) => `${point.x},${point.y}`).join(' ')

  const minimumY =
    height - padding - ((Number(stats.test.minimum_value) - minValue) / range) * (height - padding * 2)

  const safeY =
    height - padding - ((Number(stats.test.safe_goal_value) - minValue) / range) * (height - padding * 2)

  return (
    <div className="simple-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de evolução">
        <line x1={padding} y1={minimumY} x2={width - padding} y2={minimumY} className="chart-line-minimum" />
        <line x1={padding} y1={safeY} x2={width - padding} y2={safeY} className="chart-line-safe" />

        <polyline points={points} className="chart-evolution-line" fill="none" />

        {normalized.map((point, index) => (
          <g key={`${point.result.result_date}-${index}`}>
            <circle cx={point.x} cy={point.y} r="6" className="chart-point" />
            <text x={point.x} y={point.y - 12} textAnchor="middle" className="chart-label">
              {formatValueForChart(point.result.result_value)}
            </text>
            <text x={point.x} y={height - 8} textAnchor="middle" className="chart-date-label">
              {formatShortDate(point.result.result_date)}
            </text>
          </g>
        ))}

        <text x={width - padding} y={minimumY - 6} textAnchor="end" className="chart-ref-label">
          mínimo
        </text>
        <text x={width - padding} y={safeY - 6} textAnchor="end" className="chart-ref-label safe">
          meta segura
        </text>
      </svg>

      <div className="chart-legend">
        <span><i className="legend evolution"></i>Evolução</span>
        <span><i className="legend minimum"></i>Mínimo</span>
        <span><i className="legend safe"></i>Meta segura</span>
      </div>
    </div>
  )
}

function calculatePercent(test, value) {
  const result = Number(value)
  const minimum = Number(test.minimum_value)

  if (!result || !minimum) return null

  if (test.calculation_type === 'lower_is_better') {
    return (minimum / result) * 100
  }

  return (result / minimum) * 100
}

function getStatus(test, value) {
  const result = Number(value)
  const minimum = Number(test.minimum_value)
  const safeGoal = Number(test.safe_goal_value)

  if (!result || !minimum || !safeGoal) return 'sem_resultado'

  if (test.calculation_type === 'lower_is_better') {
    if (result <= safeGoal) return 'atingiu_meta_segura'
    if (result <= minimum) return 'atingiu_minimo'

    const percent = (minimum / result) * 100
    if (percent < 70) return 'critico'
    if (percent < 90) return 'abaixo_do_minimo'
    return 'proximo_do_minimo'
  }

  if (result >= safeGoal) return 'atingiu_meta_segura'
  if (result >= minimum) return 'atingiu_minimo'

  const percent = (result / minimum) * 100
  if (percent < 70) return 'critico'
  if (percent < 90) return 'abaixo_do_minimo'
  return 'proximo_do_minimo'
}

function getBestResult(test, testResults) {
  if (!testResults.length) return null

  return testResults.reduce((best, current) => {
    if (!best) return current

    if (test.calculation_type === 'lower_is_better') {
      return Number(current.result_value) < Number(best.result_value) ? current : best
    }

    return Number(current.result_value) > Number(best.result_value) ? current : best
  }, null)
}

function getProgressValue(test, firstValue, latestValue) {
  if (test.calculation_type === 'lower_is_better') {
    return Number(firstValue) - Number(latestValue)
  }

  return Number(latestValue) - Number(firstValue)
}

function formatProgress(test, progress) {
  if (progress === 0) return 'Sem mudança'

  const sign = progress > 0 ? '+' : ''
  const label = test.calculation_type === 'lower_is_better'
    ? `${sign}${formatTimeValue(progress)}`
    : `${sign}${formatDecimal(progress)} ${test.unit || ''}`

  return label.trim()
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

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Number(Number(value).toFixed(2))).replace('.', ',')
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

function formatShortDate(value) {
  if (!value) return ''
  const text = String(value)

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [, month, day] = text.slice(0, 10).split('-')
    return `${day}/${month}`
  }

  return text
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

function formatValueForChart(value) {
  if (Number(value) >= 1000) return formatDecimal(value)
  return formatDecimal(value)
}