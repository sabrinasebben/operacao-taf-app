import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function Historico({ profile }) {
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [activeExam, setActiveExam] = useState(null)
  const [examTests, setExamTests] = useState([])
  const [results, setResults] = useState([])
  const [selectedTestId, setSelectedTestId] = useState('all')
  const [deletingId, setDeletingId] = useState(null)

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
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleDeleteResult(result) {
    const testName = getTestName(result.exam_test_id, examTests)
    const confirmed = window.confirm(
      `Deseja apagar este registro?\n\n${testName}\nData: ${formatDate(result.result_date)}\nResultado: ${result.result_value}`
    )

    if (!confirmed) return

    setDeletingId(result.id)
    setMessage('')

    const { error } = await supabase
      .from('test_results')
      .delete()
      .eq('id', result.id)
      .eq('user_id', profile.user_id)

    setDeletingId(null)

    if (error) {
      setMessage('Erro ao apagar registro.')
      return
    }

    setMessage('Registro apagado com sucesso.')
    await loadHistory()
  }

  async function handleDeleteResultGroup(group) {
    const confirmed = window.confirm(
      `Deseja apagar este teste completo?\n\nData: ${formatDate(group.date)}\nRegistros: ${group.items.length}\n\nTodas as provas salvas nessa data serão apagadas.`
    )

    if (!confirmed) return

    setDeletingId(group.date)
    setMessage('')

    const ids = group.items.map((item) => item.result.id).filter(Boolean)

    const { error } = await supabase
      .from('test_results')
      .delete()
      .in('id', ids)
      .eq('user_id', profile.user_id)

    setDeletingId(null)

    if (error) {
      setMessage('Erro ao apagar teste completo.')
      return
    }

    setMessage('Teste apagado com sucesso.')
    await loadHistory()
  }

  const testStats = useMemo(() => {
    return examTests.map((test) => {
      const testResults = results
        .filter((result) => result.exam_test_id === test.id)
        .sort((a, b) => {
          const dateA = new Date(a.result_date).getTime()
          const dateB = new Date(b.result_date).getTime()
          if (dateA !== dateB) return dateA - dateB
          return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        })

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

  const selectedStats =
    selectedTestId === 'all'
      ? null
      : testStats.find((item) => item.test.id === selectedTestId) || null

  const generalEvaluation = useMemo(() => buildGeneralEvaluation(testStats), [testStats])

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

  const allResultsWithTest = useMemo(() => {
    return results
      .map((result) => {
        const test = examTests.find((item) => item.id === result.exam_test_id)
        return { result, test }
      })
      .filter((item) => item.test)
      .sort((a, b) => {
        const dateDiff = new Date(b.result.result_date).getTime() - new Date(a.result.result_date).getTime()
        if (dateDiff !== 0) return dateDiff
        return new Date(b.result.created_at || 0).getTime() - new Date(a.result.created_at || 0).getTime()
      })
  }, [results, examTests])

  const generalRows = useMemo(() => {
    return buildGeneralTimelineRows(allResultsWithTest, examTests)
  }, [allResultsWithTest, examTests])

  const generalProgressTimeline = useMemo(() => {
    return buildGeneralProgressTimeline(generalRows)
  }, [generalRows])

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
            <Link to="/area-do-aluno">Dashboard</Link>
            <Link to="/configurar-edital">Configurar Edital</Link>
            <Link to="/calculadora-premium">Calculadora</Link>
            <Link to="/perfil">Perfil</Link>
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
            <Link className="btn btn-green" to="/configurar-edital">
              Configurar edital
            </Link>
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
          <Link to="/area-do-aluno">Dashboard</Link>
          <Link to="/configurar-edital">Configurar Edital</Link>
          <Link to="/calculadora-premium">Calculadora</Link>
          <Link to="/historico">Histórico</Link>
          <Link to="/perfil">Perfil</Link>
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
            <span className="label-with-help">Meta segura <span className="help-icon" title="Meta segura é uma marca acima do mínimo do edital para criar margem de aprovação.">?</span></span>
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
              <div className="kicker">Avaliação</div>
              <h2>Escolha a visualização</h2>
              <p className="muted">
                Veja todas as provas juntas ou selecione uma prova específica para analisar a linha de evolução detalhada.
              </p>
            </div>

            <Link className="btn btn-green" to="/calculadora-premium">
              Registrar novo teste
            </Link>
          </div>

          <div className="history-test-tabs advanced-tabs">
            <button
              type="button"
              className={`history-test-tab all-tests-tab ${selectedTestId === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedTestId('all')}
            >
              <strong>Avaliação geral</strong>
              <span className={`taf-status-pill status-${generalEvaluation.status}`}>
                {generalEvaluation.label}
              </span>
            </button>

            {testStats.map((item) => (
              <button
                type="button"
                key={item.test.id}
                className={`history-test-tab ${selectedTestId === item.test.id ? 'active' : ''}`}
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

        {selectedTestId === 'all' ? (
          <>
            <section className="profile-grid selected-test-grid">
              <div className="info-card">
                <span>Avaliação geral</span>
                <strong>{generalEvaluation.label}</strong>
              </div>

              <div className="info-card">
                <span>Menor margem</span>
                <strong>{generalEvaluation.attentionTest || '—'}</strong>
              </div>

              <div className="info-card">
                <span>Média dos mínimos</span>
                <strong>{generalEvaluation.averagePercent !== null ? `${formatDecimal(generalEvaluation.averagePercent)}%` : '—'}</strong>
              </div>

              <div className="info-card">
                <span>Provas críticas</span>
                <strong>{generalEvaluation.criticalCount}</strong>
              </div>

              <div className="info-card">
                <span className="label-with-help">Meta segura <span className="help-icon" title="Meta segura é uma marca acima do mínimo do edital para criar margem de aprovação.">?</span></span>
                <strong>{testsAtSafeGoal}/{examTests.length}</strong>
              </div>

              <div className="info-card">
                <span>Último teste</span>
                <strong>{latestDate ? formatDate(latestDate) : '—'}</strong>
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Gráfico geral</div>
                  <h2>Evolução até o mínimo</h2>
                  <p className="muted">
                    Média de desempenho dos testes por data. A linha vermelha mostra o nível mínimo que precisa ser atingido: 100%.
                  </p>
                </div>
              </div>

              {generalProgressTimeline.length >= 2 ? (
                <GeneralProgressChart rows={generalProgressTimeline} />
              ) : (
                <div className="empty-state">
                  <h3>Ainda não há dados suficientes para gráfico geral.</h3>
                  <p>Registre pelo menos dois dias de teste para visualizar a evolução geral.</p>
                  <Link className="btn btn-green" to="/calculadora-premium">
                    Registrar novo teste
                  </Link>
                </div>
              )}
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Todas as provas</div>
                  <h2>Avaliação conjunta</h2>
                  <p className="muted">
                    Leitura geral do desempenho em todas as provas do edital. Aqui o foco é identificar o que ameaça a aprovação e o que já está seguro.
                  </p>
                </div>
              </div>

              <div className="all-tests-evaluation-grid">
                {testStats.map((item) => (
                  <div className={`all-test-eval-card status-border-${item.status}`} key={item.test.id}>
                    <div>
                      <span>{item.test.test_name}</span>
                      <strong>{item.latestPercent !== null ? `${formatDecimal(item.latestPercent)}%` : '—'}</strong>
                      <small>{formatStatus(item.status)}</small>
                    </div>

                    <div className="all-test-eval-meta">
                      <p><b>Último:</b> {item.latest ? formatValueByUnit(item.latest.result_value, item.test.unit, item.test.calculation_type) : 'Sem resultado'}</p>
                      <p><b>Melhor:</b> {item.best ? formatValueByUnit(item.best.result_value, item.test.unit, item.test.calculation_type) : '—'}</p>
                      <p><b>Evolução:</b> {item.progress !== null ? formatProgress(item.test, item.progress) : '—'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Todos os registros</div>
                  <h2>Linha do tempo geral</h2>
                  <p className="muted">
                    Todos os resultados salvos, com opção de apagar registros duplicados ou lançados por engano.
                  </p>
                </div>
              </div>

              <GeneralResultsTable
                rows={generalRows}
                deletingId={deletingId}
                onDeleteGroup={handleDeleteResultGroup}
              />
            </section>
          </>
        ) : selectedStats ? (
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
                  <Link className="btn btn-green" to="/calculadora-premium">
                    Registrar novo resultado
                  </Link>
                </div>
              )}
            </section>

            <section className="premium-panel">
              <div className="panel-head">
                <div>
                  <div className="kicker">Linha do tempo</div>
                  <h2>Registros da prova</h2>
                  <p className="muted">
                    Use o botão apagar para remover lançamentos duplicados ou feitos por engano.
                  </p>
                </div>
              </div>

              <ResultsTable
                rows={selectedStats.results
                  .slice()
                  .reverse()
                  .map((result) => ({ result, test: selectedStats.test }))}
                deletingId={deletingId}
                onDelete={handleDeleteResult}
              />
            </section>
          </>
        ) : (
          <section className="premium-panel">
            <div className="empty-state">
              <h3>Nenhuma prova configurada.</h3>
              <p>Volte para Configurar Edital e selecione as provas cobradas no concurso.</p>
              <Link className="btn btn-green" to="/configurar-edital">
                Configurar edital
              </Link>
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

function GeneralResultsTable({ rows, deletingId, onDeleteGroup }) {
  return (
    <div className="premium-tests-table-wrap">
      <table className="premium-tests-table general-results-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Teste registrado</th>
            <th>Avaliação geral</th>
            <th>Observações</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map((group) => (
              <tr key={group.date}>
                <td>
                  <strong>{formatDate(group.date)}</strong>
                  <small>{group.items.length} prova(s)</small>
                </td>

                <td>
                  <div className="general-test-stack">
                    {group.items.map(({ result, test }) => {
                      const percent = calculatePercent(test, result.result_value)
                      const status = getStatus(test, result.result_value)

                      return (
                        <div className="general-test-line" key={result.id}>
                          <div>
                            <strong>{test.test_name}</strong>
                            <small>{formatValueByUnit(result.result_value, test.unit, test.calculation_type)} · {percent !== null ? `${formatDecimal(percent)}%` : '—'}</small>
                          </div>

                          <span className={`taf-status-pill status-${status}`}>
                            {formatStatus(status)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </td>

                <td>
                  <span className={`taf-status-pill status-${group.status}`}>
                    {group.label}
                  </span>
                  <small>{group.summary}</small>
                </td>

                <td>
                  {group.notes.length ? (
                    <div className="general-notes">
                      {group.notes.map((note, index) => (
                        <small key={`${note}-${index}`}>{note}</small>
                      ))}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>

                <td>
                  <button
                    type="button"
                    className="delete-result-btn"
                    onClick={() => onDeleteGroup(group)}
                    disabled={deletingId === group.date}
                  >
                    {deletingId === group.date ? 'Apagando...' : 'Apagar teste'}
                  </button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5">Nenhum teste registrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function ResultsTable({ rows, deletingId, onDelete }) {
  return (
    <div className="premium-tests-table-wrap">
      <table className="premium-tests-table">
        <thead>
          <tr>
            <th>Data</th>
            <th>Prova</th>
            <th>Resultado</th>
            <th>% mínimo</th>
            <th>Status</th>
            <th>Observações</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {rows.length ? (
            rows.map(({ result, test }) => {
              const percent = calculatePercent(test, result.result_value)
              const status = getStatus(test, result.result_value)

              return (
                <tr key={result.id || `${result.result_date}-${result.result_value}-${test.id}`}>
                  <td>{formatDate(result.result_date)}</td>
                  <td><strong>{test.test_name}</strong></td>
                  <td>{formatValueByUnit(result.result_value, test.unit, test.calculation_type)}</td>
                  <td>{percent !== null ? `${formatDecimal(percent)}%` : '—'}</td>
                  <td>
                    <span className={`taf-status-pill status-${status}`}>
                      {formatStatus(status)}
                    </span>
                  </td>
                  <td>{result.notes || '—'}</td>
                  <td>
                    <button
                      type="button"
                      className="delete-result-btn"
                      onClick={() => onDelete(result)}
                      disabled={deletingId === result.id}
                    >
                      {deletingId === result.id ? 'Apagando...' : 'Apagar'}
                    </button>
                  </td>
                </tr>
              )
            })
          ) : (
            <tr>
              <td colSpan="7">Nenhum resultado registrado.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function GeneralProgressChart({ rows }) {
  const width = 900
  const height = 300
  const padding = 54
  const target = 100
  const values = rows.map((row) => row.average).filter((value) => Number.isFinite(value))
  const minValue = Math.min(70, target, ...values)
  const maxValue = Math.max(120, target, ...values)
  const range = Math.max(1, maxValue - minValue)

  const points = rows.map((row, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(rows.length - 1, 1)
    const y = height - padding - ((row.average - minValue) / range) * (height - padding * 2)
    return { ...row, x, y }
  })

  const targetY = height - padding - ((target - minValue) / range) * (height - padding * 2)
  const polylinePoints = points.map((point) => `${point.x},${point.y}`).join(' ')

  return (
    <div className="general-progress-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Gráfico de evolução geral">
        <line x1={padding} y1={targetY} x2={width - padding} y2={targetY} className="general-target-line" />
        <polyline points={polylinePoints} className="general-progress-line" fill="none" />

        {points.map((point) => (
          <g key={point.date}>
            <circle cx={point.x} cy={point.y} r="7" className="general-progress-point" />
            <text x={point.x} y={point.y - 14} textAnchor="middle" className="chart-label">
              {formatDecimal(point.average)}%
            </text>
            <text x={point.x} y={height - 14} textAnchor="middle" className="chart-date-label">
              {formatShortDate(point.date)}
            </text>
          </g>
        ))}

        <text x={width - padding} y={targetY - 8} textAnchor="end" className="chart-ref-label">
          Mínimo 100%
        </text>
      </svg>

      <div className="chart-legend">
        <span><i className="legend evolution"></i>Evolução média</span>
        <span><i className="legend minimum"></i>Nível a atingir</span>
      </div>
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

function buildGeneralProgressTimeline(generalRows) {
  return generalRows
    .slice()
    .reverse()
    .map((row) => {
      const percents = row.items
        .map(({ result, test }) => calculatePercent(test, result.result_value))
        .filter((value) => value !== null && Number.isFinite(Number(value)))

      const average = percents.length
        ? percents.reduce((sum, value) => sum + Number(value), 0) / percents.length
        : null

      return {
        date: row.date,
        average,
        testsCount: row.items.length,
      }
    })
    .filter((row) => row.average !== null)
}

function buildGeneralTimelineRows(items, examTests) {
  const groups = new Map()

  items.forEach((item) => {
    const date = item.result.result_date

    if (!groups.has(date)) {
      groups.set(date, [])
    }

    groups.get(date).push(item)
  })

  return Array.from(groups.entries())
    .map(([date, groupItems]) => {
      const sortedItems = groupItems
        .slice()
        .sort((a, b) => String(a.test.test_name).localeCompare(String(b.test.test_name)))

      const statuses = sortedItems.map(({ result, test }) => getStatus(test, result.result_value))
      const safeCount = statuses.filter((status) => status === 'atingiu_meta_segura').length
      const minimumCount = statuses.filter((status) => status === 'atingiu_minimo').length
      const criticalCount = statuses.filter((status) =>
        ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(status)
      ).length

      let status = 'sem_resultado'
      let label = 'Parcial'
      let summary = `${sortedItems.length}/${examTests.length} prova(s) registradas.`

      if (criticalCount > 0) {
        status = 'critico'
        label = 'Atenção'
        summary = `${criticalCount} prova(s) abaixo ou sem margem.`
      } else if (safeCount === sortedItems.length && sortedItems.length === examTests.length) {
        status = 'atingiu_meta_segura'
        label = 'Teste completo seguro'
        summary = 'Todas as provas do edital ficaram na meta segura.'
      } else if (safeCount + minimumCount === sortedItems.length) {
        status = 'atingiu_minimo'
        label = 'Mínimo atingido'
        summary = 'Todas as provas registradas atingiram pelo menos o mínimo.'
      }

      const notes = sortedItems
        .map((item) => item.result.notes)
        .filter(Boolean)

      return {
        date,
        items: sortedItems,
        status,
        label,
        summary,
        notes,
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

function buildGeneralEvaluation(testStats) {
  const withResults = testStats.filter((item) => item.latestPercent !== null)
  const criticalCount = testStats.filter((item) =>
    ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(item.status)
  ).length

  const safeCount = testStats.filter((item) => item.status === 'atingiu_meta_segura').length

  const averagePercent = withResults.length
    ? withResults.reduce((sum, item) => sum + Number(item.latestPercent), 0) / withResults.length
    : null

  const attention = withResults
    .slice()
    .sort((a, b) => Number(a.latestPercent) - Number(b.latestPercent))[0]

  if (!withResults.length) {
    return {
      status: 'sem_resultado',
      label: 'Sem resultado',
      averagePercent,
      criticalCount,
      attentionTest: '—',
    }
  }

  if (criticalCount > 0) {
    return {
      status: 'critico',
      label: 'Atenção',
      averagePercent,
      criticalCount,
      attentionTest: attention?.test.test_name || '—',
    }
  }

  if (safeCount === testStats.length) {
    return {
      status: 'atingiu_meta_segura',
      label: 'Meta segura',
      averagePercent,
      criticalCount,
      attentionTest: attention?.test.test_name || '—',
    }
  }

  return {
    status: 'atingiu_minimo',
    label: 'Aprovado parcial',
    averagePercent,
    criticalCount,
    attentionTest: attention?.test.test_name || '—',
  }
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

function formatShortDate(value) {
  if (!value) return '—'
  const text = String(value)

  if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
    const [, month, day] = text.slice(0, 10).split('-')
    return `${day}/${month}`
  }

  return text
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

function getTestName(testId, tests) {
  return tests.find((test) => test.id === testId)?.test_name || 'Prova'
}