import { Link } from 'wouter';
import { ArrowLeft, Download } from 'lucide-react';
import { TERM_DATE, TERM_VERSION } from '@/lib/termo';

/** Termo de Participação e Uso dos Dados. Mudou o texto? Suba TERM_VERSION em src/lib/termo.ts. */
export default function TermoPage() {
  return (
    <main className="term-page">
      <div className="term-wrap">
        <div className="term-actions no-print">
          <Link href="/" className="button button-outline button-small" data-testid="link-term-back"><ArrowLeft size={15} /> Voltar à avaliação</Link>
          <button type="button" className="button button-primary button-small" onClick={() => window.print()} data-testid="button-term-pdf"><Download size={15} /> Salvar cópia em PDF</button>
        </div>
        <article className="term-doc" data-testid="term-doc">
          <span className="section-number">VERSÃO {TERM_VERSION.replace('v', '')} · {TERM_DATE}</span>
          <h1 className="serif">Termo de Participação e Uso dos Dados</h1>
          <p className="term-subtitle">Validação de conteúdo da Matriz de Conformidade Normativa para PDTIC (MCN-PDTIC)</p>

          <h2>Pesquisa</h2>
          <p>Dissertação do Mestrado Profissional em Administração Pública em Rede Nacional (PROFIAP), Universidade Federal de Roraima (UFRR). Pesquisador: Francisco Laurenilson Sousa Silva. Orientador: Prof. Victor Hugo Lima Alves.</p>

          <h2>Objetivo</h2>
          <p>Avaliar se os 80 requisitos da MCN-PDTIC são claros, relevantes, abrangentes e aplicáveis à análise de um PDTIC. Você avalia o <b>instrumento</b>, não uma instituição nem o PDTIC da UFRR.</p>

          <h2>O que você fará</h2>
          <p>Atribuir notas de 1 a 4 a cada requisito (clareza e relevância) e a cada dimensão (abrangência e aplicabilidade). Se quiser, também pode deixar comentários. O tempo estimado é de <b>40 minutos</b>. Você pode parar e continuar depois: o progresso fica salvo no seu navegador, neste aparelho.</p>

          <h2>Participação voluntária</h2>
          <p>Você pode desistir a qualquer momento antes de enviar, sem nenhum prejuízo. Depois do envio, não é possível localizar nem excluir uma resposta específica, porque nenhuma resposta é identificada.</p>

          <h2>Dados coletados</h2>
          <p>Perfil profissional, anos de experiência, tipo de instituição, as notas e os comentários. <b>Não</b> coletamos nome, e-mail nem o nome da instituição.</p>

          <h2>Uso e guarda</h2>
          <p>As respostas são usadas apenas nesta pesquisa (Lei nº 13.709/2018, arts. 4º, II, “b”, e 7º, IV). Ficam guardadas em planilha institucional da UFRR, com acesso restrito ao pesquisador e ao orientador, por no mínimo cinco anos. São divulgadas somente de forma agregada.</p>

          <h2>Riscos e benefícios</h2>
          <p>O risco é mínimo: basicamente o tempo dedicado. Para evitar qualquer identificação, não inclua dados pessoais nos comentários. O benefício é contribuir para um instrumento público e replicável de avaliação de PDTICs nas IFES. Não há pagamento nem custo para participar.</p>

          <h2>Enquadramento ético</h2>
          <p>Pesquisa de opinião com participantes não identificados, dispensada de registro e avaliação pelo sistema CEP/Conep, nos termos do art. 1º, parágrafo único, I, da Resolução CNS nº 510/2016.</p>

          <h2>Contato</h2>
          <p>lauro.sousa@ufrr.br</p>

          <h2>Consentimento</h2>
          <p>Ao marcar “Li e aceito” e enviar a avaliação, você declara que leu este termo e concorda em participar.</p>

          <p className="term-footer">Termo de Participação e Uso dos Dados · {TERM_VERSION} · {TERM_DATE} · laurosousa.github.io/validacao-mcn-pdtic/termo</p>
        </article>
      </div>
    </main>
  );
}
