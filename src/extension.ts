import * as vscode from 'vscode';
import { SolutionTreeProvider } from './views/solutionTree';

export async function activate(context: vscode.ExtensionContext) {
	const tree = new SolutionTreeProvider();
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('dotrun.solution', tree)
	);

	const stub = (nome: string) => () =>
		vscode.window.showInformationMessage(`${nome}: ainda não implementado`);

	const comandos: Record<string, () => void> = {
		'dotrun.start':        stub('Iniciar'),
		'dotrun.startNoDebug': stub('Iniciar sem debug'),
		'dotrun.stop':         stub('Parar'),
		'dotrun.build':        stub('Build'),
		'dotrun.rebuild':      stub('Rebuild'),
		'dotrun.clean':        stub('Clean'),
		'dotrun.selectConfig': stub('Selecionar configuração'),
		'dotrun.setStartup':   stub('Definir inicialização'),
		'dotrun.buildProject': stub('Buildar projeto'),
	};

	for (const [id, fn] of Object.entries(comandos)) {
		context.subscriptions.push(vscode.commands.registerCommand(id, fn));
	}

	// A extensão também ativa ao rodar um comando pelo palette, então confere de fato se há .NET na pasta
	// antes de mostrar o painel.
	const encontrados = await vscode.workspace.findFiles(
		'**/*.{sln,slnx,csproj}',
		'**/{node_modules,bin,obj}/**',
		1
	);
	await vscode.commands.executeCommand('setContext', 'dotrun.hasSolution', encontrados.length > 0);
}

export function deactivate() {}
