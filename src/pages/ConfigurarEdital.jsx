import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ConfigurarEdital({ profile }) {
  const navigate = useNavigate()

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
    }

    setLoading(false)
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
        const numericValue = Number(String(value).replace(',', '.'))

        if (numericValue > 0 && !item.safe_goal_value) {
          const safeGoal =
            item.calculation_type === 'lower_is_better'
              ? numericValue * 0.9
              : numericValue * 1.1

          nextItem.safe_goal_value = formatNumber(safeGoal)
        }
      }

      return { ...current, [testId]: nextItem }
    })
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const selectedList = Object.values(selectedTests).filter((item) => item.selected)

    if (!examName.trim()) {
      setMessage('Informe o nome do concurso ou edital.')
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

    setSaving(false)
    navigate('/area-do-aluno')
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
          <a href="/area-do-aluno">Dashboard</a>
          <a href="/configurar-edital">Configurar Edital</a>
          <a href="/calculadora-premium">Calculadora</a>
          <a href="/historico">Histórico</a>
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
                Selecione as provas cobradas no seu concurso, informe o índice mínimo e defina uma meta segura.
              </p>
            </div>

            <div className="status-badge">Área Premium</div>
          </section>

          <section className="premium-panel">
            <div className="panel-head">
              <div>
                <div className="kicker">Dados do concurso</div>
                <h2>Informações do edital</h2>
              </div>
            </div>

            <div className="exam-form-grid">
              <label>
                Nome do concurso
                <input
                  value={examName}
                  onChange={(event) => setExamName(event.target.value)}
                  placeholder="Ex.: Brigada Militar RS"
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

              <button className="btn btn-green" type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar edital'}
              </button>
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
                                  placeholder="Ex.: 2400"
                                />
                              </label>

                              <label>
                                Meta segura
                                <input
                                  value={selected.safe_goal_value}
                                  onChange={(event) =>
                                    updateSelectedField(test.id, 'safe_goal_value', event.target.value)
                                  }
                                  placeholder="Ex.: 2600"
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
              <a className="btn btn-dark" href="/area-do-aluno">
                Cancelar
              </a>

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