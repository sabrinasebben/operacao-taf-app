import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const HOTMART_COURSE_URL = import.meta.env.VITE_HOTMART_COURSE_URL || ''

const EDITAL_DRAFT_KEY_PREFIX = 'operacao_taf_edital_draft_'

export default function ConfigurarEdital({ profile }) {
  const navigate = useNavigate()
  const draftKey = `${EDITAL_DRAFT_KEY_PREFIX}${profile.user_id}`

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [masterTests, setMasterTests] = useState([])
  const [existingExamId, setExistingExamId] = useState(null)

  const [examName, setExamName] = useState(profile?.target_exam || '')
  const [institution, setInstitution] = useState('')
  const [tafDate, setTafDate] = useState('')
  const [sexReference, setSexReference] = useState(profile?.sex || 'Masculino')
  const [notes, setNotes] = useState('')

  const [selectedTests, setSelectedTests] = useState({})

  useEffect(() => {
    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  useEffect(() => {
    if (loading) return

    const draft = {
      examName,
      institution,
      tafDate,
      sexReference,
      notes,
      selectedTests,
      updatedAt: new Date().toISOString(),
    }

    localStorage.setItem(draftKey, JSON.stringify(draft))
  }, [loading, examName, institution, tafDate, sexReference, notes, selectedTests, draftKey])

  async function loadInitialData() {
    setLoading(true)
    setMessage('')

    const { data: testsData, error: testsError } = await supabase
      .from('taf_tests_master')
      .select('id, test_name, unit, calculation_type, category, active')
      .eq('active', true)
      .order('category', { ascending: true })
      .order('test_name', { ascending: true })

    if (testsError) {
      setMessage('Erro ao carregar provas do Operação TAF.')
      setLoading(false)
      return
    }

    setMasterTests(testsData || [])

    const { data: examData } = await supabase
      .from('student_exams')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (examData) {
      setExistingExamId(examData.id)
      setExamName(examData.exam_name || '')
      setInstitution(examData.institution || '')
      setTafDate(examData.taf_date || '')
      setSexReference(examData.sex_reference || 'Masculino')
      setNotes(examData.notes || '')

      const { data: existingTests } = await supabase
        .from('exam_tests')
        .select('*')
        .eq('student_exam_id', examData.id)

      const mapped = {}

      ;(existingTests || []).forEach((examTest) => {
        const master = (testsData || []).find((item) => item.test_name === examTest.test_name)

        mapped[master?.id || examTest.test_name] = {
          selected: true,
          test_name: examTest.test_name,
          unit: examTest.unit,
          calculation_type: examTest.calculation_type,
          category: master?.category || 'Personalizado',
          minimum_value: String(examTest.minimum_value ?? ''),
          safe_goal_value: String(examTest.safe_goal_value ?? ''),
        }
      })

      setSelectedTests(mapped)
      restoreDraft()
    } else {
      restoreDraft()
    }

    setLoading(false)
  }

  function restoreDraft() {
    try {
      const raw = localStorage.getItem(draftKey)
      if (!raw) return

      const draft = JSON.parse(raw)

      setExamName(draft.examName || profile?.target_exam || '')
      setInstitution(draft.institution || '')
      setTafDate(draft.tafDate || '')
      setSexReference(draft.sexReference || profile?.sex || 'Masculino')
      setNotes(draft.notes || '')
      setSelectedTests(draft.selectedTests || {})
    } catch (error) {
      localStorage.removeItem(draftKey)
    }
  }

  const groupedTests = useMemo(() => {
    return masterTests.reduce((groups, test) => {
      const category = test.category || 'Outras'
      if (!groups[category]) groups[category] = []
      groups[category].push(test)
      return groups
    }, {})
  }, [masterTests])

  function toggleTest(test) {
    setSelectedTests((current) => {
      const alreadySelected = current[test.id]?.selected === true

      if (alreadySelected) {
        const copy = { ...current }
        delete copy[test.id]
        return copy
      }

      return {
        ...current,
        [test.id]: {
          selected: true,
          test_name: test.test_name,
          unit: test.unit,
          calculation_type: test.calculation_type,
          category: test.category,
          minimum_value: '',
          safe_goal_value: '',
        },
      }
    })
  }

  function updateSelectedField(testId, field, value) {
    setSelectedTests((current) => {
      const item = current[testId]
      if (!item) return current

      let nextItem = { ...item, [field]: value }

      if (field === 'minimum_value') {
        const numericValue = parseNumber(value)

        if (numericValue > 0) {
          const suggested = suggestSafeGoal(item, numericValue)
          const previousMinimum = parseNumber(item.minimum_value)
          const previousSuggestion = previousMinimum > 0 ? suggestSafeGoal(item, previousMinimum) : ''

          const shouldReplaceSafeGoal =
            !item.safe_goal_value ||
            parseNumber(item.safe_goal_value) === parseNumber(previousSuggestion) ||
            parseNumber(item.safe_goal_value) === previousMinimum

          if (shouldReplaceSafeGoal) {
            nextItem.safe_goal_value = suggested
          }
        }
      }

      return { ...current, [testId]: nextItem }
    })
  }

  function applySafeGoalsToSelected() {
    setSelectedTests((current) => {
      const updated = {}

      Object.entries(current).forEach(([testId, item]) => {
        const minimum = parseNumber(item.minimum_value)

        updated[testId] = {
          ...item,
          safe_goal_value: minimum > 0 ? suggestSafeGoal(item, minimum) : item.safe_goal_value,
        }
      })

      return updated
    })

    setMessage('Metas seguras sugeridas automaticamente. Revise antes de salvar.')
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const selectedList = Object.values(selectedTests).filter((item) => item.selected)

    if (!examName.trim()) {
      setMessage('Informe o nome do cargo ou função.')
      setSaving(false)
      return
    }

    if (selectedList.length === 0) {
      setMessage('Selecione pelo menos uma prova do edital.')
      setSaving(false)
      return
    }

    const invalidTest = selectedList.find((item) => {
      const minimum = Number(String(item.minimum_value).replace(',', '.'))
      const safeGoal = Number(String(item.safe_goal_value).replace(',', '.'))
      return !minimum || minimum <= 0 || !safeGoal || safeGoal <= 0
    })

    if (invalidTest) {
      setMessage(`Preencha índice mínimo e meta segura para: ${invalidTest.test_name}`)
      setSaving(false)
      return
    }

    let studentExamId = existingExamId

    if (studentExamId) {
      const { error: updateExamError } = await supabase
        .from('student_exams')
        .update({
          exam_name: examName.trim(),
          institution: institution.trim(),
          taf_date: tafDate || null,
          sex_reference: sexReference,
          notes: notes.trim(),
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', studentExamId)
        .eq('user_id', profile.user_id)

      if (updateExamError) {
        setMessage('Erro ao atualizar edital.')
        setSaving(false)
        return
      }
    } else {
      const { data: createdExam, error: insertExamError } = await supabase
        .from('student_exams')
        .insert({
          user_id: profile.user_id,
          exam_name: examName.trim(),
          institution: institution.trim(),
          taf_date: tafDate || null,
          sex_reference: sexReference,
          notes: notes.trim(),
          is_active: true,
        })
        .select('id')
        .single()

      if (insertExamError || !createdExam) {
        setMessage('Erro ao criar edital.')
        setSaving(false)
        return
      }

      studentExamId = createdExam.id
      setExistingExamId(studentExamId)
    }

    const { data: existingExamTests } = await supabase
      .from('exam_tests')
      .select('*')
      .eq('student_exam_id', studentExamId)

    const existingByName = new Map((existingExamTests || []).map((item) => [item.test_name, item]))

    for (const selected of selectedList) {
      const payload = {
        student_exam_id: studentExamId,
        test_name: selected.test_name,
        unit: selected.unit,
        calculation_type: selected.calculation_type,
        minimum_value: Number(String(selected.minimum_value).replace(',', '.')),
        safe_goal_value: Number(String(selected.safe_goal_value).replace(',', '.')),
        is_required: true,
        updated_at: new Date().toISOString(),
      }

      const existing = existingByName.get(selected.test_name)

      if (existing) {
        const { error } = await supabase.from('exam_tests').update(payload).eq('id', existing.id)

        if (error) {
          setMessage(`Erro ao atualizar prova: ${selected.test_name}`)
          setSaving(false)
          return
        }
      } else {
        const { error } = await supabase.from('exam_tests').insert(payload)

        if (error) {
          setMessage(`Erro ao adicionar prova: ${selected.test_name}`)
          setSaving(false)
          return
        }
      }
    }

    const selectedNames = selectedList.map((item) => item.test_name)
    const testsToRemove = (existingExamTests || []).filter(
      (item) => !selectedNames.includes(item.test_name)
    )

    for (const removed of testsToRemove) {
      const { error } = await supabase.from('exam_tests').delete().eq('id', removed.id)

      if (error) {
        setMessage(`Erro ao remover prova: ${removed.test_name}`)
        setSaving(false)
        return
      }
    }

    await supabase
      .from('profiles')
      .update({
        target_exam: examName.trim(),
        sex: sexReference,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.user_id)

    localStorage.removeItem(draftKey)
    setSaving(false)
    navigate('/area-do-aluno')
  }

  function handleClearDraft() {
    localStorage.removeItem(draftKey)
    setExamName(profile?.target_exam || '')
    setInstitution('')
    setTafDate('')
    setSexReference(profile?.sex || 'Masculino')
    setNotes('')
    setSelectedTests({})
    setMessage('Rascunho limpo.')
    loadInitialData()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className="app-shell">
        <main className="dashboard">
          <div className="premium-panel">
            <div className="kicker">Configurar edital</div>
            <h1>Carregando provas...</h1>
            <p className="muted">Buscando a biblioteca de provas do Operação TAF.</p>
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
            <small>Configurar edital</small>
          </div>
        </div>

        <nav className="app-nav">
          <Link to="/area-do-aluno">Dashboard</Link>
          <Link to="/configurar-edital">Configurar Edital</Link>
          <Link to="/calculadora-premium">Calculadora</Link>
          <Link to="/historico">Histórico</Link>
          {HOTMART_COURSE_URL ? (
            <a className="hotmart-nav-link" href={HOTMART_COURSE_URL} target="_blank" rel="noreferrer">Hotmart</a>
          ) : (
            <Link className="hotmart-nav-link" to="/perfil">Hotmart</Link>
          )}
          <button onClick={handleLogout}>Sair</button>
        </nav>
      </header>

      <main className="dashboard">
        <form onSubmit={handleSave}>
          <section className="welcome-card">
            <div>
              <div className="kicker">Etapa obrigatória</div>
              <h1>Configure seu edital</h1>
              <p>
                Selecione as provas cobradas no edital, informe o índice mínimo e defina uma meta segura.
              </p>
            </div>

            <div className="status-badge">Área Premium</div>
          </section>

          <section className="premium-panel">
            <div className="panel-head">
              <div>
                <div className="kicker">Dados do edital</div>
                <h2>Informações do edital</h2>
              </div>
            </div>

            <div className="exam-form-grid">
              <label>
                Nome do cargo
                <input
                  value={examName}
                  onChange={(event) => setExamName(event.target.value)}
                  placeholder="Ex.: Soldado BM, Inspetor, Bombeiro Militar"
                />
              </label>

              <label>
                Instituição
                <input
                  value={institution}
                  onChange={(event) => setInstitution(event.target.value)}
                  placeholder="Ex.: Brigada Militar"
                />
              </label>

              <label>
                Data prevista do TAF
                <input
                  type="date"
                  value={tafDate || ''}
                  onChange={(event) => setTafDate(event.target.value)}
                />
              </label>

              <label>
                Sexo de referência
                <select
                  className="taf-select"
                  value={sexReference}
                  onChange={(event) => setSexReference(event.target.value)}
                >
                  <option value="Masculino">Masculino</option>
                  <option value="Feminino">Feminino</option>
                  <option value="Não informar">Não informar</option>
                </select>
              </label>
            </div>

            <label className="notes-field">
              Observações do edital
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex.: edital exige corrida 12 min, barra fixa, flexão e abdominal."
              />
            </label>
          </section>

          <section className="premium-panel">
            <div className="panel-head">
              <div>
                <div className="kicker">Provas do edital</div>
                <h2>Selecione e preencha os índices</h2>
              </div>

              <div className="panel-actions">
                <button className="btn btn-dark" type="button" onClick={applySafeGoalsToSelected}>
                  Sugerir metas
                </button>

                <button className="btn btn-green" type="submit" disabled={saving}>
                  {saving ? 'Salvando...' : 'Salvar edital'}
                </button>
              </div>
            </div>

            {message && <div className="form-message">{message}</div>}

            <div className="tests-config-list">
              {Object.entries(groupedTests).map(([category, tests]) => (
                <div className="test-category-block" key={category}>
                  <h3>{category}</h3>

                  <div className="test-config-grid">
                    {tests.map((test) => {
                      const selected = selectedTests[test.id]
                      const isSelected = selected?.selected === true

                      return (
                        <div className={`test-config-card ${isSelected ? 'selected' : ''}`} key={test.id}>
                          <button type="button" className="test-toggle" onClick={() => toggleTest(test)}>
                            <span>{isSelected ? '✓' : '+'}</span>
                            <strong>{test.test_name}</strong>
                          </button>

                          <div className="test-meta">
                            <small>{test.unit}</small>
                            <small>
                              {test.calculation_type === 'higher_is_better'
                                ? 'Maior é melhor'
                                : 'Menor é melhor'}
                            </small>
                          </div>

                          {isSelected && (
                            <div className="test-values-grid">
                              <label>
                                Índice mínimo
                                <input
                                  value={selected.minimum_value}
                                  onChange={(event) =>
                                    updateSelectedField(test.id, 'minimum_value', event.target.value)
                                  }
                                  placeholder={minimumPlaceholderForTest(selected)}
                                />
                              </label>

                              <label>
                                <span className="label-with-help">
                                  Meta segura
                                  <span className="help-tooltip" tabIndex="0">
                                    <span className="help-icon">?</span>
                                    <span className="help-bubble">
                                      Meta segura é uma marca acima do índice mínimo do edital. Ela cria margem para o dia da prova, considerando cansaço, nervosismo, clima, execução e pequenas variações de desempenho.
                                    </span>
                                  </span>
                                </span>
                                <input
                                  value={selected.safe_goal_value}
                                  onChange={(event) =>
                                    updateSelectedField(test.id, 'safe_goal_value', event.target.value)
                                  }
                                  placeholder={safeGoalPlaceholderForTest(selected)}
                                />
                              </label>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>

            <div className="save-footer">
              <Link className="btn btn-dark" to="/area-do-aluno">
                Cancelar
              </Link>

              <button className="btn btn-green" type="submit" disabled={saving}>
                {saving ? 'Salvando edital...' : 'Salvar edital e liberar diagnóstico'}
              </button>
            </div>
          </section>
        </form>
      </main>
    </div>
  )
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return ''
  return String(Number(value.toFixed(2))).replace('.', ',')
}

function parseNumber(value) {
  if (value === null || value === undefined) return 0
  const number = Number(String(value).replace(',', '.'))
  return Number.isNaN(number) ? 0 : number
}

function suggestSafeGoal(test, minimumValue) {
  const name = String(test?.test_name || '').toLowerCase()
  const unit = String(test?.unit || '').toLowerCase()
  const calculationType = test?.calculation_type

  if (!minimumValue || minimumValue <= 0) return ''

  if (calculationType === 'lower_is_better') {
    return formatNumber(minimumValue * 0.9)
  }

  if (name.includes('12 minutos')) return String(Math.ceil((minimumValue + 200) / 50) * 50)
  if (name.includes('2400') || name.includes('2000') || name.includes('1800')) return formatNumber(minimumValue * 0.95)
  if (name.includes('barra')) return String(Math.ceil(minimumValue + 3))
  if (name.includes('isometria')) return String(Math.ceil(minimumValue + 10))
  if (name.includes('flexão')) return String(Math.ceil(minimumValue + 5))
  if (name.includes('abdominal')) return String(Math.ceil(minimumValue + 5))
  if (name.includes('meio sugado')) return String(Math.ceil(minimumValue + 5))
  if (name.includes('salto') || name.includes('impulsão')) return formatNumber(minimumValue * 1.1)
  if (unit.includes('metros')) return formatNumber(minimumValue * 1.1)
  if (unit.includes('repet')) return String(Math.ceil(minimumValue * 1.15))

  return formatNumber(minimumValue * 1.1)
}

function getExampleValuesForTest(test) {
  const name = String(test?.test_name || '').toLowerCase()
  const unit = String(test?.unit || '').toLowerCase()
  const lowerIsBetter = test?.calculation_type === 'lower_is_better'

  if (name.includes('12 minutos')) return { minimum: '2400', safe: '2600' }
  if (name.includes('2400')) return { minimum: '720', safe: '660' }
  if (name.includes('2000')) return { minimum: '720', safe: '660' }
  if (name.includes('1800')) return { minimum: '720', safe: '660' }
  if (name.includes('barra')) return { minimum: '5', safe: '8' }
  if (name.includes('isometria')) return { minimum: '30', safe: '45' }
  if (name.includes('flexão')) return { minimum: '25', safe: '35' }
  if (name.includes('abdominal')) return { minimum: '35', safe: '45' }
  if (name.includes('meio sugado')) return { minimum: '20', safe: '25' }
  if (name.includes('shuttle')) return { minimum: '12,5', safe: '11,8' }
  if (name.includes('natação 50')) return { minimum: '60', safe: '54' }
  if (name.includes('natação 100')) return { minimum: '120', safe: '108' }
  if (name.includes('natação 200')) return { minimum: '260', safe: '235' }
  if (name.includes('corrida 50')) return { minimum: '8,0', safe: '7,5' }
  if (name.includes('corrida 100')) return { minimum: '15,0', safe: '14,0' }
  if (name.includes('impulsão')) return { minimum: '2,00', safe: '2,20' }
  if (name.includes('salto em distância')) return { minimum: '3,50', safe: '3,85' }
  if (name.includes('salto em altura')) return { minimum: '1,20', safe: '1,30' }
  if (name.includes('salto/plataforma')) return { minimum: '1,50', safe: '1,70' }
  if (name.includes('escalada')) return { minimum: '15', safe: '13,5' }
  if (name.includes('transporte de carga')) return { minimum: '90', safe: '82' }
  if (name.includes('prova aquática')) return lowerIsBetter ? { minimum: '300', safe: '270' } : { minimum: '500', safe: '600' }

  if (lowerIsBetter || unit.includes('segundo')) return { minimum: '60', safe: '54' }
  if (unit.includes('metro')) return { minimum: '2,00', safe: '2,20' }
  if (unit.includes('repet')) return { minimum: '10', safe: '12' }

  return { minimum: '10', safe: '12' }
}

function minimumPlaceholderForTest(test) {
  return `Ex.: ${getExampleValuesForTest(test).minimum}`
}

function safeGoalPlaceholderForTest(test) {
  const minimum = parseNumber(test?.minimum_value)

  if (minimum > 0) {
    return `Sugestão: ${suggestSafeGoal(test, minimum)}`
  }

  return `Ex.: ${getExampleValuesForTest(test).safe}`
}