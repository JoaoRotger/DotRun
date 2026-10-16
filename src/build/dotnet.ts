import * as path from 'path';
import * as vscode from 'vscode';

export type BuildAction = 'build' | 'rebuild' | 'clean';

const LABELS: Record<BuildAction, string> = {
	build: 'Build',
	rebuild: 'Rebuild',
	clean: 'Clean',
};

let running = false;

/** Runs dotnet build/clean on a .sln/.slnx/.csproj as a VS Code task. Resolves to true on exit code 0. */
export async function runDotnet(action: BuildAction, target: string): Promise<boolean> {
	if (running) {
		vscode.window.showWarningMessage('DotRun: já existe um build em andamento.');
		return false;
	}

	running = true;
	try {
		await vscode.workspace.saveAll(false);
		return await executeAndWait(createTask(action, target));
	} finally {
		running = false;
	}
}

function createTask(action: BuildAction, target: string): vscode.Task {
	const args = action === 'clean'
		? ['clean', target]
		: ['build', target, ...(action === 'rebuild' ? ['--no-incremental'] : [])];
	// Full paths and no summary keep $msCompile from missing or duplicating diagnostics
	args.push('-nologo', '/property:GenerateFullPaths=true', '/consoleloggerparameters:NoSummary');

	const execution = new vscode.ProcessExecution('dotnet', args, {
		cwd: path.dirname(target),
		// The .NET 9+ terminal logger rewrites lines in place, which breaks the problem matcher.
		// The env var is used instead of -tl:off because older SDKs reject that switch.
		env: { MSBUILDTERMINALLOGGER: 'off' },
	});

	const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(target));
	const task = new vscode.Task(
		{ type: 'dotrun', action, target },
		folder ?? vscode.TaskScope.Workspace,
		`${LABELS[action]} ${path.basename(target)}`,
		'DotRun',
		execution,
		'$msCompile'
	);
	task.group = vscode.TaskGroup.Build;
	task.presentationOptions = {
		reveal: vscode.TaskRevealKind.Always,
		panel: vscode.TaskPanelKind.Shared,
		clear: true,
	};
	return task;
}

function executeAndWait(task: vscode.Task): Promise<boolean> {
	return new Promise((resolve, reject) => {
		const execution = vscode.tasks.executeTask(task);
		// Subscribed synchronously, so the end event can't fire before we listen
		const subscription = vscode.tasks.onDidEndTaskProcess(async e => {
			if (e.execution === await execution) {
				subscription.dispose();
				resolve(e.exitCode === 0);
			}
		});
		execution.then(undefined, err => {
			subscription.dispose();
			reject(err);
		});
	});
}
