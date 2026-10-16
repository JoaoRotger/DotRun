import * as path from 'path';
import * as vscode from 'vscode';
import {
	ProjectNode, SolutionNode, fileNameWithoutExtension, listProjects, parseSln, parseSlnx, sortNodes,
} from '../solution/parser';
import { isExecutableProject } from '../solution/projectFile';

export type TreeNode =
	| { kind: 'solution'; name: string; path: string; children: SolutionNode[] }
	| SolutionNode;

const EXCLUDE = '**/{node_modules,bin,obj}/**';
const STARTUP_KEY = 'dotrun.startupProject';

export class SolutionTreeProvider implements vscode.TreeDataProvider<TreeNode> {
	private _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChange.event;

	private roots: TreeNode[] = [];
	private _solutionPath?: string;
	private _projects: ProjectNode[] = [];
	private _startupProject?: string;

	constructor(private readonly state: vscode.Memento) {}

	get solutionPath() { return this._solutionPath; }
	get projects(): readonly ProjectNode[] { return this._projects; }
	get startupProject() { return this._startupProject; }

	async load() {
		try {
			await this.readWorkspace();
			this._startupProject = await this.resolveStartupProject();
		} catch (err) {
			this.roots = [];
			this._solutionPath = undefined;
			this._projects = [];
			this._startupProject = undefined;
			vscode.window.showErrorMessage(`DotRun: falha ao ler a solução: ${err instanceof Error ? err.message : err}`);
		}
		await vscode.commands.executeCommand('setContext', 'dotrun.hasSolution', this.roots.length > 0);
		this._onDidChange.fire();
	}

	async setStartupProject(projectPath: string) {
		this._startupProject = projectPath;
		await this.state.update(STARTUP_KEY, projectPath);
		this._onDidChange.fire();
	}

	private async readWorkspace() {
		const solution = pickSolution(await vscode.workspace.findFiles('**/*.{sln,slnx}', EXCLUDE));
		if (solution) {
			const text = await readText(solution);
			const dir = path.dirname(solution.fsPath);
			const children = solution.fsPath.toLowerCase().endsWith('.slnx')
				? parseSlnx(text, dir)
				: parseSln(text, dir);
			this.roots = [{ kind: 'solution', name: fileNameWithoutExtension(solution.fsPath), path: solution.fsPath, children }];
			this._solutionPath = solution.fsPath;
			this._projects = listProjects(children);
			return;
		}

		// No solution: show the loose projects
		const csprojs = await vscode.workspace.findFiles('**/*.csproj', EXCLUDE);
		const projects = sortNodes(csprojs.map(u => ({ kind: 'project', name: fileNameWithoutExtension(u.fsPath), path: u.fsPath })));
		this.roots = projects;
		this._solutionPath = undefined;
		this._projects = listProjects(projects);
	}

	// The user's pick wins while it's still in the solution; otherwise the first runnable project
	private async resolveStartupProject(): Promise<string | undefined> {
		const saved = this.state.get<string>(STARTUP_KEY);
		const match = saved && this._projects.find(p => samePath(p.path, saved));
		if (match) { return match.path; }

		for (const project of this._projects) {
			try {
				if (isExecutableProject(await readText(vscode.Uri.file(project.path)))) {
					return project.path;
				}
			} catch {
				// Project listed in the solution but missing on disk
			}
		}
		return undefined;
	}

	getTreeItem(node: TreeNode): vscode.TreeItem {
		switch (node.kind) {
			case 'solution': {
				const count = listProjects(node.children).length;
				const item = new vscode.TreeItem(
					`Solução '${node.name}' (${count} projeto${count === 1 ? '' : 's'})`,
					vscode.TreeItemCollapsibleState.Expanded);
				item.resourceUri = vscode.Uri.file(node.path);
				item.tooltip = node.path;
				item.contextValue = 'solution';
				return item;
			}
			case 'folder': {
				const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
				item.iconPath = vscode.ThemeIcon.Folder;
				item.contextValue = 'folder';
				return item;
			}
			case 'project': {
				const isStartup = this._startupProject !== undefined && samePath(node.path, this._startupProject);
				const item = new vscode.TreeItem(
					isStartup ? { label: node.name, highlights: [[0, node.name.length]] } : node.name,
					vscode.TreeItemCollapsibleState.None);
				item.resourceUri = vscode.Uri.file(node.path);
				item.description = isStartup ? 'inicialização' : undefined;
				item.tooltip = node.path;
				item.contextValue = 'project';
				return item;
			}
		}
	}

	getChildren(node?: TreeNode): TreeNode[] {
		if (!node) { return this.roots; }
		return node.kind === 'project' ? [] : node.children;
	}
}

// With several solutions, take the one closest to the root (ties: alphabetical)
function pickSolution(uris: vscode.Uri[]): vscode.Uri | undefined {
	const depth = (u: vscode.Uri) => u.fsPath.split(/[\\/]/).length;
	return [...uris].sort((a, b) => depth(a) - depth(b) || a.fsPath.localeCompare(b.fsPath))[0];
}

async function readText(uri: vscode.Uri): Promise<string> {
	return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
}

function samePath(a: string, b: string): boolean {
	const normalize = (p: string) => process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
	return normalize(a) === normalize(b);
}
