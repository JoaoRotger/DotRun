import * as vscode from 'vscode';

export class SolutionTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private _onDidChange = new vscode.EventEmitter<void>();
	readonly onDidChangeTreeData = this._onDidChange.event;

	refresh() { this._onDidChange.fire(); }

	getTreeItem(item: vscode.TreeItem) { return item; }

	// Vazio por enquanto: o viewsWelcome do package.json mostra a mensagem de estado vazio.
	getChildren(): vscode.TreeItem[] {
		return [];
	}
}
