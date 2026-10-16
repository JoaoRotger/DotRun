# DotRun

Painel estilo Visual Studio para projetos .NET no VS Code: veja a solução, escolha o projeto de inicialização e rode, builde ou debugue sem sair da barra lateral.

> **Status: em desenvolvimento (0.0.1).** O painel e os comandos já estão registrados, mas as ações ainda não estão implementadas. Por enquanto, cada comando só mostra a mensagem "ainda não implementado".

## Funcionalidades

- **Painel "Solução"** na barra de atividades. Ele aparece quando a pasta aberta tem um `.sln`, `.slnx` ou `.csproj`.
- **Barra de ações do painel:**
  - **Iniciar**: roda com debug.
  - **Iniciar sem debug**
  - **Parar**
  - **Build**
  - **Rebuild** (menu `...`)
  - **Clean** (menu `...`)
  - **Selecionar configuração**: Debug, Release etc. (menu `...`)
- **Ações por projeto:**
  - **Buildar este projeto**: botão inline no item.
  - **Definir como projeto de inicialização**: menu de contexto.

Os comandos gerais também ficam na Command Palette (`Ctrl+Shift+P`), com o prefixo **DotRun:**.

## Requisitos

- VS Code 1.140 ou superior
- [.NET SDK](https://dotnet.microsoft.com/download)
- Extensão [C#](https://marketplace.visualstudio.com/items?itemName=ms-dotnettools.csharp) (`ms-dotnettools.csharp`). Ela é instalada automaticamente como dependência.

## Desenvolvimento

### Pré-requisitos

- Node.js 24 ou superior
- Extensão [esbuild Problem Matchers](https://marketplace.visualstudio.com/items?itemName=connor4312.esbuild-problem-matchers). A tarefa de watch usa o matcher `$esbuild-watch`, que vem dessa extensão. O VS Code sugere instalá-la ao abrir o projeto.

### Rodando localmente

```bash
npm install
```

1. Aperte **F5**, ou vá em Run and Debug → **Run Extension**. A tarefa `watch` (esbuild + tsc) roda antes de abrir.
2. Na janela **[Extension Development Host]**, abra uma pasta com um projeto .NET.
3. Abra o ícone do DotRun na barra lateral.

Ao salvar um arquivo, o código recompila sozinho. Na janela de teste, use **Developer: Reload Window** (`Ctrl+R`) para carregar a nova versão.

### Scripts

| Script | O que faz |
| --- | --- |
| `npm run watch` | esbuild e checagem de tipos em modo watch |
| `npm run compile` | checa tipos, roda o lint e gera o bundle em `dist/` |
| `npm run package` | bundle de produção (minificado), usado ao publicar |
| `npm run lint` | ESLint em `src/` |
| `npm test` | roda os testes com `@vscode/test-cli` |

### Estrutura

```text
src/
  extension.ts          # ativação e registro de comandos
  views/solutionTree.ts # TreeDataProvider do painel "Solução"
  test/                 # testes de integração
resources/              # ícones
```

### Empacotando

```bash
npx @vscode/vsce package
```

Gera um `.vsix`, que pode ser instalado com **Extensions: Install from VSIX...**.

## Notas de versão

Veja o [CHANGELOG](CHANGELOG.md).
