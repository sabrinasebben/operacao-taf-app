import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import StudentNav from '../components/StudentNav'

const HOTMART_COURSE_URL = import.meta.env.VITE_HOTMART_COURSE_URL || ''

export default function PerfilAluno({ profile }) {
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [activeExam, setActiveExam] = useState(null)

  const [name, setName] = useState(profile?.name || '')
  const [email] = useState(profile?.email || '')
  const [birthDate, setBirthDate] = useState(profile?.birth_date || '')
  const [weight, setWeight] = useState(profile?.weight || '')
  const [height, setHeight] = useState(profile?.height || '')
  const [sex, setSex] = useState(profile?.sex || 'Masculino')
  const [targetExam, setTargetExam] = useState(profile?.target_exam || '')

  useEffect(() => {
    // The function declaration is intentionally hoisted; it uses the current profile.
    // eslint-disable-next-line react-hooks/immutability
    loadActiveExam()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.user_id])

  async function loadActiveExam() {
    const { data } = await supabase
      .from('student_exams')
      .select('*')
      .eq('user_id', profile.user_id)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setActiveExam(data || null)

    if (data?.exam_name && !targetExam) {
      setTargetExam(data.exam_name)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleSave(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')

    const { error } = await supabase
      .from('profiles')
      .update({
        name: name.trim() || null,
        birth_date: birthDate || null,
        weight: parseNumber(weight) || null,
        height: parseNumber(height) || null,
        sex,
        target_exam: targetExam.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', profile.user_id)

    setSaving(false)

    if (error) {
      setMessage('Erro ao salvar perfil. Verifique se as colunas birth_date, weight e height existem em profiles.')
      return
    }

    setMessage('Perfil atualizado com sucesso.')
  }

  function openHotmart() {
    if (!HOTMART_COURSE_URL) {
      setMessage('Link da Hotmart ainda não configurado. Defina VITE_HOTMART_COURSE_URL no .env.local e na Vercel.')
      return
    }

    window.open(HOTMART_COURSE_URL, '_blank', 'noopener,noreferrer')
  }

  const age = useMemo(() => calculateAge(birthDate), [birthDate])
  const bmi = useMemo(() => calculateBmi(weight, height), [weight, height])
  const bmiInfo = getBmiInfo(bmi)
  const tafDays = getDaysToDate(activeExam?.taf_date)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand-row">
          <span className="brand-mark">◎</span>
          <div>
            <strong>OPERAÇÃO TAF</strong>
            <small>Perfil do aluno</small>
          </div>
        </div>

        <StudentNav profile={profile} onLogout={handleLogout} hotmartUrl={HOTMART_COURSE_URL} />
      </header>

      <main className="dashboard">
        <section className="profile-hero">
          <div>
            <div className="kicker">Dados do aluno</div>
            <h1>Perfil Operação TAF</h1>
            <p>
              Mantenha seus dados atualizados para melhorar o diagnóstico, acompanhar sua preparação e organizar sua jornada até o TAF.
            </p>

            <div className="command-actions">
              <button className="btn btn-green" type="button" onClick={openHotmart}>
                Acessar curso na Hotmart
              </button>
              <a className="btn btn-dark" href="/area-do-aluno">
                Voltar ao dashboard
              </a>
            </div>
          </div>

          <div className="profile-summary-card">
            <span>Status</span>
            <strong>Aluno ativo</strong>
            <small>{activeExam?.exam_name || targetExam || 'Edital não configurado'}</small>
          </div>
        </section>

        {message && <div className="form-message">{message}</div>}

        <section className="profile-kpi-grid">
          <div className="info-card">
            <span>Idade</span>
            <strong>{age ? `${age} anos` : '—'}</strong>
          </div>

          <div className="info-card">
            <span>IMC</span>
            <strong>{bmi ? formatDecimal(bmi) : '—'}</strong>
            <small>{bmiInfo.label}</small>
          </div>

          <div className="info-card">
            <span>Peso</span>
            <strong>{weight ? `${formatDecimal(parseNumber(weight))} kg` : '—'}</strong>
          </div>

          <div className="info-card">
            <span>Altura</span>
            <strong>{height ? `${formatDecimal(parseNumber(height))} m` : '—'}</strong>
          </div>

          <div className="info-card">
            <span>Dias até o TAF</span>
            <strong>{formatDaysToTaf(tafDays).value}</strong>
            <small>{formatDaysToTaf(tafDays).label}</small>
          </div>

          <div className="info-card">
            <span>Curso</span>
            <strong>Hotmart</strong>
            <small>Aulas e materiais ficam na área de membros.</small>
          </div>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Cadastro</div>
              <h2>Informações pessoais e físicas</h2>
              <p className="muted">
                Esses dados não substituem avaliação médica. Eles servem para organização e acompanhamento da preparação.
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="profile-form-grid">
            <label>
              Nome
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex.: Diego Severo"
              />
            </label>

            <label>
              E-mail
              <input value={email || '—'} disabled />
            </label>

            <label>
              Concurso alvo
              <input
                value={targetExam}
                onChange={(event) => setTargetExam(event.target.value)}
                placeholder="Ex.: Brigada Militar RS"
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

            <label>
              Data de nascimento
              <input
                type="date"
                value={birthDate || ''}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </label>

            <label>
              Peso atual
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
              IMC automático
              <input value={bmi ? `${formatDecimal(bmi)} — ${bmiInfo.label}` : '—'} disabled />
            </label>

            <div className="profile-form-actions">
              <button className="btn btn-green" type="submit" disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar perfil'}
              </button>
            </div>
          </form>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Hotmart</div>
              <h2>Aulas, PDFs e materiais do curso</h2>
              <p className="muted">
                A Área Premium não duplica as aulas. Os vídeos, PDFs e planilhas continuam na Hotmart. Use este sistema para diagnóstico e acompanhamento.
              </p>
            </div>
          </div>

          <div className="hotmart-panel-grid">
            <div className="hotmart-card">
              <span>Área de membros</span>
              <strong>Hotmart</strong>
              <p>Acesse as aulas completas, PDFs, planilhas e materiais complementares do Operação TAF.</p>
              <button className="btn btn-green" type="button" onClick={openHotmart}>
                Acessar curso na Hotmart
              </button>
            </div>

            <div className="hotmart-card">
              <span>Área Premium</span>
              <strong>Operação TAF</strong>
              <p>Use a calculadora, histórico, diagnóstico por edital e recomendações automáticas.</p>
              <a className="btn btn-dark" href="/calculadora-premium">
                Abrir calculadora
              </a>
            </div>
          </div>
        </section>

        <section className="premium-panel">
          <div className="panel-head">
            <div>
              <div className="kicker">Segurança</div>
              <h2>Orientações importantes</h2>
            </div>
          </div>

          <div className="profile-warning-grid">
            <div>
              <strong>Dados físicos</strong>
              <p>Use informações reais para melhorar o acompanhamento. Peso e altura ajudam na leitura geral, mas não definem aprovação.</p>
            </div>

            <div>
              <strong>Saúde e lesões</strong>
              <p>Se houver dor, lesão, tontura, falta de ar fora do normal ou restrição médica, procure avaliação profissional antes de treinar.</p>
            </div>

            <div>
              <strong>Resultado no TAF</strong>
              <p>O sistema orienta a preparação, mas o resultado depende de regularidade, execução correta, edital e condição no dia da prova.</p>
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

function parseNumber(value) {
  if (value === null || value === undefined) return 0
  const number = Number(String(value).replace(',', '.'))
  return Number.isNaN(number) ? 0 : number
}

function formatDecimal(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return String(Number(Number(value).toFixed(2))).replace('.', ',')
}

function calculateAge(birthDate) {
  const date = parseLocalDate(birthDate)
  if (!date) return null

  const today = new Date()
  let age = today.getFullYear() - date.getFullYear()
  const monthDiff = today.getMonth() - date.getMonth()

  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) age--

  return age
}

function calculateBmi(weight, height) {
  const weightNumber = parseNumber(weight)
  const heightNumber = parseNumber(height)

  if (!weightNumber || !heightNumber) return null

  return weightNumber / (heightNumber * heightNumber)
}

function getBmiInfo(bmi) {
  if (!bmi) return { label: 'Preencha peso e altura.' }
  if (bmi < 18.5) return { label: 'Abaixo do peso' }
  if (bmi < 25) return { label: 'Faixa considerada normal' }
  if (bmi < 30) return { label: 'Sobrepeso' }
  if (bmi < 35) return { label: 'Obesidade grau I' }
  if (bmi < 40) return { label: 'Obesidade grau II' }
  return { label: 'Obesidade grau III' }
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

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  tafDate.setHours(0, 0, 0, 0)

  return Math.ceil((tafDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDaysToTaf(days) {
  if (days === null || days === undefined) {
    return {
      value: '—',
      label: 'Data não informada',
    }
  }

  if (days < 0) {
    return {
      value: 'Vencido',
      label: 'Revise a data do TAF',
    }
  }

  if (days === 0) {
    return {
      value: 'Hoje',
      label: 'TAF marcado para hoje',
    }
  }

  return {
    value: String(days),
    label: 'Dias restantes',
  }
}
