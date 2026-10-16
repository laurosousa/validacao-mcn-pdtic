import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2,
  ChevronDown, CircleHelp, ClipboardCheck, FileText, Info, LockKeyhole,
  Menu, ShieldCheck, Save, Copy, RotateCcw,
} from 'lucide-react';
import { loadDraftRemote, normalizeResumeCode, requirements as allRequirements, saveDraftRemote, sendSubmission, useConfig } from '@/lib/mcn';
import { TERM_VERSION } from '@/lib/termo';
import TermoPage from '@/pages/termo';
import type { Dimension, DimensionInput, ExpertProfile, InstitutionType, McnConfig, Requirement, RequirementRating, SubmissionInput } from '@/lib/mcn';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter, Link } from 'wouter';
import './index.css';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

const dimensionMeta: Record<Dimension, { label: string; short: string; index: string; description: string }> = {
  normativa: { label: 'Normativa', short: 'Normativa', index: '01', description: 'Requisitos relacionados à conformidade legal e às diretrizes que orientam a TIC.' },
  estrategica: { label: 'Estratégica', short: 'Estratégica', index: '02', description: 'Requisitos que conectam a TIC aos objetivos institucionais e ao planejamento.' },
  operacional: { label: 'Operacional', short: 'Operacional', index: '03', description: 'Requisitos que apoiam a execução, a gestão e a continuidade dos serviços de TIC.' },
  governanca: { label: 'Governança', short: 'Governança', index: '04', description: 'Requisitos sobre direcionamento, monitoramento e responsabilização em TIC.' },
};
const dimensions: Dimension[] = ['normativa', 'estrategica', 'operacional', 'governanca'];
const profileNames: Record<ExpertProfile, string> = {
  gestor_ifes_norte: 'Gestor(a) de TIC de IFES da Região Norte',
  auditoria_controle: 'Especialista em auditoria/controle com atuação em governança de TIC',
  pesquisador_doutor: 'Pesquisador(a) doutor(a) em área relacionada à gestão ou governança de TIC',
};
const institutionNames: Record<InstitutionType, string> = {
  ifes_norte: 'IFES da Região Norte',
  ifes_outra_regiao: 'IFES de outra região',
  orgao_controle: 'Órgão de controle (TCU, CGU etc.)',
  outro_orgao_publico: 'Outro órgão ou entidade pública',
  outra_instituicao: 'Outra instituição de ensino ou pesquisa',
};
const normativityLabel: Record<Requirement['normativity'], string> = {
  obrigatorio: 'Obrigatório', recomendado: 'Recomendado', complementar: 'Complementar',
};
const scaleLabels = ['Inadequado', 'Parcialmente adequado', 'Adequado', 'Plenamente adequado'];
const storageKey = 'mcn-pdtic-validation-draft-v1';

type DimensionAnswers = Record<Dimension, DimensionInput>;
type Draft = {
  step: 'profile' | 'survey';
  consentAccepted?: boolean;
  profile?: ExpertProfile;
  yearsExperience?: number;
  institutionType?: InstitutionType;
  confirmsNoDirectLink?: boolean;
  activeDimension?: Dimension;
  ratings: Record<string, RequirementRating>;
  dimensions: DimensionAnswers;
  additionalComments: string;
  resumeCode?: string;
  remoteSavedAt?: string;
};

function emptyDimension(): DimensionInput {
  return { breadth: 0, applicability: 0, suggestions: '', duplicateConcerns: '' };
}
function emptyDraft(): Draft {
  return {
    step: 'profile',
    ratings: {},
    dimensions: {
      normativa: emptyDimension(), estrategica: emptyDimension(),
      operacional: emptyDimension(), governanca: emptyDimension(),
    },
    additionalComments: '',
  };
}
function readDraft(): Draft {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved) return { ...emptyDraft(), ...JSON.parse(saved) };
  } catch { /* A damaged local draft should never prevent a fresh response. */ }
  return emptyDraft();
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="brand-mark" data-testid="link-home">
      <span className="brand-symbol" aria-hidden="true"><span /><span /><span /></span>
      {!compact && <span className="brand-copy"><b>MCN–PDTIC</b><small>instrumento de validação</small></span>}
    </Link>
  );
}

function Topbar() {
  return (
    <header className="topbar">
      <Wordmark />
      <div className="topbar-right">
        <span className="research-label"><span className="status-dot" />Pesquisa acadêmica</span>
        <a className="nav-link" href="#participar">Participar <ArrowUpRight size={15} /></a>
      </div>
    </header>
  );
}

function LoadingState({ label = 'Carregando dados do instrumento' }: { label?: string }) {
  return <div className="loading-panel" role="status" data-testid="status-loading">
    <div className="skeleton-line wide" /><div className="skeleton-line" /><div className="skeleton-block" />
    <span>{label}</span>
  </div>;
}
function ErrorState({ retry, message = 'Não foi possível carregar os dados.' }: { retry: () => void; message?: string }) {
  return <div className="state-panel error-panel" role="alert" data-testid="status-error">
    <span className="state-icon"><Activity size={19} /></span><div><b>Algo não saiu como esperado</b><p>{message}</p></div>
    <button className="button button-outline button-small" onClick={retry} data-testid="button-retry">Tentar novamente</button>
  </div>;
}
function Notice({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warning' | 'success' }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>;
}

function HomePage() {
  const configQuery = useConfig();
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [submitState, setSubmitState] = useState<'idle' | 'pending' | 'error'>('idle');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [resumeInput, setResumeInput] = useState('');
  const [resumeState, setResumeState] = useState<'idle' | 'loading' | 'confirm' | 'error'>('idle');
  const [resumeError, setResumeError] = useState('');
  const requirements = allRequirements;
  const config = configQuery.data;
  const consent = Boolean(draft.consentAccepted);
  const ready = Boolean(config?.surveyReady && config.submitUrl && config.estimatedMinutes !== null);
  const groups = useMemo(() => dimensions.reduce((acc, dimension) => {
    acc[dimension] = requirements.filter((item) => item.dimension === dimension);
    return acc;
  }, {} as Record<Dimension, Requirement[]>), [requirements]);
  const activeDimension = draft.activeDimension ?? dimensions[0];
  const activeItems = groups[activeDimension] ?? [];
  const answeredCount = Object.keys(draft.ratings).filter((code) => draft.ratings[code]?.clarity && draft.ratings[code]?.relevance).length;
  const validRequirements = requirements.length === 80;
  const allDimensionRatings = dimensions.every((dim) => draft.dimensions[dim].breadth >= 1 && draft.dimensions[dim].applicability >= 1);
  const allRated = validRequirements && answeredCount === requirements.length;
  const profileReady = Boolean(draft.profile && draft.institutionType && (draft.yearsExperience ?? 0) >= 2 && draft.confirmsNoDirectLink);
  const hasLocalProgress = draft.step === 'survey' || answeredCount > 0;

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(draft)); } catch { /* Storage may be unavailable. */ }
  }, [draft]);

  function updateDraft(patch: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }
  function updateRating(item: Requirement, key: 'clarity' | 'relevance', value: number) {
    setDraft((current) => {
      const old = current.ratings[item.code] ?? { code: item.code, clarity: 0, relevance: 0 };
      return { ...current, ratings: { ...current.ratings, [item.code]: { ...old, [key]: value } } };
    });
  }
  function updateDimension(key: keyof DimensionInput, value: string | number) {
    setDraft((current) => ({
      ...current,
      dimensions: { ...current.dimensions, [activeDimension]: { ...current.dimensions[activeDimension], [key]: value } },
    }));
  }
  function goToDimension(index: number) {
    const next = dimensions[index];
    if (next) {
      updateDraft({ activeDimension: next });
      scrollPending.current = true;
    }
  }
  const scrollPending = useRef(false);
  useEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    // Scroll after the new dimension renders so a button that becomes disabled cannot cancel it.
    requestAnimationFrame(() => document.getElementById('participar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [activeDimension]);
  function saveForLater() {
    if (!config?.submitUrl || saveState === 'saving') return;
    setSaveState('saving');
    const { resumeCode, remoteSavedAt: _savedAt, ...content } = draft;
    saveDraftRemote(config.submitUrl, resumeCode ?? null, content)
      .then((result) => { updateDraft({ resumeCode: result.code, remoteSavedAt: result.savedAt }); setSaveState('saved'); })
      .catch((error: Error) => { setSaveError(error.message); setSaveState('error'); });
  }
  function resume(force = false, typed?: string) {
    const code = normalizeResumeCode(typed ?? resumeInput);
    if (!code) { setResumeError('Digite o código no formato ABCD-1234.'); setResumeState('error'); return; }
    if (!config?.submitUrl) return;
    if (hasLocalProgress && !force) { setResumeState('confirm'); return; }
    setResumeState('loading');
    loadDraftRemote(config.submitUrl, code).then((result) => {
      setDraft({ ...emptyDraft(), ...(result.draft as Partial<Draft>), resumeCode: result.code, remoteSavedAt: result.savedAt });
      setResumeState('idle'); setResumeInput(''); setSaveState('idle');
      requestAnimationFrame(() => document.getElementById('participar')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }).catch((error: Error) => { setResumeError(error.message); setResumeState('error'); });
  }
  // Link "…/?retomar=ABCD-1234" opens the saved evaluation.
  const resumeFromLink = useRef(false);
  useEffect(() => {
    if (resumeFromLink.current || !config?.submitUrl) return;
    resumeFromLink.current = true;
    const params = new URLSearchParams(window.location.search);
    const fromLink = params.get('retomar');
    if (!fromLink) return;
    params.delete('retomar');
    const rest = params.toString();
    window.history.replaceState(null, '', window.location.pathname + (rest ? `?${rest}` : '') + window.location.hash);
    setResumeInput(fromLink);
    resume(false, fromLink);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.submitUrl]);
  function submit() {
    if (!ready || !consent || !allRated || !allDimensionRatings || !profileReady || !draft.profile || !draft.institutionType || !config?.submitUrl) return;
    if (submitState === 'pending') return;
    const payload: SubmissionInput = {
      consentAccepted: true,
      profile: draft.profile,
      yearsExperience: Number(draft.yearsExperience),
      institutionType: draft.institutionType,
      termVersion: TERM_VERSION,
      draftCode: draft.resumeCode ?? null,
      hasDirectUFRRLink: false,
      ratings: requirements.map((item) => draft.ratings[item.code]!),
      dimensions: draft.dimensions,
      additionalComments: draft.additionalComments.trim() || null,
    };
    setSubmitState('pending');
    sendSubmission(config.submitUrl, payload).then((result) => {
      try { localStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
      setDraft(emptyDraft());
      setSubmitState('idle');
      setReceipt(result.id);
      window.scrollTo({ top: 0 });
    }).catch(() => setSubmitState('error'));
  }
  function startOver() {
    setSubmitState('idle');
    setReceipt(null);
    window.scrollTo({ top: 0 });
  }

  if (receipt) return <SubmissionSuccess receipt={receipt} onHome={startOver} />;

  return (
    <main className="public-shell">
      <Topbar />
      <section className="hero-wrap">
        <div className="hero-main fade-up">
          <div className="eyebrow"><span className="eyebrow-rule" />PESQUISA · GESTÃO PÚBLICA DE TIC</div>
          <h1 className="serif">Uma leitura especializada<br /><em>faz diferença.</em></h1>
          <p className="hero-lede">Ajude a avaliar se os requisitos do MCN–PDTIC são claros, relevantes, abrangentes e aplicáveis à realidade de um PDTIC.</p>
          <div className="hero-meta">
            <span><ClipboardCheck size={16} /> 80 requisitos</span><i />
            <span><ShieldCheck size={16} /> Sem identificação direta</span><i />
            <span><Activity size={16} /> 4 dimensões</span>
          </div>
        </div>
        <aside className="hero-aside fade-up fade-delay-1">
          <div className="instrument-stamp"><span>INSTRUMENTO</span><b>MCN</b><small>VALIDAÇÃO DE CONTEÚDO</small><div className="stamp-line" /><small>UFRR · PESQUISA</small></div>
          <p>O foco é o conteúdo do checklist — não a avaliação do PDTIC da UFRR.</p>
        </aside>
      </section>

      <section className="readiness-band" data-testid="status-survey-readiness">
        <div className={`readiness-icon ${ready ? 'ready' : ''}`}>{ready ? <CheckCircle2 size={21} /> : <LockKeyhole size={20} />}</div>
        <div className="readiness-copy">
          <span className="eyebrow-small">{ready ? 'PRONTO PARA PARTICIPAR' : 'INSTRUMENTO EM PREPARAÇÃO'}</span>
          <h2>{ready ? 'A coleta está disponível.' : 'A coleta ainda não está aberta.'}</h2>
          <p>{ready ? 'Leia o Termo de Participação e, se desejar, comece a avaliação. Você pode salvar e continuar depois.' : 'A participação será liberada quando a equipe de pesquisa conectar a planilha e informar a duração estimada.'}</p>
        </div>
        <div className="readiness-details">
          <div><span>TERMO</span><a href={`${basePath}/termo`} target="_blank" rel="noreferrer" data-testid="link-term">Ler termo ({TERM_VERSION}) <ArrowUpRight size={13} /></a></div>
          <div><span>DURAÇÃO</span>{configQuery.isLoading ? <b>Consultando…</b> : config?.estimatedMinutes !== null && config?.estimatedMinutes !== undefined ? <b>{config.estimatedMinutes} min</b> : <b className="unset">Não informada</b>}</div>
        </div>
      </section>
      {configQuery.isError && <ErrorState retry={() => configQuery.refetch()} message="A configuração de participação não respondeu. Tente atualizar para consultar a disponibilidade." />}

      <section className="intro-grid">
        <div className="intro-block">
          <span className="section-number">01 / PROPÓSITO</span>
          <h2 className="serif">Um instrumento<br />para quem conhece<br />o trabalho de perto.</h2>
          <p>Você avaliará os 80 requisitos da MCN–PDTIC como critérios: se a redação é clara e se cada requisito é pertinente para avaliar um PDTIC qualquer.</p>
          <p className="intro-note"><Info size={15} /> Você não está avaliando o PDTIC da sua instituição nem o da UFRR.</p>
        </div>
        <div className="four-dimensions">
          <span className="section-number">02 / O QUE VOCÊ VAI AVALIAR</span>
          <div className="dimension-list">
            {dimensions.map((dim) => <div className="dimension-row" key={dim}>
              <span className="dimension-index">{dimensionMeta[dim].index}</span><div><b>{dimensionMeta[dim].label}</b><p>{dimensionMeta[dim].description}</p></div><ArrowUpRight size={16} />
            </div>)}
          </div>
          <div className="rating-key"><span className="rating-key-dot" /> Em cada requisito: clareza e relevância <span className="rating-range">1—4</span></div>
        </div>
      </section>

      <section className="privacy-strip">
        <div className="privacy-mark"><LockKeyhole size={19} /></div>
        <div><b>Proteção de dados.</b><p>Não pedimos nome, e-mail nem o nome da sua instituição, apenas o tipo de instituição. Evite incluir dados identificáveis nos comentários. Os dados seguem a LGPD (Lei nº 13.709/2018) e os resultados serão apresentados de forma agregada.</p></div>
        <div className="privacy-tag">SEM IDENTIFICADORES DIRETOS</div>
      </section>

      <section className="participate" id="participar">
        <div className="participate-heading">
          <span className="section-number">03 / SUA CONTRIBUIÇÃO</span>
          <h2 className="serif">Pronto para avaliar?</h2>
          <p>Quando a coleta estiver liberada, o percurso começa com uma breve confirmação de perfil e segue pelas quatro dimensões.</p>
        </div>
        {configQuery.isLoading ? <LoadingState label="Preparando o instrumento e seus requisitos" /> :
          !validRequirements ? <Notice tone="warning">O instrumento retornou {requirements.length} requisitos. Para proteger a integridade da pesquisa, a avaliação só poderá começar quando os 80 requisitos estiverem disponíveis.</Notice> :
          !ready ? <div className="closed-card"><div className="closed-seal"><LockKeyhole size={20} /></div><div><b>Participação temporariamente indisponível</b><p>Esta página permanecerá aberta para consulta. Nenhuma resposta pode ser enviada antes da liberação formal da coleta.</p></div><span className="closed-state">AGUARDANDO CONFIGURAÇÃO</span></div> :
          draft.step === 'profile' ? <>
            <ResumeCard value={resumeInput} onChange={(v) => { setResumeInput(v); if (resumeState !== 'loading') setResumeState('idle'); }} state={resumeState} error={resumeError} onResume={() => resume(false)} onConfirm={() => resume(true)} onCancel={() => setResumeState('idle')} />
            <ProfileSetup draft={draft} onChange={updateDraft} consent={consent} setConsent={(value) => updateDraft({ consentAccepted: value })} config={config} onStart={() => updateDraft({ step: 'survey', activeDimension: dimensions[0] })} />
          </>
            : <>{resumeState !== 'idle' && <ResumeCard value={resumeInput} onChange={(v) => { setResumeInput(v); setResumeState('idle'); }} state={resumeState} error={resumeError} onResume={() => resume(false)} onConfirm={() => resume(true)} onCancel={() => setResumeState('idle')} />}
            <SurveyWorkspace draft={draft} activeDimension={activeDimension} activeItems={activeItems} groups={groups} answeredCount={answeredCount} total={requirements.length} onChange={updateDraft} onRating={updateRating} onDimension={updateDimension} onNavigate={goToDimension} onSubmit={submit} submitPending={submitState === 'pending'} submitError={submitState === 'error'} save={{ state: saveState, error: saveError, code: draft.resumeCode, savedAt: draft.remoteSavedAt, onSave: saveForLater, onClose: () => setSaveState('idle') }} /></>}
        {submitState === 'error' && <ErrorState retry={submit} message="Sua resposta não foi enviada. Verifique sua conexão e tente de novo; as informações continuam salvas neste aparelho." />}
      </section>
      <Footer />
    </main>
  );
}

function ProfileSetup({ draft, onChange, consent, setConsent, config, onStart }: {
  draft: Draft; onChange: (patch: Partial<Draft>) => void; consent: boolean;
  setConsent: (value: boolean) => void; config: McnConfig | undefined; onStart: () => void;
}) {
  const valid = Boolean(consent && draft.profile && draft.institutionType && (draft.yearsExperience ?? 0) >= 2 && draft.confirmsNoDirectLink);
  return <div className="setup-card fade-up">
    <div className="setup-head"><div><span className="section-number">PRIMEIRO, SEU PERFIL</span><h3>Uma breve confirmação</h3></div><span className="step-count">ETAPA 1 <i /> 2</span></div>
    <div className="setup-grid">
      <fieldset className="form-fieldset"><legend>Qual perfil descreve melhor sua atuação?</legend>
        <div className="profile-options">
          {(Object.keys(profileNames) as ExpertProfile[]).map((profile) => <label key={profile} className={`profile-option ${draft.profile === profile ? 'selected' : ''}`}>
            <input type="radio" name="expert-profile" value={profile} checked={draft.profile === profile} onChange={() => onChange({ profile })} data-testid={`input-profile-${profile}`} />
            <span className="radio-custom" /><span>{profileNames[profile]}</span>{draft.profile === profile && <Check size={15} />}
          </label>)}
        </div>
      </fieldset>
      <div className="experience-field">
        <label htmlFor="years-experience">Anos de experiência profissional</label>
        <p>É necessário ter pelo menos 2 anos de experiência.</p>
        <div className="number-input-wrap"><input id="years-experience" type="number" inputMode="numeric" min={2} step={1} value={draft.yearsExperience ?? ''} onChange={(event) => onChange({ yearsExperience: Number(event.target.value) })} placeholder="Ex.: 8" data-testid="input-years-experience" /><span>anos</span></div>
        <label htmlFor="institution-type" className="institution-label">Tipo de instituição em que atua</label>
        <p>Informe só o tipo; não pedimos o nome da instituição.</p>
        <select id="institution-type" className="institution-select" value={draft.institutionType ?? ''} onChange={(event) => onChange({ institutionType: (event.target.value || undefined) as InstitutionType | undefined })} data-testid="input-institution-type">
          <option value="">Selecione…</option>
          {(Object.keys(institutionNames) as InstitutionType[]).map((type) => <option key={type} value={type}>{institutionNames[type]}</option>)}
        </select>
      </div>
    </div>
    <div className="consent-panel">
      <div className="consent-title"><FileText size={18} /><div><b>Termo de Participação e Uso dos Dados</b><p>Leia o termo antes de decidir participar.</p></div></div>
      <a href={`${basePath}/termo`} target="_blank" rel="noreferrer" className="tcle-link">Abrir termo ({TERM_VERSION}) <ArrowUpRight size={14} /></a>
      <label className="consent-check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} data-testid="input-consent" /><span className="check-box">{consent && <Check size={13} />}</span><span>Li e aceito o Termo de Participação e Uso dos Dados ({TERM_VERSION}) e participo voluntariamente.</span></label>
      <p className="lgpd-note"><b>Tratamento de dados (LGPD).</b> As respostas são usadas apenas nesta pesquisa acadêmica (Lei nº 13.709/2018, arts. 4º, II, “b”, e 7º, IV). Ficam guardadas em planilha institucional da UFRR, com acesso restrito ao pesquisador e ao orientador, por no mínimo cinco anos, e são divulgadas somente de forma agregada. Dúvidas ou pedido de exclusão: {config?.contactEmail ?? 'lauro.sousa@ufrr.br'}.</p>
    </div>
    <label className="anonymous-confirm"><input type="checkbox" checked={Boolean(draft.confirmsNoDirectLink)} onChange={(event) => onChange({ confirmsNoDirectLink: event.target.checked })} data-testid="input-no-direct-ufrr-link" /><span className="check-box">{draft.confirmsNoDirectLink && <Check size={13} />}</span><ShieldCheck size={18} /><span>Confirmo que não tenho vínculo direto com a UFRR e evitarei incluir dados que me identifiquem nos comentários.</span></label>
    <div className="setup-actions"><span><LockKeyhole size={14} /> Progresso salvo neste aparelho</span><button className="button button-primary" disabled={!valid} onClick={onStart} data-testid="button-begin-survey">Começar avaliação <ArrowRight size={16} /></button></div>
  </div>;
}

function RatingScale({ value, onChange, label, name }: { value: number; onChange: (value: number) => void; label: string; name: string }) {
  return <fieldset className="rating-field">
    <legend>{label}</legend>
    <div className="rating-options">
      {[1, 2, 3, 4].map((number) => <label key={number} className={`rating-choice ${value === number ? 'selected' : ''}`}>
        <input type="radio" name={name} value={number} checked={value === number} onChange={() => onChange(number)} aria-label={`${number} — ${scaleLabels[number - 1]}`} data-testid={`rating-${name}-${number}`} />
        <span className="rating-number">{number}</span><span className="rating-caption">{scaleLabels[number - 1]}</span>
      </label>)}
    </div>
  </fieldset>;
}

type SaveProps = { state: 'idle' | 'saving' | 'saved' | 'error'; error: string; code?: string; savedAt?: string; onSave: () => void; onClose: () => void };

function SurveyWorkspace({ draft, activeDimension, activeItems, groups, answeredCount, total, onChange, onRating, onDimension, onNavigate, onSubmit, submitPending, submitError, save }: {
  draft: Draft; activeDimension: Dimension; activeItems: Requirement[]; groups: Record<Dimension, Requirement[]>;
  answeredCount: number; total: number; onChange: (patch: Partial<Draft>) => void;
  onRating: (item: Requirement, key: 'clarity' | 'relevance', value: number) => void;
  onDimension: (key: keyof DimensionInput, value: string | number) => void;
  onNavigate: (index: number) => void; onSubmit: () => void; submitPending: boolean; submitError: boolean; save: SaveProps;
}) {
  const currentIndex = dimensions.indexOf(activeDimension);
  const allDone = answeredCount === total && dimensions.every((dim) => draft.dimensions[dim].breadth >= 1 && draft.dimensions[dim].applicability >= 1);
  const [showMenu, setShowMenu] = useState(false);
  const completion = Math.round((answeredCount / Math.max(total, 1)) * 100);
  return <div className="survey-layout fade-up">
    <aside className="survey-rail">
      <div className="rail-progress"><div className="rail-progress-top"><span>SEU PROGRESSO</span><b>{completion}%</b></div><div className="progress-track"><span style={{ width: `${completion}%` }} /></div><small>{answeredCount} de {total} requisitos avaliados</small></div>
      <nav className="dimension-nav" aria-label="Dimensões do instrumento">
        <span className="nav-label">DIMENSÕES</span>
        {dimensions.map((dim, index) => {
          const count = groups[dim].filter((item) => draft.ratings[item.code]?.clarity && draft.ratings[item.code]?.relevance).length;
          return <button key={dim} className={`dimension-nav-item ${activeDimension === dim ? 'active' : ''}`} onClick={() => { onNavigate(index); setShowMenu(false); }} data-testid={`button-dimension-${dim}`}>
            <span className="dimension-nav-index">{dimensionMeta[dim].index}</span><span className="dimension-nav-copy"><b>{dimensionMeta[dim].label}</b><small>{count}/{groups[dim].length} requisitos</small></span>
            {count === groups[dim].length && groups[dim].length > 0 ? <CheckCircle2 size={16} className="nav-complete" /> : <span className="nav-chevron">{activeDimension === dim ? 'EM CURSO' : ''}</span>}
          </button>;
        })}
      </nav>
      <div className="rail-privacy"><LockKeyhole size={15} /><p>Sem identificação direta.<br />Rascunho salvo neste aparelho.</p></div>
      <button type="button" className="button button-outline button-small rail-save" onClick={save.onSave} disabled={save.state === 'saving'} data-testid="button-save-later-rail"><Save size={15} /> Salvar e continuar depois</button>
    </aside>
    <section className="survey-content">
      <div className="survey-mobile-top">
        <button className="mobile-dimension-button" onClick={() => setShowMenu((current) => !current)} aria-expanded={showMenu} data-testid="button-toggle-dimensions"><Menu size={17} />{dimensionMeta[activeDimension].label}<ChevronDown size={14} /></button>
        {showMenu && <div className="mobile-dimension-menu">{dimensions.map((dim, index) => <button key={dim} onClick={() => { onNavigate(index); setShowMenu(false); }}>{dimensionMeta[dim].index} — {dimensionMeta[dim].label}</button>)}</div>}
        <span>{answeredCount}/{total}</span>
      </div>
      <div className="survey-heading"><div><span className="section-number">DIMENSÃO {dimensionMeta[activeDimension].index} / 04</span><h2 className="serif">{dimensionMeta[activeDimension].label}</h2><p>{dimensionMeta[activeDimension].description}</p></div><span className="dimension-count">{groups[activeDimension].length} requisitos</span></div>
      <div className="scale-intro"><CircleHelp size={16} /><span>Para cada requisito, marque uma nota de 1 a 4 em Clareza e Relevância. Notas 1 e 2 indicam que o requisito precisa de revisão maior; 3 e 4 indicam que ele é adequado.</span></div>
      {activeItems.length === 0 ? <Notice tone="warning">Não há requisitos associados a esta dimensão.</Notice> : <div className="requirement-list">
        {activeItems.map((item, index) => {
          const rating = draft.ratings[item.code] ?? { code: item.code, clarity: 0, relevance: 0 };
          return <article className="requirement-card" key={item.code} data-testid={`card-requirement-${item.code}`}>
            <div className="requirement-topline"><span className="requirement-code">{item.code}</span><span className="requirement-position">{index + 1} / {activeItems.length}</span></div>
            <h3>{item.text}</h3>
            <div className="requirement-source"><span className="normativity-tag">{normativityLabel[item.normativity]}</span>{item.legalBasis && <span className="legal-basis">{item.legalBasis}</span>}</div>
            <div className="rating-pair">
              <RatingScale name={`${item.code}-clareza`} label="Clareza — a redação deste requisito é compreensível?" value={rating.clarity} onChange={(value) => onRating(item, 'clarity', value)} />
              <RatingScale name={`${item.code}-relevancia`} label="Relevância — este requisito é pertinente para avaliar um PDTIC?" value={rating.relevance} onChange={(value) => onRating(item, 'relevance', value)} />
            </div>
          </article>;
        })}
      </div>}
      <section className="dimension-assessment">
        <div className="assessment-heading"><span className="section-number">SÍNTESE DA DIMENSÃO</span><h3 className="serif">E o conjunto?</h3><p>Agora considere os requisitos desta dimensão como um todo.</p></div>
        <RatingScale name={`${activeDimension}-abrangencia`} label={`Abrangência — os ${groups[activeDimension].length} requisitos desta dimensão cobrem os aspectos essenciais da dimensão?`} value={draft.dimensions[activeDimension].breadth} onChange={(value) => onDimension('breadth', value)} />
        <RatingScale name={`${activeDimension}-aplicabilidade`} label="Aplicabilidade — os requisitos desta dimensão podem ser verificados no texto de um PDTIC?" value={draft.dimensions[activeDimension].applicability} onChange={(value) => onDimension('applicability', value)} />
        <div className="textarea-grid">
          <label>Sugestões para esta dimensão<textarea value={draft.dimensions[activeDimension].suggestions ?? ''} onChange={(e) => onDimension('suggestions', e.target.value)} placeholder="O que poderia ser incluído, ajustado ou esclarecido?" data-testid={`input-suggestions-${activeDimension}`} /></label>
          <label>Sobreposições ou requisitos compostos<textarea value={draft.dimensions[activeDimension].duplicateConcerns ?? ''} onChange={(e) => onDimension('duplicateConcerns', e.target.value)} placeholder="Indique os códigos se dois requisitos parecem avaliar a mesma coisa ou se um reúne duas exigências." data-testid={`input-duplicates-${activeDimension}`} /></label>
        </div>
      </section>
      <div className="survey-navigation">
        <button className="button button-outline" disabled={currentIndex === 0} onClick={() => onNavigate(currentIndex - 1)} data-testid="button-previous-dimension"><ArrowLeft size={16} /> Anterior</button>
        <div className="save-later">
          <button type="button" className="button button-outline save-later-button" onClick={save.onSave} disabled={save.state === 'saving'} data-testid="button-save-later"><Save size={16} /> {save.state === 'saving' ? 'Salvando…' : 'Salvar e continuar depois'}</button>
          <span className="autosave-note"><CheckCircle2 size={14} /> Também salvo neste aparelho</span>
        </div>
        {currentIndex < dimensions.length - 1 ? <button className="button button-primary" onClick={() => onNavigate(currentIndex + 1)} data-testid="button-next-dimension">Próxima dimensão <ArrowRight size={16} /></button> :
          <button className="button button-primary" onClick={() => document.getElementById('survey-final-submit')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} data-testid="button-review-response">Ir para envio <ArrowRight size={16} /></button>}
      </div>
      {save.state === 'saved' && save.code && <SavedPanel code={save.code} onClose={save.onClose} />}
      {save.state === 'error' && <p className="inline-error" role="alert" data-testid="text-save-error">{save.error}</p>}
      {currentIndex === dimensions.length - 1 && <div className="final-submit" id="survey-final-submit">
        <div className="final-submit-copy"><span className="section-number">ENVIO</span><h3>Uma última confirmação</h3><p>{allDone ? 'As 80 avaliações e as quatro sínteses estão preenchidas. Você pode enviar sua contribuição.' : `Faltam avaliações ou sínteses. Requisitos respondidos: ${answeredCount} de ${total}.`}</p></div>
        <label className="additional-label">Há alguma observação adicional sobre a MCN–PDTIC ou sobre esta avaliação? (opcional)<textarea value={draft.additionalComments} onChange={(e) => onChange({ additionalComments: e.target.value })} placeholder="Compartilhe qualquer observação que ajude a interpretar sua avaliação." data-testid="input-additional-comments" /></label>
        <button className="button button-submit" disabled={!allDone || submitPending} onClick={onSubmit} data-testid="button-submit-survey">{submitPending ? 'Enviando resposta…' : 'Enviar avaliação'}{!submitPending && <ArrowRight size={16} />}</button>
        {submitError && <p className="inline-error">Não foi possível enviar. Seu rascunho continua salvo.</p>}
      </div>}
    </section>
  </div>;
}

async function copyText(text: string, fallbackId: string) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    const el = document.getElementById(fallbackId);
    if (el) { const range = document.createRange(); range.selectNodeContents(el); const sel = window.getSelection(); sel?.removeAllRanges(); sel?.addRange(range); }
    return false;
  }
}

function SavedPanel({ code, onClose }: { code: string; onClose: () => void }) {
  const link = `${window.location.origin}${basePath}/?retomar=${code}`;
  const [copied, setCopied] = useState<'' | 'code' | 'link'>('');
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { panel.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, [code]);
  return <div className="saved-panel fade-up" role="status" ref={panel} data-testid="panel-saved">
    <div className="saved-head"><CheckCircle2 size={20} /><b>Avaliação salva. Você pode fechar a página.</b></div>
    <p>Para continuar depois, neste ou em outro aparelho, use o código ou o link abaixo. Guarde-os: valem por 60 dias.</p>
    <div className="resume-code" id="resume-code-text" data-testid="text-resume-code">{code}</div>
    <div className="saved-actions">
      <button type="button" className="button button-primary button-small" onClick={() => copyText(code, 'resume-code-text').then((ok) => ok && setCopied('code'))} data-testid="button-copy-code"><Copy size={14} /> {copied === 'code' ? 'Código copiado' : 'Copiar código'}</button>
      <button type="button" className="button button-outline button-small" onClick={() => copyText(link, 'resume-link-text').then((ok) => ok && setCopied('link'))} data-testid="button-copy-link"><Copy size={14} /> {copied === 'link' ? 'Link copiado' : 'Copiar link'}</button>
      <button type="button" className="button button-outline button-small" onClick={onClose}>Continuar agora</button>
    </div>
    <p className="saved-link" id="resume-link-text">{link}</p>
  </div>;
}

function ResumeCard({ value, onChange, state, error, onResume, onConfirm, onCancel }: {
  value: string; onChange: (value: string) => void; state: 'idle' | 'loading' | 'confirm' | 'error'; error: string;
  onResume: () => void; onConfirm: () => void; onCancel: () => void;
}) {
  return <form className="resume-card" onSubmit={(event) => { event.preventDefault(); onResume(); }} data-testid="card-resume">
    <div className="resume-copy"><RotateCcw size={18} /><div><b>Já começou a avaliação?</b><p>Digite o código de retomada que você recebeu ao salvar.</p></div></div>
    <div className="resume-row">
      <label htmlFor="resume-code" className="sr-only">Código de retomada</label>
      <input id="resume-code" value={value} onChange={(event) => onChange(event.target.value)} placeholder="ABCD-1234" autoComplete="off" autoCapitalize="characters" spellCheck={false} data-testid="input-resume-code" />
      <button type="submit" className="button button-outline button-small" disabled={state === 'loading'} data-testid="button-resume">{state === 'loading' ? 'Buscando…' : 'Continuar'}</button>
    </div>
    {state === 'error' && <p className="inline-error" role="alert" data-testid="text-resume-error">{error}</p>}
    {state === 'confirm' && <div className="resume-confirm" role="alert"><p>Já existe uma avaliação em andamento neste aparelho. Continuar com o código vai substituí-la.</p><div><button type="button" className="button button-primary button-small" onClick={onConfirm} data-testid="button-resume-confirm">Substituir e continuar</button><button type="button" className="button button-outline button-small" onClick={onCancel}>Manter a deste aparelho</button></div></div>}
  </form>;
}

function SubmissionSuccess({ receipt, onHome }: { receipt: string; onHome: () => void }) {
  return <main className="success-page"><Topbar /><section className="success-card fade-up">
    <div className="success-icon"><Check size={27} /></div><span className="section-number">CONTRIBUIÇÃO REGISTRADA</span>
    <h1 className="serif">Obrigado por dedicar<br />seu conhecimento.</h1>
    <p>Sua contribuição foi recebida. O formulário não pede nome, e-mail nem o nome da sua instituição.</p>
    <div className="receipt"><span>PROTOCOLO</span><b>{receipt}</b></div>
    <Notice tone="success">Esta resposta não contém seu nome, seu e-mail nem o nome da sua instituição.</Notice>
    <button type="button" className="button button-primary" onClick={onHome} data-testid="button-success-home">Voltar à página inicial <ArrowRight size={16} /></button>
  </section><Footer /></main>;
}

function Footer() {
  return <footer className="footer"><Wordmark /><p>Instrumento de pesquisa acadêmica · Validação de conteúdo MCN–PDTIC</p><span>Uma pesquisa sobre requisitos, não sobre uma instituição.</span></footer>;
}

function Routes() {
  return <Switch>
    <Route path="/" component={HomePage} />
    <Route path="/termo" component={TermoPage} />
    <Route component={NotFound} />
  </Switch>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <WouterRouter base={basePath}><RoutedErrorBoundary><Routes /></RoutedErrorBoundary></WouterRouter>;
}

export default App;
