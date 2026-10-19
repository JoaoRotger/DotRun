import * as vscode from 'vscode';
import { BuildAction, runDotnet } from './build/dotnet';
import { SolutionTreeProvider, TreeNode } from './views/solutionTree';

export async function activate(context: vscode.ExtensionContext) {
	const tree = new SolutionTreeProvider(context.workspaceState);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('dotrun.solution', tree)
	);

	const stub = (name: string) => () =>
		vscode.window.showInformationMessage(`${name}: ainda não implementado`);

	// Without a solution, fall back to the startup project (or the only project there is)
	const buildTarget = () =>
		tree.solutionPath ?? tree.startupProject ?? (tree.projects.length === 1 ? tree.projects[0].path : undefined);

	const runOnSolution = (action: BuildAction) => async () => {
		const target = buildTarget();
		if (!target) {
			vscode.window.showWarningMessage(
				'DotRun: nenhuma solução encontrada. Defina um projeto de inicialização ou use "Buildar este projeto".');
			return;
		}
		await runDotnet(action, target, tree.configuration);
	};

	const selectConfiguration = async () => {
		const picked = await vscode.window.showQuickPick(
			tree.configurations.map(c => ({ label: c, description: c === tree.configuration ? 'atual' : undefined })),
			{ placeHolder: 'Configuração de build' });
		if (picked) { await tree.setConfiguration(picked.label); }
	};

	const configurationStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	configurationStatus.command = 'dotrun.selectConfig';
	configurationStatus.tooltip = 'DotRun: configuração de build';
	const updateConfigurationStatus = () => {
		configurationStatus.text = `$(gear) ${tree.configuration}`;
		if (tree.projects.length > 0) { configurationStatus.show(); } else { configurationStatus.hide(); }
	};
	context.subscriptions.push(configurationStatus, tree.onDidChangeTreeData(updateConfigurationStatus));

	const commands: Record<string, (...args: any[]) => unknown> = {
		'dotrun.start':        stub('Iniciar'),
		'dotrun.startNoDebug': stub('Iniciar sem debug'),
		'dotrun.stop':         stub('Parar'),
		'dotrun.build':        runOnSolution('build'),
		'dotrun.rebuild':      runOnSolution('rebuild'),
		'dotrun.clean':        runOnSolution('clean'),
		'dotrun.selectConfig': selectConfiguration,
		'dotrun.setStartup':   (node?: TreeNode) => node?.kind === 'project' && tree.setStartupProject(node.path),
		'dotrun.buildProject': (node?: TreeNode) => node?.kind === 'project' && runDotnet('build', node.path, tree.configuration),
	};

	for (const [id, fn] of Object.entries(commands)) {
		context.subscriptions.push(vscode.commands.registerCommand(id, fn));
	}

	// The extension also activates when a command runs from the palette, so load() checks that
	// the folder really has .NET projects before showing the panel.
	await tree.load();

	let timer: ReturnType<typeof setTimeout> | undefined;
	const reload = () => {
		clearTimeout(timer);
		timer = setTimeout(() => tree.load(), 300);
	};
	const watcher = vscode.workspace.createFileSystemWatcher('**/*.{sln,slnx,csproj}');
	context.subscriptions.push(
		watcher,
		watcher.onDidCreate(reload),
		watcher.onDidChange(reload),
		watcher.onDidDelete(reload),
		{ dispose: () => clearTimeout(timer) }
	);
}

export function deactivate() {}
