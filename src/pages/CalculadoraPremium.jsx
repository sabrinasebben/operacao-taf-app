import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CalculadoraPremium({ profile }) {
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingResults, setSavingResults] = useState(false)
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState(null)
  const [activeExam, setActiveExam] = useState(null)
  const [diagnostics, setDiagnostics] = useState([])

  const [birthDate, setBirthDate] = useState(profile?.birth_date || '')
  const [weight, setWeight] = useState(profile?.weight || '')
  const [height, setHeight] = useState(profile?.height || '')
  const [sex, setSex] = useState(profile?.sex || 'Masculino')

  const [resultValues, setResultValues] = useState({})
  const [resultDate, setResultDate] = useState(today())
  const [resultNotes, setResultNotes] = useState('')

  useEffect(() => {
    loadPremiumData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  async function loadPremiumData() {
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
      setMessage('Erro ao carregar o edital ativo.')
      setLoading(false)
      return
    }

    if (!examData) {
      setActiveExam(null)
      setSummary(null)
      setDiagnostics([])
      setLoading(false)
      return
    }

    setActiveExam(examData)

    const { data: summaryData, error: summaryError } = await supabase
      .from('v_taf_summary')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .limit(1)
      .maybeSingle()

    if (summaryError) {
      setMessage('Erro ao carregar o resumo premium.')
      setLoading(false)
      return
    }

    const finalSummary = summaryData || {
      student_exam_id: examData.id,
      exam_name: examData.exam_name,
      institution: examData.institution,
      taf_date: examData.taf_date,
      taf_level: 'sem_resultado',
      weakest_test: null,
      strongest_test: null,
    }

    setSummary(finalSummary)

    const { data: diagnosticData, error: diagnosticError } = await supabase
      .from('v_taf_diagnostic')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('student_exam_id', examData.id)
      .order('percent_minimum', { ascending: true, nullsFirst: false })

    if (diagnosticError) {
      setMessage('Erro ao carregar diagnóstico por prova.')
      setLoading(false)
      return
    }

    setDiagnostics(diagnosticData || [])

    const mappedResults = {}
    ;(diagnosticData || []).forEach((item) => {
      mappedResults[item.exam_test_id] = item.latest_result_value
        ? String(item.latest_result_value).replace('.', ',')
        : ''
    })

    setResultValues(mappedResults)
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleSaveProfile(event) {
    event.preventDefault()
    setSavingProfile(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        birth_date: birthDate || null,
        weight: parseNumber(weight) || null,
        height: parseNumber(height) || null,
        sex,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.user_id)

    setSavingProfile(false)

    if (error) {
      setMessage('Erro ao salvar dados físicos. Verifique se as colunas birth_date, weight e height existem na tabela profiles.')
      return
    }

    setMessage('Dados físicos atualizados.')
  }

  async function handleSaveResults(event) {
    event.preventDefault()
    setSavingResults(true)
    setMessage('')

    if (!summary?.student_exam_id) {
      setMessage('Configure seu edital antes de registrar resultados.')
      setSavingResults(false)
      return
    }

    if (!resultDate) {
      setMessage('Informe a data do teste.')
      setSavingResults(false)
      return
    }

    const rowsToInsert = diagnostics
      .map((test) => {
        const rawValue = resultValues[test.exam_test_id]
        const parsedValue = parseResultValue(rawValue)

        if (!parsedValue || parsedValue <= 0) return null

        return {
          user_id: profile.user_id,
          student_exam_id: summary.student_exam_id,
          exam_test_id: test.exam_test_id,
          result_value: parsedValue,
          result_date: resultDate,
          notes: resultNotes.trim() || null,
        }
      })
      .filter(Boolean)

    if (rowsToInsert.length === 0) {
      setMessage('Preencha pelo menos um resultado válido.')
      setSavingResults(false)
      return
    }

    const { error } = await supabase.from('test_results').insert(rowsToInsert)

    if (error) {
      setMessage('Erro ao salvar resultados. Verifique os campos preenchidos.')
      setSavingResults(false)
      return
    }

    setMessage('Resultados salvos. Diagnóstico atualizado.')
    setResultNotes('')
    await loadPremiumData()
    setSavingResults(false)
  }

  const level = summary?.taf_level || 'sem_resultado'
  const levelLabel = formatLevel(level)
  const riskLabel = getRisk(level)
  const daysToTaf = getDaysToDate(activeExam?.taf_date || summary?.taf_date)
  const daysText = formatDaysToTaf(daysToTaf)
  const recommendation = getRecommendation(level, summary?.weakest_test)

  const criticalCount = diagnostics.filter((item) => item.taf_status === 'critico').length
  const belowMinimumCount = diagnostics.filter((item) =>
    ['critico', 'abaixo_do_minimo', 'proximo_do_minimo'].includes(item.taf_status)
  ).length
  const reachedMinimumCount = diagnostics.filter((item) =>
    ['atingiu_minimo', 'atingiu_meta_segura'].includes(item.taf_status)
  ).length
  const reachedSafeGoalCount = diagnostics.filter((item) => item.taf_status === 'atingiu_meta_segura').length

  const approvalDistance = useMemo(() => {
    const weakest = diagnostics
      .filter((item) => item.percent_minimum !== null && item.percent_minimum !== undefined)
      .sort((a, b) => Number(a.percent_minimum) - Number(b.percent_minimum))[0]

    if (!weakest) return { value: '—', label: 'Aguardando resultados' }

    if (Number(weakest.percent_minimum) >= 100) {
      return {
        value: 'Mínimo atingido',
        label: 'Todas as provas preenchidas atingiram o mínimo.',
      }
    }

    const gap =
      weakest.calculation_type === 'lower_is_better'
        ? Number(weakest.latest_result_value) - Number(weakest.minimum_value)
        : Number(weakest.minimum_value) - Number(weakest.latest_result_value)

    return {
      value:
        weakest.calculation_type === 'lower_is_better'
          ? `Faltam ${formatTimeValue(gap)}`
          : `Faltam ${formatDecimal(gap)} ${weakest.unit}`,
      label: `${weakest.test_name} é a prova que mais ameaça sua aprovação.`,
    }
  }, [diagnostics])

  if (loading) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Calculadora Premium</div>
            <h1>Carregando diagnóstico...</h1>
            <p className="muted">Buscando seus dados no Supabase.</p>
          </div>
        </main>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="brand-row">
            <span className="brand-mark">◎</span>
            <div>
              <strong>OPERAÇÃO TAF</strong>
              <small>Calculadora Premium</small>
            </div>
          </div>

          <nav className="app-nav">
            <a href="/area-do-aluno">Dashboard</a>
            <a href="/configurar-edital">Configurar Edital</a>
            <button onClick={handleLogout}>Sair</button>
          </nav>
        </header>

        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Edital necessário</div>
            <h1>Configure seu edital primeiro</h1>
            <p className="muted">
              Para usar a Calculadora Premium, selecione as provas do seu concurso e informe os índices mínimos.
            </p>
            <a className="btn btn-green" href="/configurar-edital">
              Configurar meu edital
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
            <small>Calculadora Premium</small>
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
        <section className={`premium-result-panel level-${level}`}>
          <div className="premium-result-top">
            <div>
              <div className="kicker">Diagnóstico profissional</div>
              <h1>Calculadora Premium</h1>
              <p>
                Acompanhe seu desempenho real, sua margem de segurança e sua evolução até o dia do TAF.
              </p>
            </div>

            <div className="premium-risk-badge">
              <span>Risco no TAF</span>
              <strong>{riskLabel}</strong>
            </div>
          </div>

          <div className="premium-main-grid">
            <div className="premium-level-box">
              <span>Nível Operação TAF</span>
              <strong>{levelLabel}</strong>
              <small>{getLevelMessage(level)}</small>
            </div>

            <div className="premium-level-box danger">
              <span>Distância da aprovação</span>
              <strong>{approvalDistance.value}</strong>
              <small>{approvalDistance.label}</small>
            </div>

            <div className="premium-level-box">
              <span>Dias até o TAF</span>
              <strong>{daysText.value}</strong>
              <small>{daysText.label}</small>
            </div>
          </div>
        </section>

        <section className="profile-grid premium-metrics-grid">
          <div className="info-card">
            <span>Edital</span>
            <strong>{summary.exam_name || activeExam?.exam_name || '—'}</strong>
          </div>

          <div className="info-card">
            <span>Prova crítica</span>
            <strong>{summary.weakest_test || '—'}</strong>
          </div>

          <div className="info-card">
            <span>Melhor ponto</span>
            <strong>{summary.strongest_test || '—'}</strong>
          </div>

          <div className="info-card">
            <span>Provas críticas</span>
            <strong>{criticalCount}</strong>
          </div>

          <div className="info-card">
            <span>Abaixo ou sem margem</span>
            <strong>{belowMinimumCount}</strong>
          </div>

          <div className="info-card">
            <span>Meta segura</span>
            <strong>{reachedSafeGoalCount}/{diagnostics.length}</strong>
          </div>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Dados físicos</div>
              <h2>Perfil do aluno</h2>
              <p className="muted">
                Esses dados ajudam a personalizar a leitura da preparação e as próximas recomendações.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveProfile} className="student-data-grid">
            <label>
              Data de nascimento
              <input
                type="date"
                value={birthDate || ''}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>

            <label>
              Idade estimada
              <input value={birthDate ? `${calculateAge(birthDate)} anos` : '—'} disabled />
            </label>

            <label>
              Peso
              <input
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="Ex.: 82"
              />
            </label>

            <label>
              Altura
              <input
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                placeholder="Ex.: 1,78"
              />
            </label>

            <label>
              Sexo
              <select className="taf-select" value={sex} onChange={(event) => setSex(event.target.value)}>
                <option value="Masculino">Masculino</option>
                <option value="Feminino">Feminino</option>
                <option value="Não informar">Não informar</option>
              </select>
            </label>

            <div className="form-action-cell">
              <button className="btn btn-dark" type="submit" disabled={savingProfile}>
                {savingProfile ? 'Salvando...' : 'Salvar dados físicos'}
              </button>
            </div>
          </form>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Registrar teste</div>
              <h2>Resultados atuais</h2>
              <p className="muted">
                Preencha os resultados das provas realizadas. O sistema salva o histórico e recalcula o diagnóstico.
              </p>
            </div>
          </div>

          {message && <div className="form-message">{message}</div>}

          <form onSubmit={handleSaveResults}>
            <div className="result-date-grid">
              <label>
                Data do teste
                <input
                  type="date"
                  value={resultDate}
                  onChange={(event) => setResultDate(event.target.value)}
                />
              </label>

              <label>
                Observações do teste
                <input
                  value={resultNotes}
                  onChange={(event) => setResultNotes(event.target.value)}
                  placeholder="Ex.: teste feito em pista, senti queda no final."
                />
              </label>
            </div>

            <div className="premium-tests-table-wrap">
              <table className="premium-tests-table">
                <thead>
                  <tr>
                    <th>Prova</th>
                    <th>Mínimo</th>
                    <th>Meta segura</th>
                    <th>Último resultado</th>
                    <th>Novo resultado</th>
                    <th>% mínimo</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {diagnostics.map((test) => (
                    <tr key={test.exam_test_id}>
                      <td>
                        <strong>{test.test_name}</strong>
                        <small>{formatCalculationType(test.calculation_type)}</small>
                      </td>
                      <td>{formatValueByUnit(test.minimum_value, test.unit, test.calculation_type)}</td>
                      <td>{formatValueByUnit(test.safe_goal_value, test.unit, test.calculation_type)}</td>
                      <td>
                        {test.latest_result_value
                          ? formatValueByUnit(test.latest_result_value, test.unit, test.calculation_type)
                          : '—'}
                        {test.latest_result_date && <small>{formatDate(test.latest_result_date)}</small>}
                      </td>
                      <td>
                        <input
                          value={resultValues[test.exam_test_id] || ''}
                          onChange={(event) =>
                            setResultValues((current) => ({
                              ...current,
                              [test.exam_test_id]: event.target.value,
                            }))
                          }
                          placeholder={placeholderForTest(test)}
                        />
                      </td>
                      <td>{test.percent_minimum ? `${formatDecimal(test.percent_minimum)}%` : '—'}</td>
                      <td>
                        <span className={`taf-status-pill status-${test.taf_status || 'sem_resultado'}`}>
                          {formatStatus(test.taf_status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="save-footer">
              <a className="btn btn-dark" href="/area-do-aluno">
                Voltar
              </a>

              <button className="btn btn-green" type="submit" disabled={savingResults}>
                {savingResults ? 'Salvando resultados...' : 'Salvar resultados e atualizar diagnóstico'}
              </button>
            </div>
          </form>
        </section>

        <section className="premium-panel recommendation-card">
          <div className="kicker">Recomendação Operação TAF</div>
          <h2>{recommendation.title}</h2>
          <p>{recommendation.text}</p>

          <div className="recommendation-grid">
            <div>
              <span>Prioridade imediata</span>
              <strong>{summary.weakest_test || 'Configurar prova'}</strong>
            </div>

            <div>
              <span>Trilha sugerida</span>
              <strong>{recommendation.track}</strong>
            </div>

            <div>
              <span>Foco</span>
              <strong>{recommendation.focus}</strong>
            </div>
          </div>
        </section>

        <p className="disclaimer">
          O Operação TAF não promete aprovação automática. O resultado depende da dedicação, condição física, edital,
          execução correta, regularidade e evolução individual do aluno.
        </p>
      </main>
    </div>
  )
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0
  return Number(String(value).replace(',', '.'))
}

function parseResultValue(value) {
  if (!value) return 0
  const clean = String(value).trim().replace(',', '.')

  if (clean.includes(':')) {
    const parts = clean.split(':').map(Number)
    if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
      return parts[0] * 60 + parts[1]
    }
  }

  const number = Number(clean)
  return Number.isNaN(number) ? 0 : number
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Number(Number(value).toFixed(2))).replace('.', ',')
}

function formatDate(value) {
  if (!value) return ''
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

function parseLocalDate(dateValue) {
  if (!dateValue) return null

  if (dateValue instanceof Date) return dateValue

  const text = String(dateValue)

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/').map(Number)
    return new Date(year, month - 1, day, 12, 0, 0)
  }

  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function calculateAge(birthDate) {
  const birth = parseLocalDate(birthDate)
  if (!birth) return ''
  const todayDate = new Date()
  let age = todayDate.getFullYear() - birth.getFullYear()
  const monthDiff = todayDate.getMonth() - birth.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && todayDate.getDate() < birth.getDate())) age--
  return age
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
      label: 'Revise a data do TAF em Configurar Edital.',
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
    label: 'Use esse prazo para ajustar sua progressão.',
  }
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

  return labels[level] || level
}

function getRisk(level) {
  if (level === 'base' || level === 'arranque') return 'Alto'
  if (level === 'progressao') return 'Médio'
  if (level === 'performance' || level === 'blindagem') return 'Baixo'
  return 'Aguardando'
}

function getLevelMessage(level) {
  const messages = {
    base: 'Existe pelo menos uma prova em zona crítica. Prioridade total na construção de base.',
    arranque: 'Você já tem ponto de partida, mas ainda está abaixo do mínimo.',
    progressao: 'Você está próximo do índice, mas ainda precisa criar margem.',
    performance: 'Você já bate o mínimo. Agora o foco é segurança e consistência.',
    blindagem: 'Você está acima da meta segura. Foque em manutenção e prevenção de lesões.',
  }

  return messages[level] || 'Registre seus resultados para liberar o diagnóstico.'
}

function getRecommendation(level, weakestTest) {
  if (level === 'base') {
    return {
      title: 'Seu TAF está em zona crítica',
      text: `Sua prioridade deve ser construir base física e técnica antes de avançar para simulados intensos. ${weakestTest ? `A prova mais urgente agora é ${weakestTest}.` : ''}`,
      track: 'Trilha Base',
      focus: 'Base física e técnica',
    }
  }

  if (level === 'arranque') {
    return {
      title: 'Você ainda está abaixo do mínimo',
      text: `Você precisa de progressão estruturada e constância. ${weakestTest ? `Comece corrigindo ${weakestTest}.` : ''}`,
      track: 'Trilha Base / Arranque',
      focus: 'Progressão controlada',
    }
  }

  if (level === 'progressao') {
    return {
      title: 'Você está próximo, mas sem margem',
      text: 'O foco agora é transformar proximidade em segurança para não depender do desempenho perfeito no dia da prova.',
      track: 'Trilha Progressão',
      focus: 'Margem de segurança',
    }
  }

  if (level === 'performance') {
    return {
      title: 'Você já bate o mínimo',
      text: 'Agora é hora de consolidar desempenho, fazer simulados estratégicos e reduzir risco de queda no dia.',
      track: 'Trilha Performance',
      focus: 'Simulados e consistência',
    }
  }

  if (level === 'blindagem') {
    return {
      title: 'Você está acima da meta segura',
      text: 'Mantenha a regularidade, proteja-se contra lesões e faça simulações específicas do edital.',
      track: 'Blindagem',
      focus: 'Manutenção e recuperação',
    }
  }

  return {
    title: 'Registre seus resultados',
    text: 'Preencha seus resultados atuais para receber a recomendação premium.',
    track: 'A definir',
    focus: 'Diagnóstico',
  }
}

function formatCalculationType(type) {
  return type === 'lower_is_better' ? 'Menor tempo é melhor' : 'Maior resultado é melhor'
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

function placeholderForTest(test) {
  const name = String(test.test_name || '').toLowerCase()

  if (name.includes('12 minutos')) return 'Ex.: 2200'
  if (name.includes('2400') || name.includes('2000') || name.includes('1800')) return 'Ex.: 12:30'
  if (name.includes('barra')) return 'Ex.: 5'
  if (name.includes('isometria')) return 'Ex.: 30'
  if (name.includes('flexão')) return 'Ex.: 28'
  if (name.includes('abdominal')) return 'Ex.: 35'
  if (name.includes('shuttle')) return 'Ex.: 11.8'
  if (name.includes('natação')) return 'Ex.: 48'
  if (name.includes('50 m') || name.includes('100 m')) return 'Ex.: 14.5'
  if (name.includes('salto') || name.includes('impulsão')) return 'Ex.: 2.10'
  if (name.includes('carga')) return 'Ex.: 1:20'
  if (test.calculation_type === 'lower_is_better') return 'Ex.: 12.5'
  return 'Ex.: 10'
}