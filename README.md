# Validação MCN-PDTIC

Instrumento de validação de conteúdo da Matriz de Conformidade Normativa para PDTIC (MCN-PDTIC).
Especialistas avaliam a clareza e a relevância dos 80 requisitos e a abrangência e a aplicabilidade de cada uma das quatro dimensões.

## Como abrir a coleta

Edite o arquivo [`public/config.json`](public/config.json) aqui no GitHub (ícone de lápis) e preencha:

| Campo | O que colocar |
|---|---|
| `estimatedMinutes` | Duração estimada, em minutos (ex.: `40`) |
| `submitUrl` | URL do app da Web da planilha (termina em `/exec`) |
| `contactEmail` | E-mail de contato da pesquisa |

Ao salvar ("Commit changes"), o site é publicado de novo sozinho em 1 a 2 minutos.
Enquanto `submitUrl` ou `estimatedMinutes` estiver vazio, o site mostra "A coleta ainda não está aberta".

O Termo de Participação fica em [`src/pages/termo.tsx`](src/pages/termo.tsx) e é publicado em `/termo`. Ao mudar o texto, suba a versão em [`src/lib/termo.ts`](src/lib/termo.ts); a planilha grava a versão aceita por cada participante.

## Salvar e continuar depois

As respostas são salvas automaticamente no navegador do participante. Ao voltar ao site no mesmo aparelho, ele vê "Bem-vindo de volta" e o botão **Continuar de onde parei**, que leva ao primeiro requisito sem resposta. Nada fica guardado na planilha antes do envio final.

## Onde ficam as respostas

As respostas vão para uma planilha Google privada, pelo script [`planilha/Codigo.gs`](planilha/Codigo.gs).
A aba **Respostas** tem uma linha por especialista; a aba **IVC** é recalculada a cada envio
(limite por item 0,78; limite global 0,80). O formulário não pede nome, e-mail nem instituição.

## Para desenvolvedores

```
npm ci
npm run dev
```
