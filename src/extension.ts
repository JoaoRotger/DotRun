import * as path from 'path';
import * as vscode from 'vscode';
import { BuildAction, runDotnet } from './build/dotnet';
import { DOTRUN_LAUNCH, createLaunchConfig, readLaunchProfile, resolveProjectOutput } from './launch';
import { SolutionTreeProvider, TreeNode } from './views/solutionTree';

export async function activate(context: vscode.ExtensionContext) {
	const tree = new SolutionTreeProvider(context.workspaceState);
	context.subscriptions.push(
		vscode.window.registerTreeDataProvider('dotrun.solution', tree)
	);

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

	// Only one DotRun session at a time, like Visual Studio; Stop leaves other debug sessions alone
	let session: vscode.DebugSession | undefined;
	let starting = false;
	const setRunning = (running: boolean) => {
		vscode.commands.executeCommand('setContext', 'dotrun.running', running);
		updateStatusBar();
	};
	context.subscriptions.push(
		vscode.debug.onDidStartDebugSession(s => {
			if (s.configuration[DOTRUN_LAUNCH]) { session = s; setRunning(true); }
		}),
		vscode.debug.onDidTerminateDebugSession(s => {
			if (s === session) { session = undefined; setRunning(false); }
		}),
	);

	const start = (noDebug: boolean) => async () => {
		if (session || starting) {
			vscode.window.showWarningMessage('DotRun: o projeto já está em execução.');
			return;
		}
		const project = tree.startupProject;
		if (!project) {
			vscode.window.showWarningMessage('DotRun: nenhum projeto de inicialização definido.');
			return;
		}

		starting = true;
		try {
			if (!await runDotnet('build', project, tree.configuration)) {
				await vscode.commands.executeCommand('workbench.actions.view.problems');
				return;
			}
			const [output, profile] = await Promise.all([
				resolveProjectOutput(project, tree.configuration),
				readLaunchProfile(project),
			]);
			const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(project));
			await vscode.debug.startDebugging(folder, createLaunchConfig(project, output, profile, noDebug));
		} catch (err) {
			vscode.window.showErrorMessage(`DotRun: falha ao iniciar: ${err instanceof Error ? err.message : err}`);
		} finally {
			starting = false;
		}
	};

	const stop = () => session && vscode.debug.stopDebugging(session);

	const selectConfiguration = async () => {
		const picked = await vscode.window.showQuickPick(
			tree.configurations.map(c => ({ label: c, description: c === tree.configuration ? 'atual' : undefined })),
			{ placeHolder: 'Configuração de build' });
		if (picked) { await tree.setConfiguration(picked.label); }
	};

	// Same list as the Visual Studio dropdown: runnable projects only, alphabetical.
	// If none is detected as runnable, every project is offered instead.
	const selectStartupProject = async () => {
		const candidates = tree.startupCandidates.length > 0 ? tree.startupCandidates : tree.projects;
		const baseDir = tree.solutionPath ? path.dirname(tree.solutionPath) : undefined;
		const picked = await vscode.window.showQuickPick(
			[...candidates].sort((a, b) => a.name.localeCompare(b.name)).map(p => ({
				label: p.name,
				description: p.path === tree.startupProject ? 'atual' : undefined,
				detail: baseDir ? path.relative(baseDir, path.dirname(p.path)) || undefined : undefined,
				path: p.path,
			})),
			{ placeHolder: 'Projeto de inicialização', matchOnDetail: true });
		if (picked) { await tree.setStartupProject(picked.path); }
	};

	const configurationStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
	configurationStatus.command = 'dotrun.selectConfig';
	configurationStatus.tooltip = 'DotRun: configuração de build';
	const startupStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
	startupStatus.command = 'dotrun.selectStartup';
	startupStatus.tooltip = 'DotRun: projeto de inicialização';
	const runStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 98);
	function updateStatusBar() {
		const startup = tree.projects.find(p => p.path === tree.startupProject);
		configurationStatus.text = `$(gear) ${tree.configuration}`;
		startupStatus.text = `$(project) ${startup?.name ?? 'Selecionar projeto'}`;
		runStatus.text = session ? '$(debug-stop) Parar' : '$(debug-start) Iniciar';
		runStatus.command = session ? 'dotrun.stop' : 'dotrun.start';
		runStatus.tooltip = session ? 'DotRun: parar' : 'DotRun: iniciar com debug';
		for (const item of [configurationStatus, startupStatus, runStatus]) {
			if (tree.projects.length > 0) { item.show(); } else { item.hide(); }
		}
	}
	context.subscriptions.push(configurationStatus, startupStatus, runStatus, tree.onDidChangeTreeData(updateStatusBar));

	const commands: Record<string, (...args: any[]) => unknown> = {
		'dotrun.start':        start(false),
		'dotrun.startNoDebug': start(true),
		'dotrun.stop':         stop,
		'dotrun.build':        runOnSolution('build'),
		'dotrun.rebuild':      runOnSolution('rebuild'),
		'dotrun.clean':        runOnSolution('clean'),
		'dotrun.selectConfig': selectConfiguration,
		'dotrun.selectStartup': selectStartupProject,
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
